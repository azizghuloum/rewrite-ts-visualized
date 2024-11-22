import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useMemo, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ASTExpr, ASTExprSpan, ASTHighlight, ASTList, ASTListSpan } from "./ASTVis";
import { Editor, EditorP } from "./Editor";
import * as Zipper from "./zipper";
import { initial_step, next_step, Step } from "./expander";
import { Loc } from "./syntax-structures";
import { core_patterns } from "./syntax-core-patterns";
import { load_parser, parse_with } from "./parser-loader";
import { pprint } from "./pprint";

type ExampleProps = {
  parser: Parser;
  code: string;
  onChange?: (code: string) => void;
};

function zipper_to_view(zipper: Loc): React.ReactElement {
  return Zipper.reconvert(
    zipper,
    (x) => <ASTHighlight>{x}</ASTHighlight>,
    (x) => <ASTExpr ast={x} />,
    (tag, children) => <ASTList tag={tag} items={children} />,
  );
}

type State = {
  prev_steps: Step[];
  last_step: Step;
  step_number: number;
  error: string | null;
  pointer: number | null;
};

const max_fuel = 100;

function initial_state(step: Step): State {
  return {
    prev_steps: [],
    last_step: step,
    step_number: 0,
    error: null,
    pointer: null,
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

function timeout(delay: number, f: () => void): () => void {
  if (delay <= 0) {
    const handle = requestAnimationFrame(f);
    return () => cancelAnimationFrame(handle);
  } else {
    const handle = setTimeout(f, delay);
    return () => clearTimeout(handle);
  }
}

function Example({ parser, code, onChange }: ExampleProps) {
  function init_state(): State {
    const parse = (code: string) => parse_with(parser, code);
    const patterns = core_patterns(parse);
    return initial_state(initial_step(parse(code), patterns));
  }
  const [state, setState] = useState(init_state());
  useEffect(() => setState(init_state()), [next_step, code]);
  useEffect(() => {
    const cancel = timeout(0, () => {
      setState((state) => {
        if (state.error !== null || state.step_number === max_fuel || !state.last_step.next)
          return state;
        const next_state = (() => {
          try {
            const step = next_step(state.last_step);
            const next_state: State = {
              prev_steps: [...state.prev_steps, state.last_step],
              last_step: step,
              step_number: state.step_number + 1,
              error: step.error ? `${step.name}: ${step.error}` : null,
              pointer: state.pointer,
            };
            return next_state;
          } catch (err) {
            console.error(err);
            const next_state: State = { ...state, error: String(err) };
            return next_state;
          }
        })();
        return next_state;
      });
    });
    return cancel;
  }, [state]);
  const max = state.step_number;
  const [display_step, display_number] =
    state.pointer === null || state.pointer >= state.prev_steps.length
      ? [state.last_step, state.step_number]
      : [state.prev_steps[state.pointer], state.pointer];
  const code_to_display = useMemo(() => pprint(display_step.loc), [display_step]);
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
        <div style={{ flexBasis: "40%", flexGrow: "0" }}>
          <StepperView step={display_step} step_number={display_number} />
        </div>
      </div>
    </div>
  );
}

function Expander() {
  const [parser, set_parser] = useState<Parser | null>(null);
  const [sample, setSample] = useState(
    localStorage.getItem("sample_program") ?? "console.log('hello world!');",
  );
  useEffect(() => {
    load_parser({
      parser_url: treesitter_wasm_url,
      lang_url: tsx_url,
    }).then(set_parser);
    return undefined;
  }, []);
  if (!parser) return <div>loading ...</div>;

  return (
    <>
      <Example
        code={sample}
        onChange={(code) => {
          setSample(code);
          localStorage.setItem("sample_program", code);
        }}
        parser={parser}
      />
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Expander />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
