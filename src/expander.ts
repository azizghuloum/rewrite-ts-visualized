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
} from "./STX";
import {
  change,
  go_down,
  go_next,
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
      k: (props: { new_loc: Loc }) => Step;
    }
  | {
      type: "PreExpandForms";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      k: (props: { new_loc: Loc }) => Step;
    }
  | {
      type: "FindForm";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      k: (args: { new_loc: Loc; resolution: Resolution | undefined }) => Step;
    }
  | { type: "DEBUG"; loc: Loc };

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

const stop_table: { [tag: string]: "descend" | "stop" } = {
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

function find_form(
  loc: Loc,
  unit: CompilationUnit,
  context: Context
): [Loc, Resolution | undefined] {
  function done(loc: Loc): [Loc, undefined] {
    return [loc, undefined];
  }
  function find_form(loc: Loc): [Loc, Resolution | undefined] {
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
        const action = stop_table[tag];
        if (action === undefined) {
          throw new Error(`no stop_table entry for ${tag}`);
        }
        switch (action) {
          case "descend":
            return go_down(loc, find_form);
          case "stop":
            throw new Error(`stopped at ${tag}`);
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
          k: () => {
            throw new Error("HERE?");
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
        k: ({ new_loc }) => {
          const loc = change(step.loc, new_loc);
          return go_next<Step>(
            loc,
            (loc) => ({
              type: "PreExpandBody",
              loc,
              context: step.context,
              unit: step.unit,
              counter: step.counter,
              k: step.k,
            }),
            (loc) => step.k({ new_loc: loc })
          );
        },
      };
    }
    case "PreExpandForms": {
      return {
        type: "FindForm",
        loc: step.loc,
        unit: step.unit,
        context: step.context,
        k: ({ new_loc, resolution }) => {
          if (resolution === undefined) {
            assert(new_loc.p.type === "top");
            return step.k({ new_loc });
          } else {
            throw new Error("special form");
          }
        },
      };
    }
    case "FindForm": {
      const { loc, unit, context, k } = step;
      const [new_loc, resolution] = find_form(loc, unit, context);
      return k({ new_loc, resolution });
    }
  }
  throw new Error(`${step.type} is not implemented`);
}
