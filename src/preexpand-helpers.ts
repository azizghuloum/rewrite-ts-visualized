import { assert } from "./assert";
import { Binding, Loc, Rib } from "./syntax-structures";

type inspect = <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T>;

export type import_resolution = {
  type: "type" | "value";
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

type exported_identifiers = {
  [name: string]: import_resolution[];
};

export function get_exported_identifiers_from_rib(rib: Rib, cuid: string): exported_identifiers {
  const ids: exported_identifiers = {};
  Object.entries(rib.normal_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    b.push({ type: "value", label, cuid });
  });
  Object.entries(rib.types_env).forEach(([lhs, rhs]) => {
    const b = (ids[lhs] ??= []);
    assert(rhs.length === 1);
    const [_marks, label] = rhs[0];
    b.push({ type: "type", label, cuid });
  });
  return ids;
}
