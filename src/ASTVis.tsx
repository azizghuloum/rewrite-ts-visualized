import { AST } from "./AST";

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

export function ASTList({
  tag,
  children,
}: {
  tag: string;
  children: React.ReactElement[];
}) {
  return (
    <div style={{ display: "block" }}>
      <div style={{ fontStyle: "italic" }}>{tag}:</div>
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
        {children}
      </div>
    </div>
  );
}

export function ASTExpr({ ast }: { ast: AST }) {
  switch (ast.type) {
    case "atom":
      return <ASTToken token_type={ast.tag} token_content={ast.content} />;
    case "list":
      return (
        <ASTList tag={ast.tag}>
          {ast.content.map((x, i) => (
            <ASTExpr key={i} ast={x} />
          ))}
        </ASTList>
      );
    default:
      const invalid: never = ast;
      throw invalid;
  }
}

export function ASTHighlight({ children }: { children: React.ReactElement }) {
  return (
    <div
      style={{
        border: "2px dotted cyan",
        borderRadius: "5px",
        paddingLeft: "5px",
        paddingRight: "5px",
      }}
    >
      {children}
    </div>
  );
}