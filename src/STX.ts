import { AST, atom_tag } from "./AST";
import { LL, llappend } from "./llhelpers";

export type TopMark = "top";

export const top_mark: TopMark = "top";

export const top_marks: Marks = [top_mark, null];

export type AntiMark = "antimark";

export const antimark: AntiMark = "antimark";

export type Mark = TopMark | AntiMark | string;

export type Shift = "shift";

export const shift: Shift = "shift";

/*
 * Dual environments in typescript
 */

/*
function test() {
  const t = 12;
  type t = string;
  function bar() {
    const q = t;
    type q = t;
  }
  bar();
}
test();
*/

export type Env = { [name: string]: [LL<Mark>, string][] };

export type Rib = { type: "rib"; types_env: Env; normal_env: Env };

function label_generator(
  prefix: string
): (counter: number) => [string, number] {
  return (counter: number) => [`${prefix}${counter}`, counter + 1];
}

export const new_rib_id = label_generator("r");

export type CompilationUnit = {
  store: { [rib_id: string]: Rib };
};

export type Marks = LL<Mark>;

export type RibRef = { rib_id: string };

export type Subst = LL<Shift | RibRef>;

export type Wrap = { marks: Marks; subst: Subst };

export type STX =
  | { type: "list"; tag: string; wrap: Wrap; content: LL<STX | AST> }
  | { type: "list"; tag: string; wrap: undefined; content: LL<STX> }
  | { type: "atom"; tag: atom_tag; wrap: Wrap; content: string };

export type Binding =
  | { type: "lexical"; name: string }
  | { type: "core_syntax"; name: "splice" };

export type Context = { [label: string]: Binding };

function is_top_marked(wrap: Wrap): boolean {
  function loop_marks(marks: Marks): boolean {
    if (marks === null) return false;
    if (marks[0] === top_mark && marks[1] === null) return true;
    return loop_marks(marks[1]);
  }
  return loop_marks(wrap.marks);
}

function same_marks(m1: Marks, m2: Marks): boolean {
  return m1 === null
    ? m2 === null
    : m2 !== null && m1[0] === m2[0] && same_marks(m1[1], m2[1]);
}

function id_to_label(
  name: string,
  marks: Marks,
  subst: Subst,
  unit: CompilationUnit,
  resolution_type: "normal_env" | "types_env"
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
  resolution_type: "normal_env" | "types_env"
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

export function extend_rib<S>(
  rib: Rib,
  name: string,
  marks: Marks,
  counter: number,
  env_type: "normal_env" | "types_env",
  sk: (args: { rib: Rib; counter: number; label: string }) => S,
  fk: (reason: string) => S
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
  k: (args: { context: Context; counter: number }) => S
): S {
  const new_name = `${original_name}_${counter}`;
  const new_counter = counter + 1;
  const new_context: Context = {
    ...context,
    [label]: { type: binding_type, name: new_name },
  };
  return k({ context: new_context, counter: new_counter });
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

export function init_top_level(ast: AST): {
  stx: STX;
  counter: number;
  unit: CompilationUnit;
  context: Context;
} {
  const [rib_id, counter] = new_rib_id(0);
  const wrap: Wrap = { marks: top_marks, subst: [{ rib_id }, null] };
  const unit: CompilationUnit = {
    store: {
      [rib_id]: {
        type: "rib",
        types_env: {},
        normal_env: {
          splice: [[top_marks, "global.splice"]],
        },
      },
    },
  };
  const context: Context = {
    "global.splice": { type: "core_syntax", name: "splice" },
  };
  const stx: STX = { ...ast, wrap };
  return {
    stx,
    counter,
    unit,
    context,
  };
}

export function extend_unit(
  unit: CompilationUnit,
  rib_id: string,
  rib: Rib
): CompilationUnit {
  return {
    store: { ...unit.store, [rib_id]: rib },
  };
}
