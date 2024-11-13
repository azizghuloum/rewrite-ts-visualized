export type AST =
  | { type: "atom"; tag: string; content: string }
  | { type: "list"; tag: string; content: AST[] };
