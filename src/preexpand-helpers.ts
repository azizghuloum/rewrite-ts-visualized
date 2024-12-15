import { assert } from "./assert";
import { Binding, CompilationUnit, Context, Label, Loc, Rib } from "./syntax-structures";

type inspect = <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T>;

export type import_resolution = {
  type: "type" | "value";
  label: Label;
};

export type imported_module = {
  imported_modules: imported_module[];
  resolve_exported_identifier: (name: string, loc: Loc) => Promise<import_resolution[]>;
  ensureUpToDate(): Promise<void>;
};

export type manager = {
  resolve_import: (loc: Loc) => Promise<imported_module>;
  resolve_label: (label: Label) => Promise<Binding>;
};

export type preexpand_helpers = {
  manager: manager;
  inspect: inspect;
  global_unit: CompilationUnit;
  global_context: Context;
};

type exported_identifiers = {
  [name: string]: import_resolution[];
};

export function get_exported_identifiers_from_rib(rib: Rib): exported_identifiers {
  const ids: exported_identifiers = {};
  Object.entries(rib.normal_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    b.push({ type: "value", label });
  });
  Object.entries(rib.types_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    b.push({ type: "type", label });
  });
  return ids;
}
