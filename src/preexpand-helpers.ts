import { Loc } from "./syntax-structures";

type inspect = <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T>;

export type import_resolution = {
  type: "type" | "value" | "syntax_rules_transformer";
  label: string;
  cuid: string;
};

export type imported_module = {
  resolve_exported_identifier: (name: string, loc: Loc) => Promise<import_resolution[]>;
};

export type manager = {
  resolve_import: (loc: Loc) => Promise<imported_module>;
};

export type preexpand_helpers = {
  manager: manager;
  inspect: inspect;
};
