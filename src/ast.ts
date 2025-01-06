import { LL } from "./llhelpers";
import { atom_tag, list_tag } from "./tags";

export type no_source = false;

export type pos = number | { line: number; column: number; offset: number };

export type source = {
  type: "origin";
  s: pos;
  e: pos;
  name: string | undefined;
  cuid: string;
};

export type origin = no_source | source;

export type AST =
  | {
      type: "atom";
      wrap?: undefined;
      tag: atom_tag;
      content: string;
      origin: origin;
    }
  | {
      type: "list";
      wrap?: undefined;
      tag: list_tag;
      content: LL<AST>;
      origin: origin;
    };
