import { assert } from "./assert";
import { AST } from "./ast";
import { LL, llappend } from "./llhelpers";
import {
  AE,
  antimark,
  Binding,
  CompilationUnit,
  Context,
  Label,
  Loc,
  Marks,
  new_rib_id,
  Rib,
  shift,
  STX,
  Subst,
  top_mark,
  Wrap,
} from "./syntax-structures";
import { globals_cuid, init_global_unit } from "./global-module";
import { syntax_error } from "./stx-error";

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
  global_unit: CompilationUnit,
): Label | undefined {
  function lookup(marks: Marks | null, subst: Subst): Label | undefined {
    if (marks === null) throw new Error("missing marks");
    if (subst === null) return undefined; // unbound
    if (subst[0] === shift) return lookup(marks[1], subst[1]);
    const rib = (({ rib_id, cu_id }) => {
      if (cu_id === unit.cu_id) {
        const rib = unit.store[rib_id];
        if (rib === undefined) {
          throw new Error(`missing rib '${rib_id}', unit:${Object.keys(unit.store).join(",")}`);
        }
        return rib;
      } else if (cu_id === globals_cuid) {
        const unit = global_unit;
        const rib = unit.store[rib_id];
        assert(rib !== undefined, `missing rib in global unit`);
        return rib;
      } else {
        // need to resolve name, marks in imported rib?
        throw new Error(`unhandled imported rib?  ${name} ${cu_id}, ${JSON.stringify(marks)}`);
      }
    })(subst[0]);
    const ls = rib[resolution_type][name];
    const entry = ls?.find(([ms, _]) => same_marks(ms, marks));
    if (entry === undefined) return lookup(marks, subst[1]);
    const label = entry[1];
    if (typeof label === "string") {
      console.error(rib);
      throw new Error(`invalid label`);
    }
    return label;
  }
  return lookup(marks, subst);
}

export type Resolution =
  | { type: "unbound" }
  | { type: "bound"; binding: Binding; label: Label }
  | { type: "error"; reason: string };

export function resolve(
  name: string,
  { marks, subst }: Wrap,
  context: Context,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env",
  global_unit: CompilationUnit,
  global_context: Context,
): Resolution {
  const label = id_to_label(name, marks, subst, unit, resolution_type, global_unit);
  if (label === undefined) {
    return { type: "unbound" };
  }
  if (label.cuid === unit.cu_id) {
    // label defined in the current context
    const binding = context[label.name];
    if (binding) {
      return { type: "bound", binding, label };
    } else {
      return { type: "error", reason: "out of context" };
    }
  } else if (label.cuid === globals_cuid) {
    const binding = global_context[label.name];
    assert(binding !== undefined);
    return { type: "bound", binding, label };
  } else {
    // label imported from somewhere else
    throw new Error(`TODO, imported label ${name} ${label.cuid} ${unit.cu_id}`);
  }
}

export function free_id_equal(
  name1: string,
  wrap1: Wrap,
  name2: string,
  wrap2: Wrap,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env",
  global_unit: CompilationUnit,
): boolean {
  const label1 = id_to_label(name1, wrap1.marks, wrap1.subst, unit, resolution_type, global_unit);
  const label2 = id_to_label(name2, wrap2.marks, wrap2.subst, unit, resolution_type, global_unit);
  if (label1 === undefined && label2 === undefined) {
    return name1 === name2;
  } else {
    return label1?.cuid === label2?.cuid && label1?.name === label2?.name;
  }
}

export function bound_id_equal(id1: STX, id2: STX): boolean {
  assert(id1.type === "atom" && id1.tag === "identifier");
  assert(id2.type === "atom" && id2.tag === "identifier");
  return id1.content === id2.content && same_marks(id1.wrap.marks, id2.wrap.marks);
}

export function rib_push(
  rib: Rib,
  name: string,
  marks: Marks,
  label: Label,
  env_type: "normal_env" | "types_env",
  loc: Loc,
): Rib {
  const env = rib[env_type];
  const entry = env[name] ?? [];
  if (entry.find((x) => same_marks(x[0], marks))) {
    syntax_error(loc, `${name} is already defined in ${env_type}`);
  }
  return {
    ...rib,
    [env_type]: { ...env, [name]: [...entry, [marks, label]] },
  };
}

export function rib_push_no_check(
  rib: Rib,
  name: string,
  marks: Marks,
  label: Label,
  env_type: "normal_env" | "types_env",
): Rib {
  const env = rib[env_type];
  const entry = env[name] ?? [];
  return {
    ...rib,
    [env_type]: { ...env, [name]: [...entry, [marks, label]] },
  };
}

