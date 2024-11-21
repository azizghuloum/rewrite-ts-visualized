import { assert } from "./assert";
import { atom_tag } from "./AST";
import { LL, ll_to_array } from "./llhelpers";

export type AST =
  | {
      type: "atom";
      wrap?: any;
      tag: atom_tag;
      content: string;
    }
  | {
      type: "list";
      wrap?: any;
      tag: string;
      content: LL<AST>;
    };

type list_tag =
  | "program"
  | "lexical_declaration"
  | "variable_declarator"
  | "binary_expression"
  | "call_expression"
  | "arguments"
  | "arrow_function"
  | "formal_parameters"
  | "statement_block";

const list_tags: { [k in list_tag]: list_tag } = {
  program: "program",
  lexical_declaration: "lexical_declaration",
  variable_declarator: "variable_declarator",
  binary_expression: "binary_expression",
  call_expression: "call_expression",
  arguments: "arguments",
  arrow_function: "arrow_function",
  formal_parameters: "formal_parameters",
  statement_block: "statement_block",
};

type Tree =
  | {
      type: atom_tag;
      text: string;
    }
  | {
      type: list_tag;
      children: Tree[];
    };

export function ast_to_tree(ast: AST): Tree {
  switch (ast.type) {
    case "atom": {
      return { type: ast.tag, text: ast.content };
    }
    case "list": {
      const type = (list_tags as { [k: string]: list_tag })[ast.tag];
      if (type === undefined) throw new Error(`unknown tag '${ast.tag}'`);
      return { type, children: ll_to_array(ast.content).map(ast_to_tree) };
    }
  }
}
