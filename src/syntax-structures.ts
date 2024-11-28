import { TaggedReconstructiveZipper } from "zipper";
import { AST } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { LL } from "./llhelpers";

export type TopMark = "top";

export const top_mark: TopMark = "top";

export const top_marks: Marks = [top_mark, null];

export type AntiMark = "antimark";

export const antimark: AntiMark = "antimark";

export type Mark = TopMark | AntiMark | string;

export type Shift = "shift";

export const shift: Shift = "shift";

/*
 * Dual environments in typescript
 */

/*
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
*/

export type Env = { [name: string]: [LL<Mark>, string][] };

export type Rib = { type: "rib"; types_env: Env; normal_env: Env };

function label_generator(prefix: string): (counter: number) => [string, number] {
  return (counter: number) => [`${prefix}${counter}`, counter + 1];
}

export const new_rib_id = label_generator("r");

export const new_mark = label_generator("m");

export type CompilationUnit = {
  cu_id: string;
  store: { [rib_id: string]: Rib };
};

export type Marks = LL<Mark>;

export type RibRef = { rib_id: string; cu_id: string };

export type Subst = LL<Shift | RibRef>;

export type Wrap = { marks: Marks; subst: Subst };

export type STX =
  | { type: "list"; tag: list_tag; wrap: Wrap; content: LL<STX | AST> }
  | { type: "list"; tag: list_tag; wrap: undefined; content: LL<STX> }
  | { type: "atom"; tag: atom_tag; wrap: Wrap; content: string };

export type Loc = TaggedReconstructiveZipper.Loc<list_tag, STX>;

export type Binding =
  | { type: "lexical"; name: string }
  | { type: "core_syntax"; name: string; pattern: STX }
  | { type: "syntax_rules_transformer"; clauses: { pattern: Loc; template: STX }[] };

export type Context = { [label: string]: Binding };
