export type LL<X> = null | [X, LL<X>];

export type TopMark = "top";

export const top_mark: TopMark = "top";

export type Mark = TopMark | string;

export type Shift = "shift";

export const shift: Shift = "shift";

export type Rib = { [name: string]: [LL<Mark>, string][] };

export type STX =
  | { type: "list"; tag: string; content: LL<STX> }
  | { type: "wrapped"; marks: LL<Mark>; subst: LL<Shift | Rib>; content: WSTX };

export type WSTX =
  | { type: "list"; tag: string; content: LL<WSTX | STX> }
  | { type: "atom"; tag: string; content: string };
