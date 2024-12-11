import { assert } from "./assert";
import { extend_context_lexical, extend_rib, lexical_extension } from "./stx";
import { syntax_error } from "./stx-error";
import { CompilationUnit, Context, Loc } from "./syntax-structures";
import { list_tag } from "./tags";
import { go_down, go_right, go_up } from "./zipper";

export type goodies = {
  loc: Loc;
  lexical: lexical_extension;
  context: Context;
  counter: number;
  unit: CompilationUnit;
};

function skip_optional(loc: Loc, kwd: string): Loc {
  if (loc.t.content === kwd) {
    return go_right(loc, (loc) => loc, syntax_error);
  } else {
    return loc;
  }
}

function skip_required(loc: Loc, kwd_options: string[]): Loc {
  if (loc.t.type === "atom" && kwd_options.includes(loc.t.content)) {
    return go_right(loc, (loc) => loc, syntax_error);
  } else {
    syntax_error(loc, `expected '${kwd_options}'`);
  }
}

export function gen_binding({
  loc,
  lexical,
  counter,
  context,
  unit,
  sort,
}: goodies & { sort: "type" | "value" }): Omit<goodies, "loc"> & { name: string } {
  const stx = loc.t;
  assert(stx.type === "atom" && stx.tag === "identifier", stx);
  assert(lexical.extensible);
  const { rib, rib_id } = lexical;
  const env_type = { type: "types_env" as const, value: "normal_env" as const }[sort];
  return extend_rib(
    rib,
    stx.content,
    stx.wrap.marks,
    counter,
    env_type,
    ({ rib, counter, label }) =>
      extend_context_lexical(
        context,
        counter,
        label,
        { type: "type" as const, value: "lexical" as const }[sort],
        stx.content,
        ({ context, counter, name }) => ({
          lexical: { extensible: true, rib, rib_id },
          context,
          counter,
          name,
          unit,
        }),
      ),
    (reason) => syntax_error(loc, reason),
  );
}

function lexical_declaration({ loc, lexical, context, counter, unit }: goodies): Promise<goodies> {
  async function after_vars({ loc, lexical, context, counter, unit }: goodies): Promise<goodies> {
    if (loc.t.type === "atom" && loc.t.tag === "other") {
      switch (loc.t.content) {
        case ";":
          return go_right(
            loc,
            (loc) => syntax_error(loc, "expected nothing after semicolon"),
            (loc) => ({ loc, lexical, context, counter, unit }),
          );
        case ",":
          return go_right(
            loc,
            (loc) => get_vars(loc, lexical, context, counter),
            (loc) => syntax_error(loc, "expected variable after ','"),
          );
      }
    }
    syntax_error(loc, "expected a ',' or a ';'");
  }
  async function get_vars(ls: Loc, lexical: lexical_extension, context: Context, counter: number) {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(
        ls,
        (loc) => {
          const goodies = gen_binding({ loc, lexical, counter, context, unit, sort: "value" });
          return go_right(
            ls,
            (loc) => after_vars({ ...goodies, loc }),
            (loc) => Promise.resolve({ ...goodies, loc }),
          );
        },
        syntax_error,
      );
    } else {
      syntax_error(ls, `expected a variable declaration; found ${ls.t.tag}`);
    }
  }
  return go_down(
    loc,
    (loc) =>
      get_vars(
        skip_required(skip_optional(loc, "export"), ["let", "const"]),
        lexical,
        context,
        counter,
      ),
    syntax_error,
  );
}

function type_alias_declaration({
  loc,
  lexical,
  context,
  counter,
  unit,
}: goodies): Promise<goodies> {
  async function after_type(loc: Loc) {
    assert(loc.t.type === "atom" && loc.t.tag === "identifier", "expected an identifier");
    const gs = gen_binding({ loc, lexical, counter, context, unit, sort: "type" });
    return { ...gs, loc: go_up(loc) };
  }
  return go_down(
    loc,
    (loc) => after_type(skip_required(skip_optional(loc, "export"), ["type"])),
    syntax_error,
  );
}

type preexpand_list_handler = (goodies: goodies) => Promise<goodies>;

export const preexpand_list_handlers: { [k in list_tag]?: preexpand_list_handler } = {
  lexical_declaration,
  type_alias_declaration,
};
