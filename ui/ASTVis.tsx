import React from "react";
import { LL } from "../src/llhelpers";
import { Wrap } from "../src/syntax-structures";
import { atom_tag } from "../src/tags";

type STX =
  | { type: "atom"; tag: string; wrap?: Wrap; content: string }
  | { type: "list"; tag: string; wrap?: Wrap; content: LL<STX> };

const colormap: { [k in atom_tag]: string } = {
  identifier: "yellow",
  number: "magenta",
  jsx_text: "teal",
  string: "cyan",
  regex_pattern: "magenta",
  other: "#89a",
  ERROR: "red",
};

function token_color(token_type: string): string | undefined {
  return (colormap as { [k: string]: string })[token_type];
}

function ASTToken({
  token_type,
  token_content,
  renamed,
}: {
  token_type: string;
  token_content: string;
  renamed?: boolean;
}) {
  const color = token_color(token_type);
  const parts = renamed ? token_content.match(/^(.*)_(\d+)$/) : null;

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
      {parts ? (
        <span>
          {parts[1]}
          <sub>{parts[2]}</sub>
        </span>
      ) : (
        token_content
      )}
      {color === undefined && <span className="tooltiptext">{token_type}</span>}
    </div>
  );
}

export function Indented({ tag, items }: { tag: React.ReactElement; items: React.ReactElement[] }) {
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
        {items.map((x, i) => (
          <React.Fragment key={i}>{x}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function ASTList({ tag, items }: { tag: React.ReactElement; items: React.ReactElement[] }) {
  return <Indented tag={tag} items={items} />;
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

function ASTWrap({ wrap, children }: { wrap: Wrap | undefined; children: React.ReactElement }) {
  if (!wrap || (wrap.marks === null && wrap.subst === null)) return children;
  return (
    <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
      <div>{children}</div>
      <div style={{ fontSize: ".6em", fontWeight: "bold", marginLeft: "1em", marginRight: "1em" }}>
        <div>{map_to_array(wrap.marks, (x) => x).join(",")}</div>
        <div>{map_to_array(wrap.subst, (x) => (x === "shift" ? "shift" : x.rib_id)).join(",")}</div>
      </div>
    </div>
  );
}

export function ASTListTag({ tag }: { tag: string }) {
  return <div style={{ fontStyle: "italic" }}>{tag}:</div>;
}

export function ASTExpr({ ast }: { ast: STX }) {
  switch (ast.type) {
    case "atom":
      return (
        <ASTWrap wrap={ast.tag === "identifier" ? ast.wrap : undefined}>
          <ASTToken token_type={ast.tag} token_content={ast.content} />
        </ASTWrap>
      );
    case "list":
      return (
        <ASTList
          tag={
            <ASTWrap wrap={ast.wrap}>
              <ASTListTag tag={ast.tag} />
            </ASTWrap>
          }
          items={map_to_array(ast.content, (x, i) => (
            <ASTExpr key={i} ast={x} />
          ))}
        />
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

export function ASTExprSpan({ ast }: { ast: STX }) {
  switch (ast.type) {
    case "atom": {
      const x = <ASTToken token_type={ast.tag} token_content={ast.content} renamed />;
      return [";", "}"].includes(ast.content) ? (
        <span>
          {x}
          {"\n"}
        </span>
      ) : (
        x
      );
    }
    case "list":
      return (
        <span>
          {map_to_array(ast.content, (x, i) => (
            <ASTExprSpan key={i} ast={x} />
          ))}
        </span>
      );
    default:
      const invalid: never = ast;
      throw invalid;
  }
}

export function ASTListSpan({ items }: { tag: string; items: React.ReactElement[] }) {
  return (
    <span>
      {items.map((x, i) => (
        <span key={i}>{x} </span>
      ))}
    </span>
  );
}
