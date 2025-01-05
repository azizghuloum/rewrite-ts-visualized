import { AST, src } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { array_to_ll, LL, llappend, llforeach } from "./llhelpers";
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
  [SyntaxKind.ExportDeclaration]: "export_declaration",
  [SyntaxKind.EmptyStatement]: "empty_statement",
  [SyntaxKind.ImportClause]: "import_clause",
  [SyntaxKind.ImportDeclaration]: "import_declaration",
  [SyntaxKind.NamespaceImport]: "namespace_import",
  [SyntaxKind.FunctionType]: "function_type",
  [SyntaxKind.PropertySignature]: "property_signature",
  [SyntaxKind.InterfaceDeclaration]: "interface_declaration",
  [SyntaxKind.ModuleBlock]: "module_block",
  [SyntaxKind.ModuleDeclaration]: "module_declaration",
  [SyntaxKind.TypeOperator]: "type_operator",
  [SyntaxKind.MappedType]: "mapped_type",
  [SyntaxKind.CallSignature]: "call_signature",
  [SyntaxKind.ArrayType]: "array_type",
  [SyntaxKind.TypeLiteral]: "type_literal",
  [SyntaxKind.FunctionDeclaration]: "function_declaration",
  [SyntaxKind.IndexedAccessType]: "indexed_access_type",
  [SyntaxKind.ExpressionWithTypeArguments]: "expression_with_type_arguments",
  [SyntaxKind.HeritageClause]: "heritage_clause",
  [SyntaxKind.ConditionalType]: "conditional_type",
  [SyntaxKind.TypeQuery]: "type_query",
  [SyntaxKind.MethodSignature]: "method_signature",
  [SyntaxKind.ParenthesizedType]: "parenthesized_type",
  [SyntaxKind.TypePredicate]: "type_predicate",
  [SyntaxKind.NewExpression]: "new_expression",
  [SyntaxKind.ThrowStatement]: "throw_statement",
  [SyntaxKind.ElementAccessExpression]: "element_access_expression",
  [SyntaxKind.SyntaxList]: "syntax_list",
};

const splice_middle: { [k in SyntaxKind]?: list_tag } = {
  [SyntaxKind.ObjectLiteralExpression]: "object",
  [SyntaxKind.ArrayLiteralExpression]: "array",
  [SyntaxKind.Block]: "statement_block",
  [SyntaxKind.NamedExports]: "named_exports",
  [SyntaxKind.NamedImports]: "named_imports",
};

const remove_singleton_identifier: { [k in SyntaxKind]?: list_tag } = {
  [SyntaxKind.TypeParameter]: "type_parameter",
  [SyntaxKind.Parameter]: "required_parameter",
  [SyntaxKind.ExportSpecifier]: "export_specifier",
  [SyntaxKind.ImportSpecifier]: "import_specifier",
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
      const src0 = head.src;
      assert(src0 !== false);
      const src1 = t2.src;
      assert(src1 !== false);
      const src: src = { ...src0, e: src1.e };
      return f(
        { type: "list", tag: "binary_expression", content: [head, [t0, [t2, null]]], src },
        t3,
      );
    }
  }
  if (head.content === op) {
    assert(tail !== null);
    return f(tail[0], tail[1]);
  } else {
    return f(head, tail);
  }
}

