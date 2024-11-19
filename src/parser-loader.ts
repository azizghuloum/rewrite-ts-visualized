import Parser from "web-tree-sitter";
import { AST } from "./AST";
import { array_to_ll } from "./llhelpers";

export const load_parser = async (files: {
  parser_url: string;
  lang_url: string;
}) =>
  Parser.init({
    locateFile(scriptName: string, _scriptDirectory: string) {
      const m: { [k: string]: string } = {
        "tree-sitter.wasm": files.parser_url,
      };
      return m[scriptName] ?? scriptName;
    },
  })
    .then(() => {
      return Parser.Language.load(files.lang_url);
    })
    .then((lang) => {
      const parser = new Parser();
      parser.setLanguage(lang);
      return parser;
    });

function absurdly(node: Parser.SyntaxNode): AST {
  const children = node.children;
  if (children.length === 0) {
    switch (node.type) {
      case "number":
      case "regex_pattern":
      case "identifier":
      case "type_identifier":
      case "shorthand_property_identifier":
      case "property_identifier": {
        return { type: "atom", tag: node.type, content: node.text };
      }
      case node.text: {
        return { type: "atom", tag: "other", content: node.text };
      }
      default: {
        if (node.text === "") {
          return { type: "atom", tag: "other", content: node.type };
        }
        throw new Error(`unknown atom '${node.type}':'${node.text}'`);
      }
    }
  } else {
    const ls = children.filter((x) => x.type !== "comment").map(absurdly);
    switch (node.type) {
      case "expression_statement": {
        if (ls.length === 1 || (ls.length === 2 && ls[1].content === ";")) {
          return ls[0];
        } else {
          throw new Error("invalid expression_statement");
        }
      }
    }
    return {
      type: "list",
      tag: node.type,
      content: array_to_ll(ls),
    };
  }
}

export function parse_with(parser: Parser, code: string): AST {
  const node = parser.parse(code);
  const ast = absurdly(node.rootNode);
  return ast;
}
