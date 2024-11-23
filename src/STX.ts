import { AST } from "./AST";
import { llappend } from "./llhelpers";
import { core_handlers } from "./syntax-core-patterns";
import {
  antimark,
  Binding,
  CompilationUnit,
  Context,
  Marks,
  new_rib_id,
  Rib,
  shift,
  STX,
  Subst,
  top_mark,
  top_marks,
  Wrap,
} from "./syntax-structures";

function is_top_marked(wrap: Wrap): boolean {
  function loop_marks(marks: Marks): boolean {
    if (marks === null) return false;
    if (marks[0] === top_mark && marks[1] === null) return true;
    return loop_marks(marks[1]);
  }
  return loop_marks(wrap.marks);
}

function same_marks(m1: Marks, m2: Marks): boolean {
  return m1 === null ? m2 === null : m2 !== null && m1[0] === m2[0] && same_marks(m1[1], m2[1]);
}

function id_to_label(
  name: string,
  marks: Marks,
  subst: Subst,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env",
): string | undefined {
  function loop(marks: Marks | null, subst: Subst): string | undefined {
    if (marks === null) throw new Error("missing marks");
    if (subst === null) return undefined; // unbound
    if (subst[0] === shift) return loop(marks[1], subst[1]);
    const env = (({ rib_id }) => {
      const rib = unit.store[rib_id];
      if (rib === undefined) throw new Error("missing rib");
      return rib[resolution_type];
    })(subst[0]);
    const ls = env[name];
    if (ls === undefined) return loop(marks, subst[1]);
    const entry = ls.find(([ms, _]) => same_marks(ms, marks));
    if (entry === undefined) return loop(marks, subst[1]);
    return entry[1];
  }
  return loop(marks, subst);
}

export type Resolution =
  | { type: "unbound" }
  | { type: "bound"; binding: Binding }
  | { type: "error"; reason: string };

export function resolve(
  name: string,
  { marks, subst }: Wrap,
  context: Context,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env",
): Resolution {
  const label = id_to_label(name, marks, subst, unit, resolution_type);
  if (label === undefined) {
    return { type: "unbound" };
  }
  const binding = context[label];
  if (binding) {
    return { type: "bound", binding };
  } else {
    return { type: "error", reason: "out of context" };
  }
}

export function free_id_equal(
  name1: string,
  wrap1: Wrap,
  name2: string,
  wrap2: Wrap,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env",
): boolean {
  const label1 = id_to_label(name1, wrap1.marks, wrap1.subst, unit, resolution_type);
  const label2 = id_to_label(name2, wrap2.marks, wrap2.subst, unit, resolution_type);
  if (label1 === undefined && label2 === undefined) {
    return name1 === name2;
  } else {
    return label1 === label2;
  }
}

export function extend_rib<S>(
  rib: Rib,
  name: string,
  marks: Marks,
  counter: number,
  env_type: "normal_env" | "types_env",
  sk: (args: { rib: Rib; counter: number; label: string }) => S,
  fk: (reason: string) => S,
): S {
  const env = rib[env_type];
  const entry = env[name] ?? [];
  if (entry.find((x) => same_marks(x[0], marks))) {
    return fk(`${name} is already defined in ${env_type}`);
  }
  const label = `l${counter}`;
  const new_counter = counter + 1;
  const new_rib: Rib = {
    ...rib,
    [env_type]: { ...env, [name]: [...entry, [marks, label]] },
  };
  return sk({ rib: new_rib, counter: new_counter, label });
}

export function extend_context<S>(
  context: Context,
  counter: number,
  label: string,
  binding_type: "lexical",
  original_name: string,
  k: (args: { context: Context; name: string; counter: number }) => S,
): S {
  const new_name = `${original_name}_${counter}`;
  const new_counter = counter + 1;
  const new_context: Context = {
    ...context,
    [label]: { type: binding_type, name: new_name },
  };
  return k({ context: new_context, name: new_name, counter: new_counter });
}

function merge_wraps(outerwrap: Wrap, innerwrap?: Wrap): Wrap {
  if (innerwrap === undefined) return outerwrap;
  if (is_top_marked(outerwrap)) {
    throw new Error("merge of top-marked outer");
  }
  if (outerwrap.marks && innerwrap.marks && innerwrap.marks[0] === antimark) {
    throw new Error("found antimark");
  } else {
    return {
      marks: llappend(outerwrap.marks, innerwrap.marks),
      subst: llappend(outerwrap.subst, innerwrap.subst),
    };
  }
}

export function push_wrap(outerwrap: Wrap): (stx: AST | STX) => STX {
  return (stx: STX | AST) => {
    const wrap = merge_wraps(outerwrap, stx.wrap);
    switch (stx.type) {
      case "list": {
        return {
          type: "list",
          wrap,
          tag: stx.tag,
          content: stx.content,
        };
      }
      case "atom": {
        return {
          type: "atom",
          wrap,
          tag: stx.tag,
          content: stx.content,
        };
      }
    }
  };
}

function init_global_context(patterns: CorePatterns, wrap: (ast: AST) => STX): Context {
  const binding_entries = Object.entries(patterns).map(([name, pattern]) => [
    `global.${name}`,
    { type: "core_syntax", name, pattern: wrap(pattern) },
  ]);
  const context: Context = Object.fromEntries(binding_entries);
  return context;
}

export type CorePatterns = { [k: string]: AST };

export function init_top_level(
  ast: AST,
  patterns: CorePatterns,
): {
  stx: STX;
  counter: number;
  unit: CompilationUnit;
  context: Context;
} {
  const [rib_id, counter] = new_rib_id(0);
  const top_wrap: Wrap = { marks: top_marks, subst: [{ rib_id }, null] };
  function wrap(ast: AST): STX {
    return { ...ast, wrap: top_wrap };
  }
  const unit: CompilationUnit = {
    store: {
      [rib_id]: {
        type: "rib",
        types_env: {},
        normal_env: Object.fromEntries(
          Object.keys(core_handlers).map((name) => [name, [[top_marks, `global.${name}`]]]),
        ),
      },
    },
  };
  return {
    stx: wrap(ast),
    counter,
    unit,
    context: init_global_context(patterns, wrap),
  };
}

export function extend_unit(unit: CompilationUnit, rib_id: string, rib: Rib): CompilationUnit {
  return {
    store: { ...unit.store, [rib_id]: rib },
  };
}
