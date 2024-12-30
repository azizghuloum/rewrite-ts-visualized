import { AST } from "./serialize";
import { llmap, llreverse, ll_to_array } from "./llhelpers";
import { Loc } from "./syntax-structures";
import { list_tag } from "./tags";
import * as prettier from "prettier/standalone";
import * as prettier_ts from "prettier/plugins/typescript";
import * as prettier_estree from "prettier/plugins/estree";

type ns = string | ns[];

const children_need_semi: { [k in list_tag]?: boolean } = {
  program: true,
  statement_block: true,
  slice: true,
};

function loc_to_ns(loc: Loc): ns {
  /* */

  function push_semi(ns: ns, semi: string): ns {
    if (typeof ns === "string") {
      return ns.endsWith(";") ? ns : [ns, semi];
    } else {
      if (ns.length === 0) {
        return semi;
      } else {
        return ns.map((x, i) => (i === ns.length - 1 ? push_semi(x, semi) : x));
      }
    }
  }
  function stx_to_ns(stx: AST, semi: boolean): ns {
    if (stx.tag === "empty_statement") return "";
    if (stx.tag === "slice") return ll_to_array(stx.content).map((x) => stx_to_ns(x, true));
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
            return stx.content;
          case "ERROR":
            return "!!!ERROR!!! " + stx.content + " !!!ERROR!!!";
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
        return ["(", ls, ")"];
      default:
        return ls;
    }
  }

  const lp = "/*>>>*/";
  const rp = "/*<<<*/";

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
    return [lp, ns, rp];
  }

  function strip_top(ns: ns): ns {
    if (Array.isArray(ns) && ns.length === 3 && ns[0] === lp && ns[2] === rp) {
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

function ns_to_string(main_ns: ns) {
  const ac: string[] = [];

  function push(x: string) {
    ac.push(" ");
    ac.push(x);
  }

  function conv(ns: ns) {
    if (typeof ns === "string") {
      push(ns);
    } else {
      ns.forEach(conv);
    }
  }

  conv(main_ns);
  ac.push("\n");

  return ac[0] === " " ? ac.slice(1) : ac;
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

export async function pprint(loc: Loc, prettify: boolean) {
  const src = ns_to_string(loc_to_ns(loc)).join("");
  return prettify ? await pretty_print(src) : src;
}
