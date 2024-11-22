import { AST } from "./serialize";
import { ll_to_array } from "./llhelpers";
import { Loc } from "./syntax-structures";
import { reconvert } from "./zipper";
import { atom_tag, list_tag } from "./AST";
import * as prettier from "prettier";

type binop = "+" | "-" | "*" | "/";

const binop_table: { [k in binop]: binop } = { "-": "-", "+": "+", "*": "*", "/": "/" };

type dst =
  | { type: "op"; name: binop }
  | { type: "misc"; text: string }
  | { type: "binexpr"; op: binop }
  | { type: "highlight"; of: dst }
  | { type: "list"; tag: list_tag };

type ds = { type: dst; content: ds[] };

function loc_to_ds(loc: Loc): ds {
  /* */

  function other_atom(content: string): dst {
    switch (content) {
      case "+":
        return { type: "op", name: "+" };
      case "-":
        return { type: "op", name: "-" };
      case "*":
        return { type: "op", name: "*" };
      case "/":
        return { type: "op", name: "/" };
      default:
        return { type: "misc", text: content };
    }
  }

  function stx_to_ds(stx: AST): ds {
    switch (stx.type) {
      case "list": {
        const ls = ll_to_array(stx.content).map(stx_to_ds);
        return ds_list(stx.tag, ls);
      }
      case "atom": {
        switch (stx.tag) {
          case "other":
            return { type: other_atom(stx.content), content: [] };
        }
        return { type: { type: "misc", text: stx.content }, content: [] };
      }
      default:
        const invalid: never = stx;
        throw invalid;
    }
  }

  function ds_list(tag: list_tag, ls: ds[]): ds {
    switch (tag) {
      case "binary_expression": {
        const op = ls[1];
        if (op && op.type.type === "op") {
          return { type: { type: "binexpr", op: op.type.name }, content: ls };
        }
      }
    }
    return { type: { type: "list", tag }, content: ls };
  }

  function loc_to_ds(loc: Loc): ds {
    return reconvert(
      loc,
      (x) => ({ type: { type: "highlight", of: x.type }, content: [x] }),
      stx_to_ds,
      ds_list,
    );
  }

  return loc_to_ds(loc);
}

function ds_to_strings(main_ds: ds): string[] {
  const ac: string[] = [];

  function need_space(x: string, y: string) {
    const m0 = x.length === 1 ? [x, x] : x.match(/(.)$/);
    const m1 = y.length === 1 ? [y, y] : y.match(/^(.)/);
    const c0 = m0 ? m0[1] : "";
    const c1 = m1 ? m1[1] : "";
    if (c0 === "\n") return false;
    if (c1 === ";") return false;
    if (["="].includes(c1)) return true;
    return true;
  }

  function push(x: string) {
    if (need_space(ac[ac.length - 1] || "(", x)) {
      ac.push(" ");
    }
    ac.push(x);
  }

  function newline() {
    ac.push("\n");
  }

  function handle_context(c: dst, k: () => void) {
    const pre = (() => {
      switch (c.type) {
        case "op":
          return c.name;
        case "misc":
          return c.text;
        case "binexpr":
          return "";
        case "highlight":
          return "/**/";
        case "list":
          return "";
        default: {
          const invalid: never = c;
          throw invalid;
        }
      }
    })();
    if (pre) push(pre);
    k();
    const post = (() => {
      switch (c.type) {
        case "op":
          return "";
        case "misc":
          return "";
        case "binexpr":
          return "";
        case "highlight":
          return "/**/";
        case "list":
          return "";
        default: {
          const invalid: never = c;
          throw invalid;
        }
      }
    })();
    if (post) push(post);
  }

  function handle_mismatch(p: dst | null, c: dst, k: () => void): void {
    if (p === null) {
      return k();
    }
    switch (p.type) {
      case "highlight": {
        newline();
        handle_mismatch(p.of, c, k);
        newline();
        return;
      }
    }
    return k();
  }

  function conv(x: ds, ctxt: dst | null) {
    handle_mismatch(ctxt, x.type, () =>
      handle_context(x.type, () => x.content.forEach((c) => conv(c, x.type))),
    );
  }

  conv(main_ds, null);
  return ac;
}

export async function pprint(loc: Loc) {
  const src = ds_to_strings(loc_to_ds(loc)).join("");
  const pretty = await prettier.format(src, { parser: "typescript" });
  return pretty;
}
