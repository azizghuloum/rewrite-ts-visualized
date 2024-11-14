import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AST } from "./AST";
import { ASTExpr, ASTHighlight, ASTList } from "./ASTVis";
import { Editor } from "./Editor";
import { array_to_ll, LL } from "./llhelpers";
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
    return { type: "atom", tag: node.type, content: node.text };
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
  prev_steps: LL<Step>;
  last_step: Step;
  fuel_left: number;
  error: string | null;
};

function initial_state(step: Step): State {
  return {
    prev_steps: null,
    last_step: step,
    fuel_left: 100,
    error: null,
  };
}

function parse_with(parser: Parser, code: string): AST {
  const node = parser.parse(code);
  const ast = absurdly(node.rootNode);
  return ast;
}

function Stepper({ code, parser }: { code: string; parser: Parser }) {
  const [state, setState] = useState(
    initial_state(initial_step(parse_with(parser, code)))
  );
  const zipper_view = zipper_to_view(state.last_step.loc);
  useEffect(
    () => setState(initial_state(initial_step(parse_with(parser, code)))),
    [next_step, code]
  );
  useEffect(() => {
    const handle = setTimeout(() => {
      setState((state) => {
        if (state.error !== null || state.fuel_left === 0) return state;
        const next_state = (() => {
          try {
            const step = next_step(state.last_step);
            console.log("one step done");
            const next_state: State = {
              prev_steps: [state.last_step, state.prev_steps],
              last_step: step,
              fuel_left: state.fuel_left - 1,
              error: null,
            };
            return next_state;
          } catch (err) {
            const next_state: State = { ...state, error: String(err) };
            return next_state;
          }
        })();
        return next_state;
      });
    }, 200);
    return () => {
      clearTimeout(handle);
    };
  }, [state]);
  return (
    <div>
      <div>
        <div>{state.fuel_left} fuel left</div>
        {state.error === null ? (
          <div>no error</div>
        ) : (
          <div style={{ color: "red" }}>{state.error}</div>
        )}
        {state.last_step.type}
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
  return (
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
        <Stepper code={code} parser={parser} />
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
