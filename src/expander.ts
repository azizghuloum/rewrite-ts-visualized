import { assert } from "./assert";
import { AST, atom_tag } from "./AST";
import {
  CompilationUnit,
  Context,
  extend_unit,
  init_top_level,
  new_subst_label,
  Rib,
  Wrap,
  resolve,
  Resolution,
  STX,
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
      unit: CompilationUnit;
      context: Context;
      counter: number;
      k: (props: { loc: Loc; bindings: Lexical[] }) => Step;
    }
  | {
      type: "PreExpandForms";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      k: (props: { loc: Loc; bindings: Lexical[] }) => Step;
    }
  | {
      type: "FindForm";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      k: (args: { loc: Loc; resolution: Resolution | undefined }) => Step;
    }
  | { type: "Error"; loc: Loc; reason: string }
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

type Lexical = {
  stx: STX;
};

function extract_lexical_declaration_bindings<T>(
  loc: Loc,
  sk: (bindings: Lexical[]) => T,
  fk: (loc: Loc, reason: string) => T
): T {
  const bindings: Lexical[] = [];

  function get_vars(ls: Loc): T {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(ls, (loc) => {
        const stx = loc.t;
        if (stx.type === "atom" && stx.tag === "identifier") {
          bindings.push({ stx });
          return go_right(ls, get_vars, () => sk(bindings));
        } else {
          throw new Error(`HERE2 ${stx.type}:${stx.tag}`);
        }
      });
    } else if (
      ls.t.type === "atom" &&
      ls.t.tag === "other" &&
      ls.t.content === ";"
    ) {
      return go_right(
        ls,
        (loc) => fk(loc, "unexpected token after semicolon"),
        () => sk(bindings)
      );
    } else {
      throw new Error(`HERE3 ${ls.t.type}:${ls.t.tag}`);
    }
  }
  return go_down(loc, (loc) => {
    if (loc.t.type === "atom") {
      if (
        loc.t.tag === "other" &&
        (loc.t.content === "const" || loc.t.content === "let")
      ) {
        return go_right(loc, get_vars, (loc) =>
          fk(loc, "no bindings after keyword")
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
      const [rib_id, counter] = new_subst_label(step.counter);
      const wrap: Wrap = { marks: null, subst: [{ rib_id }, null] };
      return go_down(wrap_loc(step.loc, wrap), (loc) => {
        return {
          type: "PreExpandBody",
          loc,
          unit: extend_unit(step.unit, rib_id, rib),
          context: step.context,
          counter,
          k: ({ loc, bindings }) => {
            console.log(bindings);
            return debug({
              loc,
              info: { msg: "finished preexpand", bindings },
            });
          },
        };
      });
    }
    case "PreExpandBody": {
      return {
        type: "PreExpandForms",
        loc: isolate(step.loc),
        unit: step.unit,
        context: step.context,
        k: ({ loc, bindings }) =>
          go_next<Step>(
            change(step.loc, loc), // unisolate
            (loc) => ({
              type: "PreExpandBody",
              loc,
              context: step.context,
              unit: step.unit,
              counter: step.counter,
              k: ({ loc, bindings: next_bindings }) =>
                step.k({ loc, bindings: [...bindings, ...next_bindings] }),
            }),
            (loc) => step.k({ loc, bindings })
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
                    (bindings) => step.k({ loc, bindings }),
                    (loc, reason) => {
                      return { type: "Error", loc, reason };
                    }
                  );
                }
                default: {
                  assert(list_handlers[loc.t.tag] === "descend");
                  return step.k({ loc, bindings: [] });
                }
              }
            } else {
              return step.k({ loc, bindings: [] });
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
