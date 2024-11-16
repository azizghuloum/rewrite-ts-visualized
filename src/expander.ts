import { assert } from "./assert";
import { AST, atom_tag } from "./AST";
import {
  CompilationUnit,
  Context,
  extend_unit,
  init_top_level,
  new_rib_id,
  Rib,
  Wrap,
  resolve,
  Resolution,
  extend_rib,
  extend_context,
} from "./STX";
import {
  change,
  go_down,
  go_next,
  go_right,
  isolate,
  Loc,
  mkzipper,
  wrap_loc,
} from "./zipper";

export type Step =
  | {
      type: "ExpandProgram";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      counter: number;
    }
  | {
      type: "PreExpandBody";
      loc: Loc;
      rib: Rib;
      unit: CompilationUnit;
      context: Context;
      counter: number;
      k: (props: {
        loc: Loc;
        rib: Rib;
        context: Context;
        counter: number;
      }) => Step;
    }
  | {
      type: "PreExpandForms";
      loc: Loc;
      rib: Rib;
      counter: number;
      unit: CompilationUnit;
      context: Context;
      k: (props: {
        loc: Loc;
        rib: Rib;
        context: Context;
        counter: number;
      }) => Step;
    }
  | {
      type: "FindForm";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      k: (args: { loc: Loc; resolution: Resolution | undefined }) => Step;
    }
  | {
      type: "PostExpandBody";
      loc: Loc;
      unit: CompilationUnit;
      counter: number;
      k: (args: { loc: Loc }) => Step;
    }
  | { type: "SyntaxError"; loc: Loc; reason: string }
  | { type: "DEBUG"; loc: Loc; info: any };

export function initial_step(ast: AST): Step {
  const { stx, counter, unit, context } = init_top_level(ast);
  const loc: Loc = mkzipper(stx);
  return {
    type: "ExpandProgram",
    loc,
    counter,
    unit,
    context,
  };
}

const list_handlers: { [tag: string]: "descend" | "done" } = {
  lexical_declaration: "done",
  expression_statement: "descend",
  call_expression: "descend",
  arguments: "descend",
  binary_expression: "descend",
  array: "descend",
  member_expression: "descend",
};

const atom_handlers: { [tag in atom_tag]: "next" | "stop" } = {
  identifier: "stop",
  type_identifier: "stop",
  property_identifier: "stop",
  number: "next",
  jsx_text: "next",
  string_fragment: "next",
  other: "next",
};

function find_form<T>({
  loc,
  unit,
  context,
  k,
}: {
  loc: Loc;
  unit: CompilationUnit;
  context: Context;
  k: (args: { loc: Loc; resolution: Resolution | undefined }) => T;
}): T {
  function done(loc: Loc): T {
    return k({ loc, resolution: undefined });
  }
  function find_form(loc: Loc): T {
    switch (loc.t.type) {
      case "atom": {
        const { tag, content, wrap } = loc.t;
        const action = atom_handlers[tag];
        switch (action) {
          case "stop": {
            const resolution = resolve(
              content,
              wrap,
              context,
              unit,
              "normal_env"
            );
            switch (resolution.type) {
              case "unbound":
                return go_next(loc, find_form, done);
            }
            throw new Error(`${tag} ${content} resolved as ${resolution.type}`);
          }
          case "next": {
            return go_next(loc, find_form, done);
          }
          case undefined:
            throw new Error(`no table entry for atom ${tag}:${content}`);
          default:
            const invalid: never = action;
            throw invalid;
        }
      }
      case "list": {
        const { tag } = loc.t;
        const action = list_handlers[tag];
        if (action === undefined) {
          throw new Error(`no stop_table entry for ${tag}`);
        }
        switch (action) {
          case "descend":
            return go_down(loc, find_form);
          case "done":
            return done(loc);
          default:
            const invalid: never = action;
            throw invalid;
        }
      }
      default:
        const invalid: never = loc.t;
        throw invalid;
    }
  }
  return find_form(loc);
}

function debug({ loc, info }: { loc: Loc; info?: any }): Step {
  return { type: "DEBUG", loc, info };
}