export function extend_rib<S>(
  rib: Rib,
  cuid: string,
  name: string,
  marks: Marks,
  counter: number,
  env_type: "normal_env" | "types_env",
  sk: (args: { rib: Rib; counter: number; label: Label }) => S,
  fk: (reason: string) => S,
): S {
  const env = rib[env_type];
  const entry = env[name] ?? [];
  if (entry.find((x) => same_marks(x[0], marks))) {
    return fk(`${name} is already defined in ${env_type}`);
  }
  const label: Label = { cuid, name: `l${counter}` };
  const new_counter = counter + 1;
  const new_rib = rib_push_no_check(rib, name, marks, label, env_type);
  return sk({ rib: new_rib, counter: new_counter, label });
}

export function extend_context(context: Context, label: string, binding: Binding): Context {
  return { ...context, [label]: binding };
}

export function extend_context_lexical<S>(
  context: Context,
  counter: number,
  label: string,
  binding_type: "lexical" | "type",
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

function llcancel<X>(ls1: [X, LL<X>], ls2: [X, LL<X>]): LL<X> {
  function f(x: X, ls: LL<X>): LL<X> {
    if (ls === null) {
      return ls2[1];
    } else {
      return [x, f(ls[0], ls[1])];
    }
  }
  return f(ls1[0], ls1[1]);
}

function merge_aes(ls1: LL<AE>, ls2: LL<AE>): LL<AE> {
  if (ls1 !== null && ls2 !== null && ls2[0] === false) {
    return llcancel(ls1, ls2);
  } else {
    return llappend(ls1, ls2);
  }
}

function merge_wraps(outerwrap: Wrap, innerwrap?: Wrap): Wrap {
  if (innerwrap === undefined) return outerwrap;
  if (is_top_marked(outerwrap)) {
    throw new Error("merge of top-marked outer");
  }
  if (outerwrap.marks && innerwrap.marks && innerwrap.marks[0] === antimark) {
    assert(outerwrap.subst !== null);
    assert(innerwrap.subst !== null);
    return {
      marks: llcancel(outerwrap.marks, innerwrap.marks),
      subst: llcancel(outerwrap.subst, innerwrap.subst),
      aes: merge_aes(outerwrap.aes, innerwrap.aes),
    };
  } else {
    return {
      marks: llappend(outerwrap.marks, innerwrap.marks),
      subst: llappend(outerwrap.subst, innerwrap.subst),
      aes: merge_aes(outerwrap.aes, innerwrap.aes),
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
          src: stx,
        };
      }
      case "atom": {
        return {
          type: "atom",
          wrap,
          tag: stx.tag,
          content: stx.content,
          src: stx,
        };
      }
    }
  };
}

export type CorePatterns = { [k: string]: AST };

export function init_top_level(
  ast: AST,
  cuid: string,
  globals: string[],
  global_macros: string[],
): {
  stx: STX;
  counter: number;
  unit: CompilationUnit;
  rib: Rib;
  rib_id: string;
} {
  const [rib_id, counter] = new_rib_id(0);
  const { top_wrap, rib, unit } = init_global_unit(cuid, rib_id, globals, global_macros);
  function wrap(ast: AST): STX {
    return { ...ast, wrap: top_wrap, src: ast };
  }
  return {
    stx: wrap(ast),
    counter,
    unit,
    rib,
    rib_id,
  };
}

export type lexical_extension =
  | { extensible: true; rib_id: string; rib: Rib }
  | { extensible: false };

export type modular_extension =
  | { extensible: true; implicit: Rib; explicit: Rib }
  | { extensible: false };

export function extend_unit(unit: CompilationUnit, extension: lexical_extension): CompilationUnit {
  if (extension.extensible) {
    const { rib_id, rib } = extension;
    return {
      cu_id: unit.cu_id,
      store: { ...unit.store, [rib_id]: rib },
    };
  } else {
    return unit;
  }
}

export function extend_modular(
  modular: modular_extension,
  exporting: boolean,
  name: string,
  marks: Marks,
  label: Label,
  env_type: "types_env" | "normal_env",
  loc: Loc,
): modular_extension {
  if (modular.extensible) {
    const { implicit, explicit } = modular;
    return {
      extensible: true,
      implicit: rib_push(implicit, name, marks, label, env_type, loc),
      explicit: exporting ? rib_push(explicit, name, marks, label, env_type, loc) : explicit,
    };
  } else {
    assert(!exporting);
    return modular;
  }
}
