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

function preexpand_lexical_declaration({
  loc,
  lexical,
  context,
  counter,
  unit,
}: goodies): Promise<goodies> {
  function after_vars({ loc, lexical, context, counter, unit }: goodies): goodies {
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
  function get_vars(
    ls: Loc,
    lexical: lexical_extension,
    context: Context,
    counter: number,
  ): goodies {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(
        ls,
        (loc) => {
          const goodies = gen_binding({
            loc,
            lexical,
            counter,
            context,
            unit,
            sort: "value",
          });
          return go_right(
            ls,
            (loc) => after_vars({ ...goodies, loc }),
            (loc) => ({ ...goodies, loc }),
          );
        },
        syntax_error,
      );
    } else {
      syntax_error(ls, `expected a variable declaration; found ${ls.t.tag}`);
    }
  }

  function handle_let_or_const(loc: Loc) {
    switch (loc.t.content) {
      case "const":
      case "let":
        return go_right(
          loc,
          (loc) => get_vars(loc, lexical, context, counter),
          (loc) => syntax_error(loc, "no bindings after keyword"),
        );
      default:
        syntax_error(loc, "expected keyword const or let");
    }
  }

  function main(loc: Loc) {
    return go_down(
      loc,
      (loc) => {
        switch (loc.t.content) {
          case "const":
          case "let":
            return handle_let_or_const(loc);
          case "export":
            return go_right(loc, handle_let_or_const, syntax_error);
          default:
            syntax_error(loc, "expected keyword const or let");
        }
      },
      syntax_error,
    );
  }
  return Promise.resolve(main(loc));
}

function preexpand_type_alias_declaration({
  loc,
  lexical,
  context,
  counter,
  unit,
}: goodies): Promise<goodies> {
  function after_type(loc: Loc) {
    assert(loc.t.type === "atom" && loc.t.tag === "identifier", "expected an identifier");
    const gs = gen_binding({ loc, lexical, counter, context, unit, sort: "type" });
    return { ...gs, loc: go_up(loc) };
  }
  function main() {
    return go_down(
      loc,
      (loc) => {
        switch (loc.t.content) {
          case "type":
            return go_right(loc, after_type, syntax_error);
          case "export":
            return go_right(
              loc,
              (loc) => {
                assert(loc.t.content === "type", "expected 'type' keyword");
                return go_right(loc, after_type, syntax_error);
              },
              syntax_error,
            );
          default:
            syntax_error(loc);
        }
      },
      syntax_error,
    );
  }
  return Promise.resolve(main());
}

type preexpand_list_handler = (goodies: goodies) => Promise<goodies>;

export const preexpand_list_handlers: { [k in list_tag]?: preexpand_list_handler } = {
  lexical_declaration: preexpand_lexical_declaration,
  type_alias_declaration: preexpand_type_alias_declaration,
};
