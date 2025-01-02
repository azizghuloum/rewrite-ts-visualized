import { AST, source } from "./ast";
import { llmap, llreverse, ll_to_array } from "./llhelpers";
import { Loc, STX } from "./syntax-structures";
import { list_tag } from "./tags";
import * as prettier from "prettier/standalone";
import * as prettier_ts from "prettier/plugins/typescript";
import * as prettier_estree from "prettier/plugins/estree";
import { SourceMapGenerator } from "source-map";
import { Base64 } from "js-base64";
import { assert } from "./assert";

type n = { val: string; src: source | false };
type ns = n | ns[];

const children_need_semi: { [k in list_tag]?: boolean } = {
  program: true,
  statement_block: true,
  slice: true,
};

function loc_to_ns(loc: Loc): ns {
  /* */

  function push_semi(ns: ns, semi: string): ns {
    if (Array.isArray(ns)) {
      if (ns.length === 0) {
        return { val: semi, src: false };
      } else {
        return ns.map((x, i) => (i === ns.length - 1 ? push_semi(x, semi) : x));
      }
    } else {
      return ns.val.endsWith(";") ? ns : [ns, { val: semi, src: false }];
    }
  }
  type src = (AST | STX)["src"];
  function wrap_src(src: src, content: string): ns {
    if (!src) return { val: content, src: false };
    if (src.type !== "origin") return wrap_src(src.src, content);
    return { val: content, src };
  }
  function stx_to_ns(stx: AST | STX, semi: boolean): ns {
    if (stx.tag === "empty_statement") return [];
    if (stx.tag === "slice")
      return ll_to_array(stx.content)
        .map((x) => stx_to_ns(x, true))
        .filter((x) => (Array.isArray(x) ? x.length > 0 : x.val.length > 0));
    if (semi && stx.tag !== "other") return push_semi(stx_to_ns(stx, false), `;`);
    switch (stx.type) {
      case "list": {
        const semi = children_need_semi[stx.tag] ?? false;
        const ls = ll_to_array(stx.content).map((x) => stx_to_ns(x, semi));
        return ns_list(stx.tag, ls);
      }
      case "atom": {
        switch (stx.tag) {
          case "number":
          case "identifier":
          case "jsx_text":
          case "string":
          case "regex":
          case "other":
            return wrap_src(stx.src, stx.content);
          case "ERROR":
            return [
              wrap_src(stx.src, "!!!ERROR!!!"),
              wrap_src(stx.src, stx.content),
              wrap_src(stx.src, "!!!ERROR!!!"),
            ];
          default:
            const invalid: never = stx;
            throw invalid;
        }
      }
      default:
        const invalid: never = stx;
        throw invalid;
    }
  }

  function ns_list(tag: list_tag, ls: ns[]): ns {
    switch (tag) {
      case "arrow_function":
      case "binary_expression":
      case "unary_expression":
      case "ternary_expression":
        return [lparen, ls, rparen];
      default:
        return ls;
    }
  }

  function path_to_ns(path: Loc["p"], ns: ns): ns {
    switch (path.type) {
      case "top":
        return ns;
      case "node": {
        const { tag, l, p, r } = path;
        const csemi = children_need_semi[tag] ?? false;
        return path_to_ns(p, [
          ll_to_array(llreverse(llmap(l, (x) => stx_to_ns(x, csemi)))),
          ns,
          ll_to_array(llmap(r, (x) => stx_to_ns(x, csemi))),
        ]);
      }
    }
  }

  function mark_top(ns: ns): ns {
    return [lpointer, ns, rpointer];
  }

  function strip_top(ns: ns): ns {
    if (Array.isArray(ns) && ns.length === 3 && ns[0] === lpointer && ns[2] === rpointer) {
      return ns[1];
    } else {
      return ns;
    }
  }

  {
    const semi = loc.p.type === "node" && (children_need_semi[loc.p.tag] ?? false);
    return strip_top(path_to_ns(loc.p, mark_top(stx_to_ns(loc.t, semi))));
  }
}

const lparen: n = { val: "(", src: false };
const rparen: n = { val: ")", src: false };
const space: n = { val: " ", src: false };
const newline: n = { val: "\n", src: false };
const lpointer: n = { val: "/*>>>*/", src: false };
const rpointer: n = { val: "/*<<<*/", src: false };

function ns_flatten(main_ns: ns) {
  const ac: n[] = [];

  function push(x: n) {
    ac.push(space);
    ac.push(x);
  }

  function conv(ns: ns) {
    if (Array.isArray(ns)) {
      ns.forEach(conv);
    } else {
      push(ns);
    }
  }

  conv(main_ns);

  return ac[0] === space ? ac.slice(1) : ac;
}

type map_options = {
  filename: string;
  resolve: (cuid: string) => Promise<string>;
};

function uniq(ls: string[]): string[] {
  return Object.keys(Object.fromEntries(ls.map((x) => [x, x])));
}

async function add_src_map(code: string, ls: n[], options: map_options): Promise<string> {
  const srcmap = new SourceMapGenerator({
    file: options.filename,
  });
  let line = 0;
  let column = 0;

  const paths: { [cuid: string]: string } = Object.fromEntries(
    await Promise.all(
      uniq(ls.map((x) => (x.src ? x.src.cuid : "")).filter((x) => x.length > 0)).map(
        async (cuid) => [cuid, await options.resolve(cuid)],
      ),
    ),
  );

  function emit_src(src: source) {
    assert(typeof src.s !== "number");
    const source = paths[src.cuid];
    assert(source !== undefined);
    srcmap.addMapping({
      generated: { line: line + 1, column },
      original: { line: src.s.line + 1, column: src.s.column },
      source,
      name: src.name,
    });
    return;
  }
  function advance_loc(val: string) {
    const lines = val.split(/\(\r\n\)|\r|\n/g);
    if (lines.length === 1) {
      column += lines[0].split("").length;
    } else {
      line += lines.length - 1;
      column = lines[lines.length - 1].split("").length;
    }
  }
  ls.forEach(({ src, val }) => {
    if (src) emit_src(src);
    advance_loc(val);
  });
  const map_string = srcmap.toString();
  const base64 = Base64.encode(map_string);
  return `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}\n`;
}

export async function pretty_print(code: string) {
  try {
    const pretty = await prettier.format(code, {
      parser: "typescript",
      plugins: [prettier_ts, prettier_estree],
      printWidth: 100,
    });
    return pretty;
  } catch (err) {
    return `/* !!not pretty!! */\n${code}\n`;
  }
}

type options = {
  prettify: boolean;
  map?: map_options;
};

export async function pprint(loc: Loc, options: options): Promise<string> {
  const ls = ns_flatten(loc_to_ns(loc));
  const code = ls.map((x) => x.val).join("");
  return options.prettify
    ? await pretty_print(code)
    : options.map
      ? add_src_map(code, ls, options.map)
      : code;
}
