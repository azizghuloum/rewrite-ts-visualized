import { AST } from "./serialize";
import { ll_to_array } from "./llhelpers";
import { Loc } from "./syntax-structures";
import { reconvert } from "./zipper";
import { list_tag } from "./AST";
import * as prettier from "prettier/standalone";
import * as prettier_ts from "prettier/plugins/typescript";
import * as prettier_estree from "prettier/plugins/estree";

type ns = string | ns[];

function loc_to_ns(loc: Loc): ns {
  /* */

  function stx_to_ns(stx: AST): ns {
    switch (stx.type) {
      case "list": {
        const ls = ll_to_array(stx.content).map(stx_to_ns);
        return ns_list(stx.tag, ls);
      }
      case "atom": {
        switch (stx.tag) {
          case "number":
          case "identifier":
          case "property_identifier":
          case "shorthand_property_identifier":
          case "type_identifier":
          case "jsx_text":
          case "string_fragment":
          case "regex_pattern":
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
      case "binary_expression":
        return ["(", ls, ")"];
      case "program":
      case "statement_block":
        return ls.map((x) => [x, "\n"]);
    }
    return ls;
  }

  const lp = "/*>>>*/";
  const rp = "/*<<<*/";

  function loc_to_ns(loc: Loc): ns {
    return reconvert(loc, (x) => [lp, x, rp], stx_to_ns, ns_list);
  }

  function strip_top(ns: ns): ns {
    if (Array.isArray(ns) && ns.length === 3 && ns[0] === lp && ns[2] === rp) {
      return ns[1];
    } else {
      return ns;
    }
  }

  return strip_top(loc_to_ns(loc));
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
  return ac;
}

export async function pprint(loc: Loc) {
  const src = ns_to_string(loc_to_ns(loc)).join("");
  try {
    const pretty = await prettier.format(src, {
      parser: "typescript",
      plugins: [prettier_ts, prettier_estree],
    });
    return pretty;
  } catch (err) {
    return src;
  }
}