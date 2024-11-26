import { atom_tag, list_tag } from "./tags";
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
      tag: list_tag;
      content: LL<AST>;
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
      return { type: ast.tag, children: ll_to_array(ast.content).map(ast_to_tree) };
    }
  }
}