function absurdly(node: TS.Node, source: TS.SourceFile, cuid: string): AST {
  const children = node.getChildren(source);
  if (children.length === 0 && node.kind !== SyntaxKind.SyntaxList) {
    const content = node.getText(source);
    const src: src = {
      type: "origin",
      s: node.end - content.length,
      e: node.end,
      name: node.kind === TS.SyntaxKind.Identifier ? content : undefined,
      cuid,
    };
    switch (node.kind) {
      case SyntaxKind.NumericLiteral:
        return { type: "atom", tag: "number", content, src };
      case SyntaxKind.StringLiteral:
        return { type: "atom", tag: "string", content, src };
      case SyntaxKind.Identifier:
        return { type: "atom", tag: "identifier", content, src };
      case SyntaxKind.RegularExpressionLiteral:
        return { type: "atom", tag: "regex", content, src };
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
      case SyntaxKind.AsteriskToken:
      case SyntaxKind.LessThanToken:
      case SyntaxKind.GreaterThanToken:
      case SyntaxKind.EqualsToken:
      case SyntaxKind.BarToken:
      case SyntaxKind.BarBarToken:
      case SyntaxKind.AmpersandToken:
      case SyntaxKind.ImportKeyword:
      case SyntaxKind.ExportKeyword:
      case SyntaxKind.FromKeyword:
      case SyntaxKind.ConstKeyword:
      case SyntaxKind.TypeKeyword:
      case SyntaxKind.ExtendsKeyword:
      case SyntaxKind.AsKeyword:
      case SyntaxKind.NullKeyword:
      case SyntaxKind.StringKeyword:
      case SyntaxKind.NumberKeyword:
      case SyntaxKind.DeclareKeyword:
      case SyntaxKind.NamespaceKeyword:
      case SyntaxKind.InterfaceKeyword:
      case SyntaxKind.AnyKeyword:
      case SyntaxKind.VoidKeyword:
      case SyntaxKind.InKeyword:
      case SyntaxKind.KeyOfKeyword:
      case SyntaxKind.ModuleKeyword:
      case SyntaxKind.NeverKeyword:
      case SyntaxKind.BooleanKeyword:
      case SyntaxKind.UndefinedKeyword:
      case SyntaxKind.UnknownKeyword:
      case SyntaxKind.FunctionKeyword:
      case SyntaxKind.FalseKeyword:
      case SyntaxKind.TrueKeyword:
      case SyntaxKind.TypeOfKeyword:
      case SyntaxKind.IsKeyword:
      case SyntaxKind.SymbolKeyword:
      case SyntaxKind.ReadonlyKeyword:
      case SyntaxKind.NewKeyword:
      case SyntaxKind.ThrowKeyword:
        return { type: "atom", tag: "other", content, src };
      case SyntaxKind.EndOfFileToken:
        return { type: "atom", tag: "other", content, src };
      default: {
        throw new Error(`unknown atom '${TS.SyntaxKind[node.kind]}':'${node.getText(source)}'`);
      }
    }
  } else {
    const ls = children.filter((x) => x.kind !== null).map((x) => absurdly(x, source, cuid));
    const src: src = { type: "origin", s: node.pos, e: node.end, name: undefined, cuid };
    const content = array_to_ll(ls);
    {
      const tag = remove_singleton_identifier[node.kind];
      if (tag) {
        if (ls.length === 1 && ls[0].tag === "identifier") {
          return ls[0];
        } else {
          return { type: "list", tag, content, src };
        }
      }
    }
    {
      const tag = pass_through[node.kind];
      if (tag) return { type: "list", tag, content, src };
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
          src,
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
            ...ls[1], // lexical_declaration
            content: [
              ls[0].content[0], // export keyword
              llappend(ls[1].content, [ls[2], null]),
            ],
            src,
          };
        } else {
          return { type: "list", tag: "ERROR", content, src };
        }
      }
      case SyntaxKind.CallExpression: {
        if (ls.length !== 4) return { type: "list", tag: "ERROR", content, src };
        assert(ls.length === 4, ls);
        assert(ls[2].tag === "syntax_list");
        return {
          type: "list",
          tag: "call_expression",
          content: [ls[0], [ls[1], llappend(ls[2].content, [ls[3], null])]],
          src,
        };
      }
      case SyntaxKind.ArrowFunction: {
        assert(ls.length === 5, ls);
        const [lt, fmls, rt, ar, body] = ls;
        assert(fmls.tag === "syntax_list", fmls);
        assert(
          lt.src &&
            rt.src &&
            lt.src.cuid === rt.src.cuid &&
            typeof lt.src.s === "number" &&
            typeof rt.src.e === "number" &&
            lt.src.s < rt.src.e,
        );
        const args_src = { ...lt.src, p: lt.src.s, e: rt.src.e };
        const args: AST = {
          type: "list",
          tag: "formal_parameters",
          content: [lt, llappend(fmls.content, [rt, null])],
          src: args_src,
        };
        return {
          type: "list",
          tag: "arrow_function",
          content: [args, [ar, [body, null]]],
          src: src,
        };
      }
      case SyntaxKind.ShorthandPropertyAssignment:
      case SyntaxKind.LiteralType:
      case SyntaxKind.TypeReference: {
        assert(ls.length === 1, { kind: SyntaxKind[node.kind], ls });
        return ls[0];
      }
      case SyntaxKind.SourceFile: {
        assert(ls.length === 2, ls);
        assert(ls[1].content === "", ls[1]);
        const fst = ls[0];
        assert(fst.tag === "syntax_list", fst);
        return { type: "list", tag: "program", content: fst.content, src };
      }
      case SyntaxKind.VariableDeclarationList: {
        assert(ls.length === 2, ls);
        const [kwd, decls] = ls;
        assert(decls.tag === "syntax_list");
        return { type: "list", tag: "lexical_declaration", content: [kwd, decls.content], src };
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
        return { type: "list", tag: "binary_expression", content, src };
      }
      case SyntaxKind.TypeAliasDeclaration: {
        assert(content !== null);
        const [fst, rest] = content;
        if (fst.tag === "syntax_list") {
          return {
            type: "list",
            tag: "type_alias_declaration",
            content: llappend(fst.content, rest),
            src,
          };
        } else {
          return { type: "list", tag: "type_alias_declaration", content, src };
        }
      }
      default:
        throw new Error(
          `unsupported tag '${SyntaxKind[node.kind]}', children: ${JSON.stringify(ls)}`,
        );
    }
  }
}

function remap_source(ast: AST, code: string) {
  let offset = 0;
  let line = 0;
  let column = 0;

  function get_src(
    p: number,
    tag: list_tag | atom_tag,
    content: any,
  ): { line: number; column: number; offset: number } {
    if (p > offset) {
      const frag = code.slice(offset, p);
      const lines = frag.split(/\(\r\n\)|\r|\n/g);
      if (lines.length === 1) {
        const l0 = lines[0];
        column += l0.split("").length;
      } else {
        assert(lines.length > 1);
        line += lines.length - 1;
        column = lines[lines.length - 1].split("").length;
      }
      offset = p;
    }
    assert(p === offset, `rewind from ${offset} to ${p} in ${tag} ${content}`);
    return { line, column, offset };
  }

  function remap(ast: AST) {
    assert(ast.src !== false);
    assert(typeof ast.src.s === "number", JSON.stringify(ast));
    ast.src.s = get_src(ast.src.s, ast.tag, ast.content);
    if (ast.type === "list") {
      llforeach(ast.content, remap);
    }
    assert(typeof ast.src.e === "number");
    ast.src.e = get_src(ast.src.e, ast.tag, ast.content);
  }

  remap(ast);
}

export function parse(code: string, cuid: string): AST {
  try {
    const options: TS.CreateSourceFileOptions = {
      languageVersion: TS.ScriptTarget.ESNext,
      jsDocParsingMode: TS.JSDocParsingMode.ParseNone,
    };
    const src = TS.createSourceFile("code.tsx", code, options);
    const ast = absurdly(src, src, cuid);
    remap_source(ast, code);
    return ast;
  } catch (err) {
    console.error(err);
    return { type: "list", tag: "ERROR", content: null, src: false };
  }
}
