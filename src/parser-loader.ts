import Parser from "web-tree-sitter";
import { assert } from "./assert";
import { AST, list_tag, list_tags } from "./AST";
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
      case "number": {
        return {
          type: "atom",
          tag: node.text === "number" ? "other" : "number",
          content: node.text,
        };
      }
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
    if (node.type === "string") {
      return { type: "atom", tag: "string", content: node.text };
    }
    const ls = children.filter((x) => x.type !== "comment").map(absurdly);
    switch (node.type) {
      case "expression_statement": {
        if (ls.length === 1 || (ls.length === 2 && ls[1].content === ";")) {
          return ls[0];
        } else {
          return {
            type: "list",
            tag: "ERROR",
            content: array_to_ll(ls),
          };
        }
      }
      case "predefined_type": {
        if (ls.length === 1) {
          return ls[0];
        } else {
          throw new Error("predefined_type with more/less than one form");
        }
      }
      case "required_parameter": {
        if (ls.length === 1) {
          return ls[0];
        } else {
          return { type: "list", tag: node.type, content: array_to_ll(ls) };
        }
      }
      case "union_type": {
        return { type: "list", tag: "binary_expression", content: array_to_ll(ls) };
      }
      case "object_type": {
        return { type: "list", tag: "object", content: array_to_ll(ls) };
      }
      case "arrow_function": {
        if (ls.length === 3) {
          const [fmls, arrow, body] = ls;
          const new_fmls: AST =
            fmls.type === "atom" && fmls.tag === "identifier"
              ? {
                  type: "list",
                  tag: "formal_parameters",
                  content: array_to_ll([fmls]),
                }
              : fmls;
          return {
            type: "list",
            tag: "arrow_function",
            content: [new_fmls, [arrow, [body, null]]],
          };
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
    const tag = (list_tags as { [k: string]: list_tag })[node.type];
    if (!tag) throw new Error(`unsupported tag '${node.type}', children: ${JSON.stringify(ls)}`);
    return {
      type: "list",
      tag,
      content: array_to_ll(ls),
    };
  }
}

export function parse_with(parser: Parser, code: string): AST {
  try {
    const node = parser.parse(code);
    const ast = absurdly(node.rootNode);
    return ast;
  } catch (err) {
    console.error(err);
    return { type: "list", tag: "ERROR", content: null };
  }
}
