import { AST } from "./AST";

export type LL<X> = null | [X, LL<X>];

export type TopMark = "top";

export const top_mark: TopMark = "top";

export type AntiMark = "antimark";

export const antimark: AntiMark = "antimark";

export type Mark = TopMark | AntiMark | string;

export type Shift = "shift";

export const shift: Shift = "shift";

/*
 * Dual environments in typescript
 */

function test() {
  const t = 12;
  type t = string;
  function bar() {
    const q = t;
    type q = t;
  }
  bar();
}
test();

export type Env = { [name: string]: [LL<Mark>, string][] };

export type Rib = { type: "rib"; types_env: Env; normal_env: Env };

function label_generator(
  prefix: string
): (counter: number) => [string, number] {
  return (counter: number) => [`${prefix}${counter}`, counter + 1];
}

export const new_subst_label = label_generator("s.");

export type CompilationUnit = {
  store: { [label: string]: Rib };
};

export type Marks = LL<Mark>;

export type RibRef = { rib: string };

export type Subst = LL<Shift | RibRef>;

export type Wrap = { marks: Marks; subst: Subst };

export type STX =
  | { type: "list"; tag: string; wrap: Wrap; content: LL<STX | AST> }
  | { type: "list"; tag: string; wrap: undefined; content: LL<STX> }
  | { type: "atom"; tag: string; wrap: Wrap; content: string };
