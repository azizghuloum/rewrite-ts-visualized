import { AST } from "./serialize";
import { ll_to_array } from "./llhelpers";
import { Loc } from "./syntax-structures";
import { reconvert } from "./zipper";
import { atom_tag, list_tag } from "./AST";

type prec = "atom" | list_tag | binop | { type: "binexpr"; op: binop | "unknown" };

type binop = "+" | "-" | "*" | "/";

const binop_table: { [k in binop]: binop } = { "-": "-", "+": "+", "*": "*", "/": "/" };

type ds = { prec: prec; content: (ds | string)[] };

function loc_to_ds(loc: Loc): ds {
  /* */

  function stx_to_ds(stx: AST): ds {
    switch (stx.type) {
      case "list": {
        const ls = ll_to_array(stx.content).map(stx_to_ds);
        return ds_list(stx.tag, ls);
      }
      case "atom": {
        return { prec: atom_prec(stx.tag, stx.content), content: [stx.content] };
      }
      default:
        const invalid: never = stx;
        throw invalid;
    }
  }

  function atom_prec(tag: atom_tag, content: string): prec {
    if (tag === "other") {
      const opprec = (binop_table as { [k: string]: binop })[content];
      return opprec === undefined ? "atom" : opprec;
    }
    return "atom";
  }

  function binop_prec(op: ds | undefined): prec {
    if (!op || typeof op.prec !== "string") return { type: "binexpr", op: "unknown" };
    const opprec = (binop_table as { [k: string]: binop })[op.prec];
    if (opprec === undefined) return { type: "binexpr", op: "unknown" };
    return { type: "binexpr", op: opprec };
  }

  function list_prec(tag: list_tag, ls: ds[]): prec {
    switch (tag) {
      case "binary_expression":
        return binop_prec(ls[1]);
      default:
        return tag;
    }
  }

  function ds_list(tag: list_tag, ls: ds[]): ds {
    return { prec: list_prec(tag, ls), content: ls };
  }

  function loc_to_ds(loc: Loc): ds {
    return reconvert(
      loc,
      (x) => ({ prec: x.prec, content: ["/**/", x, "/**/"] }),
      stx_to_ds,
      ds_list,
    );
  }

  return loc_to_ds(loc);
}

function ds_to_strings(main_ds: ds): string[] {
  const ac: string[] = [];

  function need_space(x: string, y: string) {
    const m0 = x.match(/(.)$/);
    const m1 = y.match(/^(.)/);
    const c0 = m0 ? m0[1] : "";
    const c1 = m1 ? m1[1] : "";
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

  function nonstr(x: ds | string, f: (x: ds) => void) {
    if (typeof x === "string") {
      push(x);
    } else {
      f(x);
    }
  }

  function conv_expr(x: ds | string) {
    nonstr(x, (x) => {
      switch (x.prec) {
        default:
          throw new Error(`unhandled ${x.prec}`);
      }
    });
  }

  function push_atom(x: (ds | string)[]) {
    x.forEach((x) => nonstr(x, conv_part));
  }

  function conv_part(x: ds | string) {
    nonstr(x, (x) => {
      switch (x.prec) {
        case "atom":
          return push_atom(x.content);
        case "variable_declarator":
          return conv_parts(x.content);
        default:
          throw new Error(`unhandled ${x.prec}`);
      }
    });
  }

  function conv_parts(x: (ds | string)[]) {
    x.forEach(conv_part);
  }

  function conv_decl(x: ds | string) {
    nonstr(x, (x) => {
      switch (x.prec) {
        case "lexical_declaration":
          return conv_parts(x.content);
        default: {
          conv_expr(x);
          push(";");
        }
      }
    });
  }

  function conv_prog(x: ds) {
    if (x.prec === "program") {
      x.content.forEach(conv_decl);
    } else {
      conv_decl(x);
    }
  }

  conv_prog(main_ds);
  return ac;
}

export function pprint(loc: Loc): string {
  return ds_to_strings(loc_to_ds(loc)).join("");
}
