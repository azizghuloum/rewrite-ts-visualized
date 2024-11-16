import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AST } from "./AST";
import { ASTExpr, ASTHighlight, ASTList } from "./ASTVis";
import { Editor } from "./Editor";
import { array_to_ll } from "./llhelpers";
import * as Zipper from "./zipper";
import { initial_step, next_step, Step } from "./expander";

const load_tsx_parser = async () =>
  Parser.init({
    locateFile(scriptName: string, _scriptDirectory: string) {
      const m: { [k: string]: string } = {
        "tree-sitter.wasm": treesitter_wasm_url,
      };
      return m[scriptName] ?? scriptName;
    },
  })
    .then(() => {
      return Parser.Language.load(tsx_url);
    })
    .then((tsx) => {
      const parser = new Parser();
      parser.setLanguage(tsx);
      return parser;
    });

function absurdly(node: Parser.SyntaxNode): AST {
  const children = node.children;
  if (children.length === 0) {
    switch (node.type) {
      case "number":
      case "identifier":
      case "property_identifier": {
        return { type: "atom", tag: node.type, content: node.text };
      }
      case node.text: {
        return { type: "atom", tag: "other", content: node.text };
      }
      default:
        throw new Error(`unknown atom ${node.type}:${node.text}`);
    }
  } else {
    return {
      type: "list",
      tag: node.type,
      content: array_to_ll(
        children.filter((x) => x.type !== "comment").map(absurdly)
      ),
    };
  }
}

type ExampleProps = {
  parser: Parser;
  code: string;
  onChange?: (code: string) => void;
};

function zipper_to_view(zipper: Zipper.Loc): React.ReactElement {
  return Zipper.reconvert(
    zipper,
    (x) => <ASTHighlight>{x}</ASTHighlight>,
    (x) => <ASTExpr ast={x} />,
    (tag, children) => <ASTList tag={tag} items={children} />
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

function parse_with(parser: Parser, code: string): AST {
  const node = parser.parse(code);
  const ast = absurdly(node.rootNode);
  return ast;
}

function StepperView({
  step,
  step_number,
}: {
  step: Step;
  step_number: number;
}) {
  const zipper_view = zipper_to_view(step.loc);
  return (
    <div>
      <div>
        <div>step: {step_number}</div>
        {step.type}
      </div>
      <div
        className="code"
        style={{
          marginLeft: "1em",
          height: "80vh",
          maxHeight: "80vh",
          overflowY: "scroll",
        }}
      >
        {zipper_view}
      </div>
    </div>
  );
}

function Example({ parser, code, onChange }: ExampleProps) {
  const [state, setState] = useState(
    initial_state(initial_step(parse_with(parser, code)))
  );
  useEffect(
    () => setState(initial_state(initial_step(parse_with(parser, code)))),
    [next_step, code]
  );
  useEffect(() => {
    const handle = setTimeout(() => {
      setState((state) => {
        if (state.error !== null || state.step_number === max_fuel)
          return state;
        const next_state = (() => {
          try {
            const step = next_step(state.last_step);
            const next_state: State = {
              prev_steps: [...state.prev_steps, state.last_step],
              last_step: step,
              step_number: state.step_number + 1,
              error:
                step.type === "Error"
                  ? `Error: ${step.reason}`
                  : step.type === "DEBUG"
                    ? `DEBUG: ${JSON.stringify(step.info)}`
                    : null,
              pointer: state.pointer,
            };
            return next_state;
          } catch (err) {
            const next_state: State = { ...state, error: String(err) };
            return next_state;
          }
        })();
        return next_state;
      });
    }, 100);
    return () => {
      clearTimeout(handle);
    };
  }, [state]);
  const max = state.step_number;
  const [display_step, display_number] =
    state.pointer === null || state.pointer >= state.prev_steps.length
      ? [state.last_step, state.step_number]
      : [state.prev_steps[state.pointer], state.pointer];
  return (
    <div>
      <input
        style={{ display: "block", width: "100%" }}
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
      {state.error === null ? (
        <div>no error</div>
      ) : (
        <div style={{ color: "red" }}>{state.error}</div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          border: "2px solid #444",
        }}
      >
        <div style={{ flexBasis: "50%", flexGrow: "100" }}>
          <Editor code={code} onChange={onChange} />
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
    localStorage.getItem("sample_program") ?? "console.log('hello world!');"
  );
  useEffect(() => {
    load_tsx_parser().then(set_parser);
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
