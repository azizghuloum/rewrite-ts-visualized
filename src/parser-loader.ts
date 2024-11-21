import Parser from "web-tree-sitter";
import { assert } from "./assert";
import { AST } from "./AST";
import { array_to_ll } from "./llhelpers";

export const load_parser = async (files: { parser_url: string; lang_url: string }) =>
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
      case "property_identifier":
      case "ERROR": {
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
          return {
            type: "list",
            tag: "ERROR",
            wrap: undefined,
            content: array_to_ll(ls),
          };
        }
      }
      case "required_parameter": {
        assert(ls.length === 1);
        const x = ls[0];
        return x;
      }
      case "arrow_function": {
        if (ls.length === 3) {
          const fmls = ls[0];
          if (fmls.type === "atom" && fmls.tag === "identifier") {
            // const lparen: AST = { type: "atom", tag: "other", content: "(" };
            // const rparen: AST = { type: "atom", tag: "other", content: ")" };
            const rfmls: AST = {
              type: "list",
              tag: "formal_parameters",
              content: array_to_ll([fmls]),
            };
            ls[0] = rfmls;
          }
          assert(ls[0].type === "list");
        } else {
          return {
            type: "list",
            tag: "ERROR",
            wrap: undefined,
            content: array_to_ll(ls),
          };
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
