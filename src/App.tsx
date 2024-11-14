import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AST } from "./AST";
import { LL, Marks, STX, Subst, top_mark, WSTX } from "./STX";
import { ASTExpr, ASTHighlight, ASTList } from "./ASTVis";
import { Editor } from "./Editor";
import * as Zipper from "zipper/src/tagged-constructive-zipper";

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

function array_to_ll<X>(a: X[]): LL<X> {
  let ll: LL<X> = null;
  for (let i = a.length - 1; i >= 0; i--) ll = [a[i], ll];
  return ll;
}

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

type Loc = Zipper.Loc<string, STX>;

function zipper_to_view(zipper: Loc): React.ReactElement {
  return Zipper.reconvert(
    zipper,
    (x) => <ASTHighlight>{x}</ASTHighlight>,
    (x) => <ASTExpr ast={x} />,
    (tag, children) => <ASTList tag={tag} items={children} />
  );
}

type Step = { loc: Loc } & {
  type: "ExpandProgram";
};

function initial_step(code: string, parser: Parser): Step {
  const node = parser.parse(code);
  const root_ast = absurdly(node.rootNode);
  const root_stx: STX = {
    type: "wrapped",
    marks: [top_mark, null],
    subst: null,
    content: root_ast,
  };
  const loc: Loc = Zipper.mkzipper(root_stx);
  return { type: "ExpandProgram", loc };
}

function push_wrap(marks: Marks, subst: Subst): (stx: STX | WSTX) => STX {
  return (stx: STX | WSTX) => {
    switch (stx.type) {
      case "wrapped":
        throw new Error("merge wraps not implemented");
      case "list":
      case "atom":
        return { type: "wrapped", marks, subst, content: stx };
    }
  };
}

function llmap<X, Y>(ls: LL<X>, f: (x: X) => Y): LL<Y> {
  return ls === null ? null : [f(ls[0]), llmap(ls[1], f)];
}

function expose(stx: STX & { type: "wrapped" }): STX {
  const { marks, subst, content } = stx;
  switch (content.type) {
    case "atom":
      return stx;
    case "list":
      return {
        type: "list",
        tag: content.tag,
        content: llmap(content.content, push_wrap(marks, subst)),
      };
    default:
      const invalid: never = content;
      throw invalid;
  }
}

function go_down(loc: Loc): Loc {
  return Zipper.go_down(loc, (head, cb) => {
    switch (head.type) {
      case "wrapped": {
        const exposed = expose(head);
        switch (exposed.type) {
          case "wrapped":
            throw new Error("cannot go down an atom");
          case "list":
            return cb(exposed.tag, exposed.content);
          default:
            const invalid: never = exposed;
            throw invalid;
        }
      }
      case "list": {
        return cb(head.tag, head.content);
      }
      default:
        const invalid: never = head;
        throw invalid;
    }
  });
}

function assert(condition: boolean) {
  if (!condition) {
    throw new Error("condition failed");
  }
}

function next_step(step: Step): Step {
  const loc = step.loc;
  if (loc.t.type === "wrapped" && loc.t.content.type !== "atom") {
    return { ...step, loc: Zipper.change(loc, expose(loc.t)) };
  }
  const tree =
    loc.t.type === "wrapped" && loc.t.content.type !== "atom"
      ? expose(loc.t)
      : loc.t;
  console.log("tick");
  switch (step.type) {
    case "ExpandProgram": {
      //return { ...step, loc: go_down(loc) };
      // const forms = down_and_right("program", loc);
      // console.log(tree.tag);
      // const d = go_down(loc);
      // assert(d.t.type === "list" && d.t.tag === "program");
    }
  }
  throw new Error(`${step.type} is not implemented`);
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

function Stepper({ code, parser }: { code: string; parser: Parser }) {
  const [state, setState] = useState(initial_state(initial_step(code, parser)));
  const zipper_view = zipper_to_view(state.last_step.loc);
  useEffect(
    () => setState(initial_state(initial_step(code, parser))),
    [next_step, code]
  );
  useEffect(() => {
    requestAnimationFrame(() => {
      setState((state) => {
        if (state.error !== null || state.fuel_left === 0) return state;
        const next_state = (() => {
          try {
            const step = next_step(state.last_step);
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
    });
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
        style={{ marginLeft: "1em", maxHeight: "80vh", overflowY: "scroll" }}
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
      <Stepper code={code} parser={parser} />
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