function extract_lexical_declaration_bindings<T>(
  loc: Loc,
  rib: Rib,
  context: Context,
  counter: number,
  sk: (args: { loc: Loc; rib: Rib; context: Context; counter: number }) => T,
  fk: (loc: Loc, reason: string) => T
): T {
  function after_vars(ls: Loc, rib: Rib, context: Context, counter: number): T {
    if (ls.t.type === "atom" && ls.t.tag === "other") {
      switch (ls.t.content) {
        case ";":
          return go_next(
            ls,
            (loc) => fk(loc, "expected nothing after semicolon"),
            (loc) => sk({ loc, rib, context, counter })
          );
        case ",":
          return go_right(
            ls,
            (loc) => get_vars(loc, rib, context, counter),
            (loc) => fk(loc, "expected variable after ','")
          );
      }
    }
    return fk(ls, "expected a ',' or a ';'");
  }

  function get_vars(ls: Loc, rib: Rib, context: Context, counter: number): T {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(ls, (loc) => {
        const stx = loc.t;
        if (stx.type === "atom" && stx.tag === "identifier") {
          return extend_rib(
            rib,
            stx.content,
            stx.wrap.marks,
            counter,
            "normal_env",
            ({ rib, counter, label }) =>
              extend_context(
                context,
                counter,
                label,
                "lexical",
                stx.content,
                ({ context, counter }) =>
                  go_next(
                    ls,
                    (loc) => after_vars(loc, rib, context, counter),
                    (loc) => sk({ loc, rib, context, counter })
                  )
              ),
            (reason) => fk(loc, reason)
          );
        } else {
          throw new Error(`HERE2 ${stx.type}:${stx.tag}`);
        }
      });
    } else {
      return fk(ls, `expected a variable declaration; found ${ls.t.tag}`);
    }
  }
  return go_down(loc, (loc) => {
    if (loc.t.type === "atom") {
      if (
        loc.t.tag === "other" &&
        (loc.t.content === "const" || loc.t.content === "let")
      ) {
        return go_right(
          loc,
          (loc) => get_vars(loc, rib, context, counter),
          (loc) => fk(loc, "no bindings after keyword")
        );
      } else {
        throw new Error(`HERE? ${loc.t.type}:${loc.t.tag}`);
      }
    } else {
      return fk(loc, "expected keyword const or let");
    }
  });
}

export function next_step(step: Step): Step {
  switch (step.type) {
    case "ExpandProgram": {
      assert(step.loc.t.tag === "program");
      const rib: Rib = {
        type: "rib",
        types_env: {},
        normal_env: {},
      };
      const [rib_id, counter] = new_rib_id(step.counter);
      const wrap: Wrap = { marks: null, subst: [{ rib_id }, null] };
      return go_down(wrap_loc(step.loc, wrap), (loc) => {
        return {
          type: "PreExpandBody",
          loc,
          rib,
          unit: extend_unit(step.unit, rib_id, rib), // rib is empty
          context: step.context,
          counter,
          k: ({ loc, rib, counter, context }) => {
            // rib is filled
            // context is filled also
            const unit = extend_unit(step.unit, rib_id, rib);
            // unit is now filled
            return {
              type: "PostExpandBody",
              loc,
              counter,
              unit,
              k: ({ loc }) =>
                debug({
                  loc,
                  info: { msg: "finished postexpand" },
                }),
            };
          },
        };
      });
    }
    case "PreExpandBody": {
      return {
        type: "PreExpandForms",
        loc: isolate(step.loc),
        rib: step.rib,
        counter: step.counter,
        unit: step.unit,
        context: step.context,
        k: ({ loc, rib, context, counter }) =>
          go_next<Step>(
            change(step.loc, loc), // unisolate
            (loc) => ({
              type: "PreExpandBody",
              loc,
              rib,
              counter,
              context,
              unit: step.unit,
              k: step.k,
            }),
            (loc) => step.k({ loc, rib, context, counter })
          ),
      };
    }
    case "PreExpandForms": {
      return {
        type: "FindForm",
        loc: step.loc,
        unit: step.unit,
        context: step.context,
        k: ({ loc, resolution }) => {
          if (resolution === undefined) {
            assert(loc.p.type === "top");
            if (loc.t.type === "list") {
              switch (loc.t.tag) {
                case "lexical_declaration": {
                  return extract_lexical_declaration_bindings(
                    loc,
                    step.rib,
                    step.context,
                    step.counter,
                    step.k,
                    (loc, reason) => {
                      return { type: "SyntaxError", loc, reason };
                    }
                  );
                }
                default: {
                  assert(list_handlers[loc.t.tag] === "descend");
                  return step.k({
                    loc,
                    rib: step.rib,
                    counter: step.counter,
                    context: step.context,
                  });
                }
              }
            } else {
              return step.k({
                loc,
                rib: step.rib,
                counter: step.counter,
                context: step.context,
              });
            }
          } else {
            throw new Error("macro form");
          }
        },
      };
    }
    case "FindForm":
      return find_form(step);
  }
  throw new Error(`${step.type} is not implemented`);
}
