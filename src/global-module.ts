import { AST } from "prettier";
import {
  Binding,
  CompilationUnit,
  Context,
  Label,
  Marks,
  Rib,
  STX,
  top_marks,
  Wrap,
} from "./syntax-structures";
import { CorePatterns, extend_rib } from "./stx";
import { stdlibs } from "./generated-stdlibs";

export const globals_cuid = `@rewrite-ts/global 0.0.0`;

export function get_globals(lib: string): string[] {
  const globals: { [k: string]: string } = {};
  function intern(names: string[] | undefined) {
    names?.forEach((x) => (globals[x] = x));
  }
  function process(lib: string) {
    const x = stdlibs[lib];
    intern(x.class);
    intern(x.interface);
    intern(x.module);
    intern(x.value);
    intern(x.type);
    x.include?.forEach(process);
  }
  process(lib);
  return Object.keys(globals);
}

export function init_global_unit(
  cuid: string,
  rib_id: string,
  global_macros: string[],
  globals: string[],
) {
  const marks: Marks = [cuid, top_marks];
  const top_wrap: Wrap = { marks, subst: [{ rib_id, cu_id: cuid }, null], aes: null };
  const rib: Rib = {
    type: "rib",
    types_env: Object.fromEntries([
      ...global_macros.map((name) => [
        name,
        [[marks, { cuid: globals_cuid, name: `global.${name}` }]],
      ]),
    ]),
    normal_env: Object.fromEntries([
      ...global_macros.map((name) => [
        name,
        [[marks, { cuid: globals_cuid, name: `global.${name}` }]],
      ]),
      ...globals.map((name) => [name, [[marks, { cuid: globals_cuid, name: `global.${name}` }]]]),
    ]),
  };
  const unit: CompilationUnit = {
    cu_id: cuid,
    store: {
      [rib_id]: rib,
    },
  };
  return { top_wrap, rib, unit };
}

export function init_global_context(
  patterns: CorePatterns,
  globals: string[],
): [CompilationUnit, Context] {
  const cuid = globals_cuid;
  const rib_id = `r0`;
  const { top_wrap, unit } = init_global_unit(cuid, rib_id, Object.keys(patterns), globals);
  function wrap(ast: AST): STX {
    return { ...ast, wrap: top_wrap, src: ast };
  }
  type entry = [string, Binding];
  const syntax_entries: entry[] = Object.entries(patterns).map(([name, pattern]) => [
    `global.${name}`,
    { type: "core_syntax", name, pattern: wrap(pattern) },
  ]);
  const global_entries: entry[] = globals.map((name) => [`global.${name}`, { type: "ts", name }]);
  const global_context: Context = Object.fromEntries([...syntax_entries, ...global_entries]);
  return [unit, global_context];
}
