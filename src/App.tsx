import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AST } from "./AST";
import {
  antimark,
  CompilationUnit,
  LL,
  Marks,
  new_subst_label,
  Rib,
  STX,
  top_mark,
  Wrap,
} from "./STX";
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

type Step =
  | { type: "ExpandProgram"; loc: Loc; counter: number }
  | {
      type: "PreExpandBody";
      loc: Loc;
      unit: CompilationUnit;
      counter: number;
    }
  | {
      type: "PreExpandBodyForm";
      loc: Loc;
      unit: CompilationUnit;
      counter: number;
      k: (props: { t: Loc; unit: CompilationUnit; counter: number }) => Step;
    }
  | { type: "DEBUG"; loc: Loc };

function initial_step(code: string, parser: Parser): Step {
  const node = parser.parse(code);
  const root_ast = absurdly(node.rootNode);

  const marks: Marks = [top_mark, null];
  const subst = null;
  const wrap = { marks, subst };
  const root_stx: STX = (() => {
    switch (root_ast.type) {
      case "atom":
        return {
          type: "atom",
          wrap,
          tag: root_ast.tag,
          content: root_ast.content,
        };
      case "list":
        return {
          type: "list",
          wrap,
          tag: root_ast.tag,
          content: root_ast.content,
        };
      default:
        const invalid: never = root_ast;
        throw invalid;
    }
  })();

  const loc: Loc = Zipper.mkzipper(root_stx);
  return { type: "ExpandProgram", loc, counter: 0 };
}

function is_top_marked(wrap: Wrap): boolean {
  function loop_marks(marks: Marks): boolean {
    if (marks === null) return false;
    if (marks[0] === top_mark && marks[1] === null) return true;
    return loop_marks(marks[1]);
  }
  return loop_marks(wrap.marks);
}

function llappend<X>(a1: LL<X>, a2: LL<X>): LL<X> {
  return a1 === null ? a2 : [a1[0], llappend(a1[1], a2)];
}

function merge_wraps(outerwrap: Wrap, innerwrap?: Wrap): Wrap {
  if (innerwrap === undefined) return outerwrap;
  if (is_top_marked(outerwrap)) {
    throw new Error("merge of top-marked outer");
  }
  if (outerwrap.marks && innerwrap.marks && innerwrap.marks[0] === antimark) {
    throw new Error("found antimark");
  } else {
    return {
      marks: llappend(outerwrap.marks, innerwrap.marks),
      subst: llappend(outerwrap.subst, innerwrap.subst),
    };
  }
}

function push_wrap(outerwrap: Wrap): (stx: AST | STX) => STX {
  return (stx: STX | AST) => {
    const wrap = merge_wraps(outerwrap, stx.wrap);
    switch (stx.type) {
      case "list": {
        return {
          type: "list",
          wrap,
          tag: stx.tag,
          content: stx.content,
        };
      }
      case "atom": {
        return {
          type: "atom",
          wrap,
          tag: stx.tag,
          content: stx.content,
        };
      }
    }
  };
}

function llmap<X, Y>(ls: LL<X>, f: (x: X) => Y): LL<Y> {
  return ls === null ? null : [f(ls[0]), llmap(ls[1], f)];
}

function go_down(loc: Loc, f: (loc: Loc) => Step): Step {
  const x: Loc = Zipper.go_down(loc, (t, cb) => {
    switch (t.type) {
      case "list": {
        if (t.wrap) {
          return cb(t.tag, llmap(t.content, push_wrap(t.wrap)));
        } else {
          return cb(t.tag, t.content);
        }
      }
      default:
        throw new Error("HERE");
    }
  });
  return f(x);
}

function assert(condition: boolean) {
  if (!condition) {
    throw new Error("condition failed");
  }
}

function wrap_loc(loc: Loc, wrap: Wrap): Loc {
  return Zipper.change(loc, push_wrap(wrap)(loc.t));
}

function next_step(step: Step): Step {
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
          unit: { store: { [label]: rib } },
          counter,
        };
      });
    }
    case "PreExpandBody": {
      return {
        type: "PreExpandBodyForm",
        counter: step.counter,
        unit: step.unit,
        loc: { type: "loc", t: step.loc.t, p: { type: "top" } },
        k: ({}) => {
          throw new Error("PostPreExpage");
        },
      };
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
