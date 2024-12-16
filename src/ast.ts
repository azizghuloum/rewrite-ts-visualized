import { LL } from "./llhelpers";
import { atom_tag, list_tag } from "./tags";

export type no_source = false;

export type source_file = { package: { name: string; version: string }; path: string };

export type source = {
  type: "origin";
  p: number;
  e: number;
  f: source_file;
};

export type src = no_source | source;

export type AST =
  | {
      type: "atom";
      wrap?: undefined;
      tag: atom_tag;
      content: string;
      src: src;
    }
  | {
      type: "list";
      wrap?: undefined;
      tag: list_tag;
      content: LL<AST>;
      src: src;
    };
