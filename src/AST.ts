export type LL<X> = null | [X, LL<X>];

export type AST =
  | { type: "atom"; tag: string; content: string }
  | { type: "list"; tag: string; content: LL<AST> };
