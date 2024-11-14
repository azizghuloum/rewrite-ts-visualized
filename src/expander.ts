import { AST } from "./AST";
import {
  CompilationUnit,
  Context,
  extend_unit,
  init_top_level,
  new_subst_label,
  Rib,
  Wrap,
} from "./STX";
import { go_down, Loc, mkzipper, wrap_loc } from "./zipper";

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
    }
  | {
      type: "PreExpandBodyForm";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      counter: number;
      k: (props: {
        t: Loc;
        unit: CompilationUnit;
        context: Context;
        counter: number;
      }) => Step;
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

function assert(condition: boolean) {
  if (!condition) {
    throw new Error("condition failed");
  }
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
      const [label, counter] = new_subst_label(step.counter);
      const wrap: Wrap = { marks: null, subst: [{ rib: label }, null] };
      return go_down(wrap_loc(step.loc, wrap), (loc) => {
        return {
          type: "PreExpandBody",
          loc,
          unit: extend_unit(step.unit, label, rib),
          context: step.context,
          counter,
        };
      });
    }
    case "PreExpandBody": {
      return {
        type: "PreExpandBodyForm",
        counter: step.counter,
        unit: step.unit,
        context: step.context,
        loc: { type: "loc", t: step.loc.t, p: { type: "top" } },
        k: ({}) => {
          throw new Error("PostPreExpage");
        },
      };
    }
  }
  throw new Error(`${step.type} is not implemented`);
}
