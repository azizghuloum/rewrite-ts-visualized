import { assert } from "./assert";
import { Binding, CompilationUnit, Context, Label, Loc, Rib } from "./syntax-structures";

type inspect = <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T>;

export type import_resolution = {
  type: Binding["type"];
  label: Label;
};

export type imported_module = {
  imported_modules: imported_module[];
  dependant_modules: imported_module[];
  resolve_exported_identifier: (name: string, loc: Loc) => Promise<import_resolution[]>;
  ensureUpToDate(): Promise<void>;
  get_cid(): string;
  find_module_by_cid(cid: string): imported_module | undefined;
  resolve_label(name: string): Promise<Binding>;
  get_pkg_and_path(): [{ name: string; version: string }, string];
  resolve_rib: (rib_id: string) => Rib;
  get_mtime(): number;
  file_changed(): Promise<void>;
  force_recompile(): Promise<void>;
};

export type manager = {
  resolve_import: (loc: Loc) => Promise<imported_module>;
  resolve_label: (label: Label) => Promise<Binding>;
  get_import_path: (cuid: string) => Promise<string>;
  resolve_rib: (rib_id: string, cuid: string) => Rib;
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

export function get_exported_identifiers_from_rib(
  rib: Rib,
  cuid: string,
  context: Context,
): exported_identifiers {
  const ids: exported_identifiers = {};
  Object.entries(rib.normal_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    assert(label.cuid === cuid, `export of import?`);
    const binding = context[label.name];
    b.push({ type: binding.type, label });
  });
  Object.entries(rib.types_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    assert(label.cuid === cuid, `export of import?`);
    const binding = context[label.name];
    b.push({ type: binding.type, label });
  });
  return ids;
}
