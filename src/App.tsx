import "./App.css";
import Parser from "web-tree-sitter";
//@ts-ignore
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
//@ts-ignore
import tsx_url from "./assets/tree-sitter-tsx.wasm?url";
import React, { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const load_tsx_parser = async () =>
  Parser.init({
    locateFile(scriptName: string, _scriptDirectory: string) {
      const m: { [k: string]: string } = {
        "tree-sitter.wasm": treesitter_wasm_url,
      };
      //console.log({ scriptName, scriptDirectory });
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
    //return [node.type, children.map(absurdly)];
    //return [node.type, children.filter((x) => !x.isExtra).map(absurdly)];
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

const examples = [
  "const identifier: type_identifier = {\n  member_identifier: 'str'\n}",
  "type _ = example;",
  "_.example;",
  "function* foo<T>() {}",
  "example;",
  //type T = {type: Q | typeof Z};
  //const j = <div>im jsx text</div>;
  //rewrite(name, (x: X, y: Y, z) => {
  //  /* comment */
  //  "im a string".foo
  //  pattern;
  //  template;
  //});
  //rewrite(foo, () => {
  //  foo(x);
  //  1 + x;
  //});
];

function Example({ parser, code }: { parser: Parser; code: string }) {
  const node = parser.parse(code);
  const root = absurdly(node.rootNode);
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          alignItems: "center",
        }}
      >
        <div className="code" style={{ flexBasis: "50%", fontSize: "2em" }}>
          {code}
        </div>
        <div className="code">
          <ASTExpr ast={root} />
        </div>
      </div>
      <hr />
    </>
  );
}

function Expander() {
  const [parser, set_parser] = useState<Parser | null>(null);
  useEffect(() => {
    load_tsx_parser().then(set_parser);
    return undefined;
  }, []);
  if (!parser) return <div>loading ...</div>;
  return (
    <>
      {examples.map((code, i) => (
        <Example key={i} code={code} parser={parser} />
      ))}
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
