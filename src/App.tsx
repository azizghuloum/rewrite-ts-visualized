import "./App.css";
import Parser from "web-tree-sitter";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { abcdef } from "@uiw/codemirror-theme-abcdef";

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

type AST = [string, string | AST[]];

function absurdly(node: Parser.SyntaxNode): AST {
  const children = node.children;
  if (children.length === 0) {
    return [node.type, node.text];
  } else {
    return [
      node.type,
      children.filter((x) => x.type !== "comment").map(absurdly),
    ];
  }
}

function token_color(
  token_type: string,
  token_content: string
): string | undefined {
  switch (token_type) {
    case "identifier":
      return "yellow";
    case "property_identifier":
      return "lime";
    case "type_identifier":
      return "orange";
    case "number":
      return "magenta";
    case "jsx_text":
      return "teal";
    case "string_fragment":
      return "cyan";
    case token_content:
      return "grey";
    default:
      return undefined;
  }
}

function ASTToken({
  token_type,
  token_content,
}: {
  token_type: string;
  token_content: string;
}) {
  const color = token_color(token_type, token_content);
  return (
    <div
      style={{
        display: "inline-block",
        border: "1px solid",
        borderColor: color || "#404040",
        borderRadius: "3px",
        margin: "3px",
        paddingLeft: "5px",
        paddingRight: "5px",
        color,
      }}
      className="tooltip"
    >
      {token_content}
      {color === undefined && <span className="tooltiptext">{token_type}</span>}
    </div>
  );
}

function ASTList({
  list_type,
  list_content,
}: {
  list_type: string;
  list_content: AST[];
}) {
  return (
    <div style={{ display: "block" }}>
      <div style={{ fontStyle: "italic" }}>{list_type}:</div>
      <div
        style={{
          paddingLeft: "1.4em",
          borderLeft: "3px solid #303030",
          borderBottom: "3px solid #303030",
          borderRadius: "9px",
          marginLeft: "3px",
          marginBottom: "3px",
        }}
      >
        {list_content.map((x, i) => (
          <ASTExpr key={i} ast={x} />
        ))}
      </div>
    </div>
  );
}

function ASTExpr({ ast }: { ast: AST }) {
  if (typeof ast[1] === "string") {
    return <ASTToken token_type={ast[0]} token_content={ast[1]} />;
  } else {
    return <ASTList list_type={ast[0]} list_content={ast[1]} />;
  }
}

type EditorProps = { code: string; onChange?: (code: string) => void };

function Editor({ code, onChange }: EditorProps) {
  return (
    <CodeMirror
      value={code}
      extensions={[javascript({ jsx: true, typescript: true })]}
      onChange={onChange}
      readOnly={!onChange}
      theme={abcdef}
    />
  );
}

type ExampleProps = {
  parser: Parser;
  code: string;
  onChange?: (code: string) => void;
};

function Example({ parser, code, onChange }: ExampleProps) {
  const node = parser.parse(code);
  const root = absurdly(node.rootNode);
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
      <div
        className="code"
        style={{ marginLeft: "1em", maxHeight: "90vh", overflowY: "scroll" }}
      >
        <ASTExpr ast={root} />
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
