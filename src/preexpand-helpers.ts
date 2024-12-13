import { Resolution } from "./stx";
import { Loc } from "./syntax-structures";

type inspect = <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T>;

export type imported_module = {
  resolve_exported_identifier: (name: string, loc: Loc) => Promise<Resolution[]>;
};

export type manager = {
  resolve_import: (loc: Loc) => Promise<imported_module>;
};

export type preexpand_helpers = {
  manager: manager;
  inspect: inspect;
};
