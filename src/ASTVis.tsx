import { AST, LL } from "./AST";
import { STX, WSTX } from "./STX";

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

export function Indented({
  tag,
  children,
}: {
  tag: React.ReactElement;
  children: React.ReactElement | React.ReactElement[];
}) {
  return (
    <div style={{ display: "block" }}>
      {tag}
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

export function ASTList({
  tag,
  children,
}: {
  tag: string;
  children: React.ReactElement[];
}) {
  const tag_element = <div style={{ fontStyle: "italic" }}>{tag}:</div>;
  return <Indented tag={tag_element} children={children} />;
}

function map_to_array<X, Y>(ll: LL<X>, f: (x: X, i: number) => Y): Y[] {
  const ys: Y[] = [];
  let i = 0;
  while (ll !== null) {
    ys.push(f(ll[0], i));
    i += 1;
    ll = ll[1];
  }
  return ys;
}

export function ASTExpr({ ast }: { ast: STX | WSTX }) {
  switch (ast.type) {
    case "atom":
      return <ASTToken token_type={ast.tag} token_content={ast.content} />;
    case "list":
      return (
        <ASTList tag={ast.tag}>
          {map_to_array(ast.content, (x, i) => (
            <ASTExpr key={i} ast={x} />
          ))}
        </ASTList>
      );
    case "wrapped": {
      const tag = (
        <div style={{ fontWeight: "bold" }}>
          marked {map_to_array(ast.marks, (x) => x).join(",")}
        </div>
      );
      return (
        <Indented tag={tag}>
          <ASTExpr ast={ast.content} />
        </Indented>
      );
    }
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
