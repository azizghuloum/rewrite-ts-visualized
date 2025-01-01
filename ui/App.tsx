import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ASTExpr, ASTHighlight, ASTList, ASTListTag } from "./ASTVis";
import { Editor, EditorP } from "./Editor";
import * as Zipper from "../src/zipper";
import { initial_step } from "../src/expander";
import { Loc } from "../src/syntax-structures";
import { core_patterns } from "../src/syntax-core-patterns";
import { parse } from "../src/parse";
import { pprint } from "../src/pprint";
import { StxError, syntax_error } from "../src/stx-error";
import { preexpand_helpers } from "../src/preexpand-helpers";
import { get_globals, init_global_context } from "../src/global-module";

type ExampleProps = {
  code: string;
  onChange?: (code: string) => void;
};

function zipper_to_view(zipper: Loc): React.ReactElement {
  return Zipper.reconvert(
    zipper,
    (x) => <ASTHighlight>{x}</ASTHighlight>,
    (x) => <ASTExpr ast={x} />,
    (tag, children) => <ASTList tag={<ASTListTag tag={tag} />} items={children} />,
  );
}

type Step = {
  name: string;
  loc: Loc;
  error?: string | undefined;
  info?: any;
};

type State = {
  prev_steps: Step[];
  last_step: Step;
  step_number: number;
  error: string | null;
  pointer: number | null;
  code_id: number;
};

const global_code_counter = (() => {
  let counter = 0;
  return () => ++counter;
})();

function initial_state(loc: Loc): State {
  return {
    prev_steps: [],
    last_step: { loc, name: "Initial State" },
    step_number: 0,
    error: null,
    pointer: null,
    code_id: global_code_counter(),
  };
}

function StepperView({ step, step_number }: { step: Step; step_number: number }) {
  const zipper_view = zipper_to_view(step.loc);
  return (
    <div>
      <div>
        <div>step: {step_number}</div>
        {step.info ? (
          <span style={{ fontWeight: "bold" }}>
            {step.name}: {JSON.stringify(step.info)}
          </span>
        ) : (
          <span style={{ fontWeight: "bold" }}>{step.name}</span>
        )}
      </div>
      <div
        className="code"
        style={{
          marginLeft: "1em",
          height: "75vh",
          maxHeight: "75vh",
          overflowY: "scroll",
        }}
      >
        {zipper_view}
      </div>
    </div>
  );
}

function Example({ code, onChange }: ExampleProps) {
  type expand = (helpers: preexpand_helpers) => Promise<{ loc: Loc }>;
  function init_state(code: string): [State, expand] {
    const cuid = "example";
    const [loc0, expand] = initial_step(parse(code, cuid), cuid, ["es2024.full"]);
    return [initial_state(loc0), expand];
  }
  const globals = get_globals("es2024.full");
  const patterns = core_patterns(parse);
  const [global_unit, global_context] = init_global_context(patterns, globals);
  const [state, setState] = useState(init_state(code)[0]);
  useEffect(() => {
    setState((_old_state) => {
      const [my_state, expand] = init_state(code);
      function record(step: Step) {
        setState((state) => {
          if (state.code_id !== my_state.code_id) return state; // in case the code changed while we're still expanding
          return {
            ...state,
            prev_steps: [...state.prev_steps, state.last_step],
            last_step: step,
            step_number: state.step_number + 1,
            error: step.error ? `${step.name}: ${step.error}` : null,
            pointer: state.pointer,
          };
        });
      }
      const helpers: preexpand_helpers = {
        manager: {
          resolve_import(loc) {
            syntax_error(loc, `import is not supported in gui`);
          },
          resolve_label(_label) {
            throw new Error(`resolving labels is not supported in gui`);
          },
          get_import_path(_cuid) {
            throw new Error(`imports are not supported in gui`);
          },
          resolve_rib(_rib_id, _cuid) {
            throw new Error(`imports are not supported in gui`);
          },
        },
        global_unit,
        global_context,
        inspect(loc, reason, k) {
          record({ name: "Inspect", loc, error: undefined, info: reason });
          return k();
        },
      };
      setTimeout(async () => {
        try {
          const { loc } = await expand(helpers);
          record({ name: "DONE", loc });
        } catch (err) {
          if (err instanceof StxError) {
            record(err);
          } else {
            console.error(err);
            throw err;
          }
        }
      }, 0);
      return my_state;
    });
  }, [code]);
  const max = state.step_number;
  const [display_step, display_number] =
    state.pointer === null || state.pointer >= state.prev_steps.length
      ? [state.last_step, state.step_number]
      : [state.prev_steps[state.pointer], state.pointer];
  const code_to_display = useMemo(() => pprint(display_step.loc, true), [display_step]);
  return (
    <div>
      <input
        style={{
          display: "block",
          width: "100%",
        }}
        type="range"
        min={0}
        max={max}
        value={state.pointer === null ? max : state.pointer}
        onChange={(e) => {
          const value: number = (e.target as any).value;
          if (value === max) {
            setState((s) => ({ ...s, pointer: null }));
          } else {
            setState((s) => ({ ...s, pointer: value }));
          }
        }}
      />
      {state.error !== null && (
        <div style={{ color: "red" }}>
          {state.error} at step {state.step_number}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          border: "2px solid #444",
        }}
      >
        <div style={{ flexBasis: "60%", flexGrow: "100" }}>
          <Editor code={code} onChange={onChange} />
          <hr />
          <EditorP code={code_to_display} />
        </div>
        <div style={{ flexBasis: "40%", flexGrow: "0", marginLeft: ".5em", marginRight: ".5em" }}>
          <StepperView step={display_step} step_number={display_number} />
        </div>
      </div>
    </div>
  );
}

const sample_program = `
define_rewrite_rules(
  [where, expr.where(a = b, rest), ((a) => expr.where(rest))(b)],
  [where, expr.where(a = b),       ((a) => expr)(b)],
  [where, expr.where(),            expr],
);
  
console.log(x + y).where(x = 1, y = x + 2);
`;

function Expander() {
  const [sample, setSample] = useState(
    localStorage.getItem("sample_program") ??
      sample_program
        .split("\n")
        .filter((x) => x)
        .join("\n"),
  );
  return (
    <Example
      code={sample}
      onChange={(code) => {
        setSample((_prev_code) => code);
        localStorage.setItem("sample_program", code);
      }}
    />
  );
}

const router = createBrowserRouter([
  {
    path: "/rewrite-ts-visualized",
    element: <Expander />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
