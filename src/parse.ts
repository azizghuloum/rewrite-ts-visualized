import { AST } from "./ast";
import { list_tag } from "./tags";
import { array_to_ll, LL, llappend } from "./llhelpers";
import TS, { SyntaxKind } from "typescript";
import { assert } from "./assert";

const pass_through: { [k in SyntaxKind]?: list_tag } = {
  [SyntaxKind.ParenthesizedExpression]: "parenthesized_expression",
  [SyntaxKind.BinaryExpression]: "binary_expression",
  [SyntaxKind.PrefixUnaryExpression]: "unary_expression",
  [SyntaxKind.PropertyAccessExpression]: "member_expression",
  [SyntaxKind.PropertyAssignment]: "pair",
  [SyntaxKind.ConditionalExpression]: "ternary_expression",
  [SyntaxKind.VariableDeclaration]: "variable_declarator",
  [SyntaxKind.TypeAliasDeclaration]: "type_alias_declaration",
  [SyntaxKind.SyntaxList]: "syntax_list",
};

const splice_middle: { [k in SyntaxKind]?: list_tag } = {
  [SyntaxKind.ObjectLiteralExpression]: "object",
  [SyntaxKind.ArrayLiteralExpression]: "array",
  [SyntaxKind.Block]: "statement_block",
};

function left_associate(op: string, [head, tail]: [AST, LL<AST>]): AST {
  function f(head: AST, tail: LL<AST>): AST {
    if (tail === null) {
      return head;
    } else {
      const [t0, t1] = tail;
      assert(t0.content === op);
      assert(t1 !== null);
      const [t2, t3] = t1;
      return f({ type: "list", tag: "binary_expression", content: [head, [t0, [t2, null]]] }, t3);
    }
  }
  if (head.content === op) {
    assert(tail !== null);
    return f(tail[0], tail[1]);
  } else {
    return f(head, tail);
  }
}

function absurdly(node: TS.Node, src: TS.SourceFile): AST {
  const children = node.getChildren(src);
  if (children.length === 0 && node.kind !== SyntaxKind.SyntaxList) {
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
      case SyntaxKind.LessThanToken:
      case SyntaxKind.GreaterThanToken:
      case SyntaxKind.EqualsToken:
      case SyntaxKind.BarToken:
      case SyntaxKind.AmpersandToken:
      case SyntaxKind.ImportKeyword:
      case SyntaxKind.ExportKeyword:
      case SyntaxKind.ConstKeyword:
      case SyntaxKind.TypeKeyword:
      case SyntaxKind.ExtendsKeyword:
      case SyntaxKind.AsKeyword:
      case SyntaxKind.NullKeyword:
      case SyntaxKind.StringKeyword:
      case SyntaxKind.NumberKeyword:
        return { type: "atom", tag: "other", content };
      case SyntaxKind.EndOfFileToken:
        return { type: "atom", tag: "other", content };
      default: {
        throw new Error(`unknown atom '${TS.SyntaxKind[node.kind]}':'${node.getText(src)}'`);
      }
    }
  } else {
    const ls = children.filter((x) => x.kind !== null).map((x) => absurdly(x, src));
    const content = array_to_ll(ls);
    {
      const tag = pass_through[node.kind];
      if (tag) return { type: "list", tag, content };
    }
    {
      const tag = splice_middle[node.kind];
      if (tag) {
        assert(ls.length === 3, ls);
        assert(ls[1].tag === "syntax_list");
        return {
          type: "list",
          tag,
          content: [ls[0], llappend(ls[1].content, [ls[2], null])],
        };
      }
    }
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
      case SyntaxKind.CallExpression: {
        assert(ls.length === 4, ls);
        assert(ls[2].tag === "syntax_list");
        return {
          type: "list",
          tag: "call_expression",
          content: [ls[0], [ls[1], llappend(ls[2].content, [ls[3], null])]],
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
      case SyntaxKind.ShorthandPropertyAssignment:
      case SyntaxKind.LiteralType:
      case SyntaxKind.TypeReference: {
        assert(ls.length === 1, { kind: SyntaxKind[node.kind], ls });
        return ls[0];
      }
      case SyntaxKind.TypeParameter: {
        if (ls.length === 1) {
          return ls[0];
        } else {
          return { type: "list", tag: "type_parameter", content };
        }
      }
      case SyntaxKind.SourceFile: {
        assert(ls.length === 2, ls);
        assert(ls[1].content === "", ls[1]);
        const fst = ls[0];
        assert(fst.tag === "syntax_list", fst);
        return { type: "list", tag: "program", content: fst.content };
      }
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
      case SyntaxKind.UnionType: {
        assert(ls.length === 1);
        const x = ls[0];
        assert(x.tag === "syntax_list");
        assert(x.content !== null);
        return left_associate("|", x.content);
      }
      case SyntaxKind.IntersectionType: {
        assert(ls.length === 1);
        const x = ls[0];
        assert(x.tag === "syntax_list");
        assert(x.content !== null);
        return left_associate("&", x.content);
      }
      case SyntaxKind.AsExpression: {
        assert(ls.length === 3);
        return { type: "list", tag: "binary_expression", content };
      }
      default:
        throw new Error(
          `unsupported tag '${SyntaxKind[node.kind]}', children: ${JSON.stringify(ls)}`,
        );
    }
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
