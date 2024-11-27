import { AST } from "./AST";
import { list_tag, list_tags } from "./tags";
import { array_to_ll, llappend } from "./llhelpers";
import TS, { SyntaxKind } from "typescript";
import { assert } from "./assert";

function absurdly(node: TS.Node, src: TS.SourceFile): AST {
  const children = node.getChildren(src);
  if (children.length === 0) {
    const content = node.getText(src);
    switch (node.kind) {
      case SyntaxKind.NumericLiteral:
        return { type: "atom", tag: "number", content };
      case SyntaxKind.StringLiteral:
        return { type: "atom", tag: "string", content };
      case SyntaxKind.Identifier:
        return { type: "atom", tag: "identifier", content };
      case SyntaxKind.OpenParenToken:
      case SyntaxKind.CloseParenToken:
      case SyntaxKind.EqualsGreaterThanToken:
      case SyntaxKind.OpenBraceToken:
      case SyntaxKind.CloseBraceToken:
      case SyntaxKind.OpenBracketToken:
      case SyntaxKind.CloseBracketToken:
      case SyntaxKind.SemicolonToken:
      case SyntaxKind.DotToken:
      case SyntaxKind.CommaToken:
      case SyntaxKind.QuestionToken:
      case SyntaxKind.ExclamationToken:
      case SyntaxKind.ColonToken:
      case SyntaxKind.PlusToken:
      case SyntaxKind.MinusToken:
      case SyntaxKind.EqualsToken:
      case SyntaxKind.SemicolonToken:
      case SyntaxKind.ImportKeyword:
      case SyntaxKind.ExportKeyword:
      case SyntaxKind.ConstKeyword:
        return { type: "atom", tag: "other", content };
      case SyntaxKind.EndOfFileToken:
        return { type: "atom", tag: "other", content };
      case SyntaxKind.SyntaxList:
        return { type: "list", tag: "syntax_list", content: null };
      default: {
        throw new Error(`unknown atom '${TS.SyntaxKind[node.kind]}':'${node.getText(src)}'`);
      }
    }
  } else {
    const ls = children.filter((x) => x.kind !== null).map((x) => absurdly(x, src));
    const content = array_to_ll(ls);
    switch (node.kind) {
      case SyntaxKind.VariableStatement:
      case SyntaxKind.ExpressionStatement: {
        if (ls.length === 1 || (ls.length === 2 && ls[1].content === ";")) {
          return ls[0];
        } else if (
          ls.length === 3 &&
          ls[0].tag === "syntax_list" &&
          ls[0].content !== null &&
          ls[0].content[1] === null &&
          ls[0].content[0].content === "export" &&
          ls[1].tag === "lexical_declaration" &&
          ls[2].content === ";"
        ) {
          return {
            type: "list",
            tag: "export_statement",
            content: [ls[0].content[0], [ls[1], [ls[2], null]]],
          };
        } else {
          return { type: "list", tag: "ERROR", content };
        }
      }
      case SyntaxKind.SyntaxList:
        return { type: "list", tag: "syntax_list", content };
      case SyntaxKind.Block: {
        assert(ls.length === 3, ls);
        assert(ls[1].tag === "syntax_list");
        return {
          type: "list",
          tag: "statement_block",
          content: [ls[0], llappend(ls[1].content, [ls[2], null])],
        };
      }
      case SyntaxKind.ArrowFunction: {
        assert(ls.length === 5, ls);
        const [lt, fmls, rt, ar, body] = ls;
        assert(fmls.tag === "syntax_list", fmls);
        const args: AST = {
          type: "list",
          tag: "formal_parameters",
          content: [lt, llappend(fmls.content, [rt, null])],
        };
        return { type: "list", tag: "arrow_function", content: [args, [ar, [body, null]]] };
      }
      case SyntaxKind.CallExpression:
        return { type: "list", tag: "call_expression", content };
      case SyntaxKind.ParenthesizedExpression:
        return { type: "list", tag: "parenthesized_expression", content };
      case SyntaxKind.BinaryExpression:
        return { type: "list", tag: "binary_expression", content };
      case SyntaxKind.PrefixUnaryExpression:
        return { type: "list", tag: "unary_expression", content };
      case SyntaxKind.PropertyAccessExpression:
        return { type: "list", tag: "member_expression", content };
      case SyntaxKind.ShorthandPropertyAssignment: {
        assert(ls.length === 1, ls);
        return ls[0];
      }
      case SyntaxKind.ConditionalExpression:
        return { type: "list", tag: "ternary_expression", content };
      case SyntaxKind.SourceFile: {
        assert(ls.length === 2, ls);
        assert(ls[1].content === "", ls[1]);
        const fst = ls[0];
        assert(fst.tag === "syntax_list", fst);
        return { type: "list", tag: "program", content: fst.content };
      }
      case SyntaxKind.ArrayLiteralExpression: {
        assert(ls.length === 3, ls);
        assert(ls[1].tag === "syntax_list");
        return {
          type: "list",
          tag: "array",
          content: [ls[0], llappend(ls[1].content, [ls[2], null])],
        };
      }
      case SyntaxKind.VariableDeclaration:
        return { type: "list", tag: "variable_declarator", content };
      case SyntaxKind.VariableDeclarationList: {
        assert(ls.length === 2, ls);
        const [kwd, decls] = ls;
        assert(decls.tag === "syntax_list");
        return { type: "list", tag: "lexical_declaration", content: [kwd, decls.content] };
      }
      case SyntaxKind.Parameter: {
        if (ls.length === 1) {
          return ls[0];
        } else {
          return { type: "list", tag: "required_parameter", content };
        }
      }
      case SyntaxKind.PropertyAssignment: {
        assert(ls.length === 3 && ls[1].content === ":", ls);
        return { type: "list", tag: "pair", content };
      }
      case SyntaxKind.ObjectLiteralExpression: {
        assert(ls.length === 3 && ls[0].content === "{" && ls[2].content === "}", ls);
        assert(ls[1].tag === "syntax_list");
        return {
          type: "list",
          tag: "object",
          content: [ls[0], llappend(ls[1].content, [ls[2], null])],
        };
      }
    }
    const tag = (list_tags as { [k: string]: list_tag })[node.kind];
    if (!tag)
      throw new Error(
        `unsupported tag '${SyntaxKind[node.kind]}', children: ${JSON.stringify(ls)}`,
      );
    return {
      type: "list",
      tag,
      content: array_to_ll(ls),
    };
  }
}

export function parse(code: string): AST {
  try {
    const options: TS.CreateSourceFileOptions = {
      languageVersion: TS.ScriptTarget.ESNext,
      jsDocParsingMode: TS.JSDocParsingMode.ParseNone,
    };
    const src = TS.createSourceFile("code.tsx", code, options);
    const ast = absurdly(src, src);
    return ast;
  } catch (err) {
    console.error(err);
    return { type: "list", tag: "ERROR", content: null };
  }
}
