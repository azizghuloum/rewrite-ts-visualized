import { TaggedReconstructiveZipper } from "zipper";
import { AST } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { LL } from "./llhelpers";
import { counters } from "./data";

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

export type Label = { cuid: string; name: string };

export type Env = { [name: string]: [LL<Mark>, Label][] };

export type Rib = { type: "rib"; types_env: Env; normal_env: Env; libs?: string[] };

function label_generator(prefix: string): (counters: counters) => [string, counters] {
  return (counters: counters) => [
    `${prefix}${counters.internal}`,
    { ...counters, internal: counters.internal + 1 },
  ];
}

export const new_label_id = label_generator("l");

export const new_rib_id = label_generator("r");

export const new_mark = label_generator("m");

export type CompilationUnit = {
  cu_id: string;
  store: { [rib_id: string]: Rib };
};

export type Marks = LL<Mark>;

export type RibRef = { rib_id: string; cu_id: string };

export type Subst = LL<Shift | RibRef>;

export type AE = false | STX | AST;

export type Wrap = { marks: Marks; subst: Subst; aes: LL<AE> };

export type STX =
  | { type: "list"; tag: list_tag; wrap: Wrap; content: LL<STX | AST>; src: AE }
  | { type: "list"; tag: list_tag; wrap: undefined; content: LL<STX>; src: AE }
  | { type: "atom"; tag: atom_tag; wrap: Wrap; content: string; src: AE };

export type Loc = TaggedReconstructiveZipper.Loc<list_tag, STX>;

export type Binding =
  | { type: "lexical"; name: string }
  | { type: "type"; name: string }
  | { type: "core_syntax"; name: string; pattern: STX }
  | { type: "syntax_rules_transformer"; clauses: { pattern: Loc; template: STX }[] }
  | { type: "imported_lexical"; name: string; cuid: string }
  | { type: "imported_type"; name: string; cuid: string }
  | {
      type: "imported_syntax_rules_transformer";
      clauses: { pattern: Loc; template: STX }[];
      cuid: string;
    }
  | { type: "ts"; name: string };

export type Context = { [label: string]: Binding };
