import { assert } from "./assert";
import { AST, source_file } from "./ast";
import { LL, llappend, llmap, llreduce, llreverse, ll_to_array } from "./llhelpers";
import { syntax_error } from "./stx-error";
import {
  bound_id_equal,
  extend_context,
  extend_rib,
  extend_unit,
  lexical_extension,
  free_id_equal,
  push_wrap,
} from "./stx";
import {
  antimark,
  CompilationUnit,
  Context,
  Loc,
  new_rib_id,
  new_mark,
  Rib,
  shift,
  STX,
} from "./syntax-structures";
import { go_next, go_down, mkzipper, stx_list_content, go_up, change } from "./zipper";
import { preexpand_helpers } from "./preexpand-helpers";
import { counters, walker } from "./data";

const zipper_find: (loc: Loc, pred: (x: STX) => boolean) => Loc | null = (loc, pred) => {
  const t = loc.t;
  if (pred(t)) return loc;
  switch (t.type) {
    case "atom":
      return go_next(
        loc,
        (loc) => zipper_find(loc, pred),
        () => null,
      );
    case "list":
      return go_down(
        loc,
        (loc) => zipper_find(loc, pred),
        (loc) =>
          go_next(
            loc,
            (loc) => zipper_find(loc, pred),
            () => null,
          ),
      );
    default:
      const invalid: never = t;
      throw invalid;
  }
};

const find_identifier_by_name: (loc: Loc, name: string) => Loc | null = (loc, name) =>
  zipper_find(loc, (x) => is_id(x) && x.content === name);

const find_bound_identifer: (loc: Loc, name: STX) => Loc | null = (loc, name) => {
  return zipper_find(loc, (x: STX) => x.tag === "identifier" && bound_id_equal(x, name));
};

export type Path = Loc["p"];

const path_depth: (p: Path) => number = (p) => (p.type === "top" ? 0 : path_depth(p.p) + 1);

export type subst = [STX, LL<STX>][];

export type unification = { loc: Loc; subst: subst };

const merge_subst: (
  s1: subst | null,
  s2: subst | null,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => subst | null = (s1, s2, unit, helpers) => {
  if (s1 === null || s2 === null) return null;
  if (s1.length === 0) return s2;
  if (s2.length === 0) return s1;
  const [a, ...b] = s1;
  return merge_subst(b, extend_subst(a, s2, unit, helpers), unit, helpers);
};

const same_lhs: (x: STX, y: STX, unit: CompilationUnit, helpers: preexpand_helpers) => boolean = (
  x,
  y,
  unit,
  helpers,
) => {
  assert(typeof x.content === "string");
  assert(typeof y.content === "string");
  assert(x.wrap !== undefined);
  assert(y.wrap !== undefined);
  return free_id_equal(x.content, x.wrap, y.content, y.wrap, unit, "normal_env", helpers);
};

const same_rhs: (x: LL<STX>, y: LL<STX>) => boolean = (_x, _y) => {
  throw new Error("TODO");
};

const extend_subst: (
  [lhs, rhs]: [STX, LL<STX>],
  subst: subst,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => subst | null = ([lhs, rhs], s, unit, helpers) => {
  if (lhs.content === "_") return s; // drop underscore vars from matching
  const x = s.find((x) => same_lhs(x[0], lhs, unit, helpers));
  if (!x) return [[lhs, rhs], ...s];
  if (same_rhs(x[1], rhs)) {
    return s;
  } else {
    return null;
  }
};

const merge_unification: (
  u1: unification,
  s2: subst,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => unification | null = (u1, s2, unit, helpers) => {
  const s = merge_subst(u1.subst, s2, unit, helpers);
  if (s === null) return null;
  return { loc: u1.loc, subst: s };
};

const unify_left: (
  pat: LL<STX>,
  code: LL<STX>,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => subst | null = (pat, code, unit, helpers) => {
  if (pat === null && code === null) return [];
  return unify_right(llreverse(pat), llreverse(code), unit, helpers);
  //console.log({ pat, code });
  //throw new Error("unify_left");
};

const is_id: (x: STX) => boolean = (x) => x.tag === "identifier";

const count_ids: (ls: LL<STX>) => number = (ls) =>
  ls === null ? 0 : (is_id(ls[0]) ? 1 : 0) + count_ids(ls[1]);

const lllength: <A>(ls: LL<A>) => number = (ls) => (ls === null ? 0 : 1 + lllength(ls[1]));

const lltake: <A>(n: number, ls: LL<A>) => LL<A> = (n, ls) =>
  n === 0 ? null : (assert(ls !== null), [ls[0], lltake(n - 1, ls[1])]);

const lldrop: <A>(n: number, ls: LL<A>) => LL<A> = (n, ls) =>
  n === 0 ? ls : (assert(ls !== null), lldrop(n - 1, ls[1]));

const unify_right: (
  kwdls: LL<STX>,
  codels: LL<STX>,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => subst | null = (kwdls, codels, unit, helpers) => {
  function f(count: number, kwdls: LL<STX>, codels: LL<STX>): subst | null {
    //console.log({ count, kwdls, codels });
    if (kwdls === null) {
      assert(count === 0);
      return codels === null ? [] : null;
    }
    const [fst_pattern, rest_patterns] = kwdls;
    if (is_id(fst_pattern)) {
      assert(count > 0);
      if (count === 1) {
        const count = lllength(codels) - lllength(rest_patterns);
        if (count < 0) return null;
        const fsts = lltake(count, codels);
        const rests = lldrop(count, codels);
        assert(lllength(rest_patterns) === lllength(rests));
        const s1 = f(0, rest_patterns, rests);
        if (s1 === null) return null;
        return extend_subst([fst_pattern, fsts], s1, unit, helpers);
      } else {
        if (codels === null) return null;
        const fsts: LL<STX> = [codels[0], null];
        const rests = codels[1];
        const s1 = f(count - 1, rest_patterns, rests);
        if (s1 === null) return null;
        return extend_subst([fst_pattern, fsts], s1, unit, helpers);
      }
    }
    if (codels === null) return null;
    const [fst_code, rest_codes] = codels;
    if (fst_pattern.type === "atom") {
      const match =
        fst_code.type === "atom" &&
        fst_code.tag === fst_pattern.tag &&
        fst_code.content === fst_pattern.content;
      return match ? f(count, rest_patterns, rest_codes) : null;
    }
    if (fst_pattern.type === "list") {
      if (fst_code.type !== "list" || fst_code.tag !== fst_pattern.tag) {
        return null;
      }
      const s1 = unify_right(
        stx_list_content(fst_pattern),
        stx_list_content(fst_code),
        unit,
        helpers,
      );
      if (s1 === null) return null;
      const s2 = f(count, rest_patterns, rest_codes);
      return merge_subst(s1, s2, unit, helpers);
    }
    const invalid: never = fst_pattern;
    throw invalid;
  }
  return f(count_ids(kwdls), kwdls, codels);
};

const unify_paths: (
  kwd: Path,
  loc: Loc,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
) => unification | null = (kwd, loc, unit, helpers) => {
  const p = loc.p;
  if (kwd.type === "node" && p.type === "node") {
    if (kwd.tag !== p.tag) return null;
    const s1 = unify_left(kwd.l, p.l, unit, helpers);
    if (!s1) return null;
    const s2 = unify_right(kwd.r, p.r, unit, helpers);
    if (!s2) return null;
    const s3 = merge_subst(s1, s2, unit, helpers);
    if (!s3) return null;
    const u4 = unify_paths(kwd.p, go_up(loc), unit, helpers);
    if (!u4) return null;
    return merge_unification(u4, s3, unit, helpers);
  } else if (kwd.type === "top") {
    return { loc, subst: [] };
  } else {
    return null;
  }
};

export const core_pattern_match: (
  loc: Loc,
  unit: CompilationUnit,
  name: keyof ReturnType<typeof core_patterns>,
  helpers: preexpand_helpers,
) => Promise<unification | null> = async (loc, unit, name, helpers) => {
  const binding = helpers.global_context[`global.${name}`];
  assert(binding && binding.type === "core_syntax", `core pattern for ${name} is undefined`);
  const pattern = binding.pattern;
  const kwd = find_identifier_by_name(mkzipper(pattern), name);
  assert(kwd !== null, `keyword ${name} does not include itself in its pattern`);
  const unification = unify_paths(kwd.p, loc, unit, helpers);
  return unification;
};

const splice: walker = async ({ loc, context, unit, lexical, helpers, ...data }) => {
  const unification = await core_pattern_match(loc, unit, "splice", helpers);
  assert(unification !== null);
  const { subst } = unification;
  assert(subst.length === 1);
  const [body_kwd, body_code] = subst[0];
  assert(body_kwd.type === "atom" && body_kwd.tag === "identifier" && body_kwd.content === "body");
  const result: STX = {
    type: "list",
    tag: "slice",
    wrap: undefined,
    content: body_code,
    src: false,
  };
  return {
    loc: change(unification.loc, mkzipper(result)),
    unit,
    context,
    lexical,
    helpers,
    ...data,
  };
};

async function literal_binding(
  name: string,
  subst: subst,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
): Promise<boolean> {
  const x = subst.find(([lhs]) => lhs.content === name);
  assert(x !== undefined);
  const lhs = x[0];
  const rhsls = x[1];
  if (rhsls === null || rhsls[1] !== null) return false;
  const rhs = rhsls[0];
  if (!is_id(rhs)) return false;
  return same_lhs(lhs, rhs, unit, helpers);
}

function parse_array(stx: STX, loc: Loc): LL<STX> {
  if (stx.type !== "list" || stx.tag !== "array") syntax_error(loc, "all clauses must be arrays");
  function finalize(ls: LL<STX>): LL<STX> {
    if (ls === null) return null;
    syntax_error(loc, "unexpected content after ]");
  }
  function snd(ls: LL<STX>): LL<STX> {
    if (ls === null) syntax_error(loc, "missing ]");
    if (ls[0].content === "]") return finalize(ls[1]);
    if (ls[0].content === ",") return fst(ls[1]);
    syntax_error(loc, "unexpected content after ','");
  }
  function fst(ls: LL<STX>): LL<STX> {
    if (ls === null) syntax_error(loc, "missing content or ]");
    if (ls[0].content === "]") return finalize(ls[1]);
    if (ls[0].content === ",") syntax_error(loc, "unexpected ',' after [");
    return [ls[0], snd(ls[1])];
  }
  function init(ls: LL<STX>): LL<STX> {
    if (ls === null) syntax_error(loc, "missing array content");
    if (ls[0].content === "[") return fst(ls[1]);
    syntax_error(loc, "missing [");
  }
  return init(stx_list_content(stx));
}

type syntax_rules_clause = { pattern: Loc; template: STX };

function parse_syntax_rules_clause(stx: STX, loc: Loc): [STX, syntax_rules_clause] {
  const content = ll_to_array(parse_array(stx, loc));
  if (content.length !== 3) syntax_error(loc, "each clause must have 3 parts");
  const [name, pattern_stx, template] = content;
  if (!is_id(name)) syntax_error(loc, "first part of clause must be an identifier");
  const pattern = find_bound_identifer(mkzipper(pattern_stx), name);
  if (!pattern) syntax_error(loc, "name not found in pattern");
  return [name, { pattern, template }];
}

function group_by<K, V>(ls: [K, V][], eq: (a: K, b: K) => boolean): [K, V[]][] {
  const ac: [K, V[]][] = [];
  ls.forEach((x) => {
    const ls = ac.find((y) => eq(y[0], x[0]));
    if (ls) {
      ls[1].push(x[1]);
    } else {
      ac.push([x[0], [x[1]]]);
    }
  });
  return ac;
}

const using_rewrite_rules: walker = async ({
  loc: orig_loc,
  context: orig_context,
  unit: orig_unit,
  counters: orig_counters,
  lexical: orig_lexical,
  helpers,
  ...data
}) => {
  const unification = await core_pattern_match(orig_loc, orig_unit, "using_rewrite_rules", helpers);
  if (!unification) syntax_error(orig_loc);
  const { subst, loc } = unification;
  if (!literal_binding("rewrite", subst, orig_unit, helpers))
    syntax_error(loc, ".rewrite expected");
  const expression_binding = subst.find(([lhs]) => lhs.content === "expression");
  const clauses_binding = subst.find(([lhs]) => lhs.content === "clauses");
  assert(expression_binding !== undefined);
  assert(clauses_binding !== undefined);
  const expression_list = ll_to_array(expression_binding[1]);
  if (expression_list.length === 0) syntax_error(loc, "missing expression in .rewrite()");
  if (expression_list.length > 1) syntax_error(loc, "too many expressions in .rewrite()");
  const expression = expression_list[0];
  const clauses = group_by(
    ll_to_array(clauses_binding[1])
      .filter((x) => x.content !== ",")
      .map((x) => parse_syntax_rules_clause(x, loc)),
    (x, y) => bound_id_equal(x, y),
  );
  const [rib_id, new_counters] = new_rib_id(orig_counters);
  const cuid = orig_unit.cu_id;
  const do_wrap = push_wrap({
    marks: null,
    subst: [{ rib_id, cu_id: cuid }, null],
    aes: null,
  });
  const [new_rib, final_counters, final_context] = clauses.reduce(
    (ac: [Rib, counters, Context], [lhs, rhs]) => {
      assert(lhs.type === "atom" && lhs.wrap !== undefined);
      return extend_rib(
        ac[0],
        cuid,
        lhs.content,
        lhs.wrap.marks,
        ac[1],
        "normal_env",
        ({ rib, counters, label }) => [
          rib,
          counters,
          extend_context(ac[2], label.name, {
            type: "syntax_rules_transformer",
            clauses: rhs.map(({ pattern, template }) => ({
              pattern,
              template: do_wrap(template),
            })),
          }),
        ],
        (reason) => {
          throw new Error(`"${reason}" shouldnt happen if things are partitioned properly`);
        },
      );
    },
    [{ type: "rib", normal_env: {}, types_env: {} }, new_counters, orig_context],
  );
  const final_unit = extend_unit(orig_unit, { extensible: true, rib_id, rib: new_rib });
  const final_loc = change(loc, mkzipper(do_wrap(expression)));
  return {
    loc: final_loc,
    counters: final_counters,
    unit: final_unit,
    context: final_context,
    lexical: orig_lexical,
    helpers,
    ...data,
  };
};

function find_clause(
  loc: Loc,
  clauses: syntax_rules_clause[],
  unit: CompilationUnit,
  helpers: preexpand_helpers,
): { loc: Loc; subst: subst; template: STX } {
  for (const { pattern, template } of clauses) {
    const unification = unify_paths(pattern.p, loc, unit, helpers);
    if (unification) return { ...unification, template };
  }
  syntax_error(loc, "invalid syntax (no pattern matched)");
}

function search_and_replace(stx: STX, subst: subst, loc: Loc): LL<STX> {
  switch (stx.type) {
    case "atom": {
      if (is_id(stx)) {
        const replacement = subst.find(([lhs]) => bound_id_equal(lhs, stx));
        if (!replacement) return [stx, null];
        return replacement[1];
      } else {
        return [stx, null];
      }
    }
    case "list":
      return [
        {
          type: "list",
          tag: stx.tag,
          wrap: undefined,
          content: llreduce(
            llmap(stx_list_content(stx), (x) => search_and_replace(x, subst, loc)),
            llappend,
            null as LL<STX>,
          ),
          src: stx.src,
        },
        null,
      ];
    default:
      const invalid: never = stx;
      throw invalid;
  }
}

export async function apply_syntax_rules(
  orig_loc: Loc,
  clauses: syntax_rules_clause[],
  unit: CompilationUnit,
  orig_counters: counters,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; counters: counters }> {
  const do_antimark = push_wrap({
    marks: [antimark, null],
    subst: [shift, null],
    aes: [false, null],
  });
  const { loc, subst, template } = find_clause(orig_loc, clauses, unit, helpers);
  const antimarked_subst: subst = subst.map(([lhs, rhs]) => [lhs, llmap(rhs, do_antimark)]);
  const expressionls = search_and_replace(template, antimarked_subst, loc);
  if (expressionls === null) syntax_error(loc, "splicing error of empty slice");
  if (expressionls[1] !== null) syntax_error(loc, "splicing error of more than one thing");
  const expression = expressionls[0];
  const [mark, new_counters] = new_mark(orig_counters);
  const do_mark = push_wrap({ marks: [mark, null], subst: [shift, null], aes: [loc.t, null] });
  const new_loc = change(loc, mkzipper(do_mark(expression)));
  return { loc: new_loc, counters: new_counters };
}

const define_rewrite_rules: walker = async ({
  loc: orig_loc,
  context: orig_context,
  unit: orig_unit,
  counters: orig_counters,
  lexical: orig_lexical,
  helpers,
  ...data
}) => {
  if (orig_lexical.extensible === false)
    syntax_error(orig_loc, "cannot define rules in nondefinition context");
  const unification = await core_pattern_match(
    orig_loc,
    orig_unit,
    "define_rewrite_rules",
    helpers,
  );
  if (!unification) syntax_error(orig_loc);
  const { subst, loc } = unification;
  const clauses_binding = subst.find(([lhs]) => lhs.content === "clauses");
  assert(clauses_binding !== undefined);
  const clauses = group_by(
    ll_to_array(clauses_binding[1])
      .filter((x) => x.content !== ",")
      .map((x) => parse_syntax_rules_clause(x, loc)),
    (x, y) => bound_id_equal(x, y),
  );
  const cuid = orig_unit.cu_id;
  const [final_rib, final_counters, final_context] = clauses.reduce(
    (ac: [Rib, counters, Context], [lhs, rhs]) => {
      assert(lhs.type === "atom" && lhs.wrap !== undefined);
      return extend_rib(
        ac[0],
        cuid,
        lhs.content,
        lhs.wrap.marks,
        ac[1],
        "normal_env",
        ({ rib, counters, label }) => [
          rib,
          counters,
          extend_context(ac[2], label.name, {
            type: "syntax_rules_transformer",
            clauses: rhs,
          }),
        ],
        (reason) => syntax_error(loc, reason),
      );
    },
    [orig_lexical.rib, orig_counters, orig_context],
  );
  const lexical: lexical_extension = {
    extensible: true,
    rib_id: orig_lexical.rib_id,
    rib: final_rib,
  };
  const final_unit = extend_unit(orig_unit, lexical);
  const final_loc = change(
    loc,
    mkzipper({
      type: "list",
      tag: "slice",
      wrap: { marks: null, subst: null, aes: [loc.t, null] },
      content: null,
      src: false,
    }),
  );
  return {
    loc: final_loc,
    counters: final_counters,
    unit: final_unit,
    context: final_context,
    lexical,
    helpers,
    ...data,
  };
};

//export const pattern_match: <S>(
//  loc: Loc,
//  context: Context,
//  name: keyof ReturnType<typeof core_patterns>,
//  k: (match: LL<STX>) => S,
//  fk: () => S,
//) => S = (loc, context, name, k, fk) => {
//  const binding = context[`global.${name}`];
//  assert(binding && binding.type === "core_syntax", `core pattern for ${name} is undefined`);
//  const pattern = binding.pattern;
//  const subst = unify_right([pattern, null], [loc.t, null]);
//  if (subst === null) return fk();
//  const b = subst.find((x) => x[0].type === "atom" && x[0].content === name);
//  if (b) {
//    return k(b[1]);
//  } else {
//    return fk();
//  }
//};

export const core_handlers: { [k: string]: walker } = {
  splice,
  using_rewrite_rules,
  define_rewrite_rules,
};

export const core_patterns = (
  parse: (code: string, source_file: source_file, cuid: string) => AST,
) => {
  const pattern = (code: string) => {
    const src: source_file = {
      package: { name: "rewrite-ts", version: "0.0.0" },
      path: "internal-patterns",
    };
    const ast = parse(code, src, "internal-patterns rewrite-ts 0.0.0");
    assert(ast.type === "list" && ast.tag === "program");
    const bodies = ast.content;
    assert(bodies !== null);
    assert(bodies[1] === null, bodies);
    return bodies[0];
  };
  return {
    splice: pattern("splice(() => {body});"),
    using_rewrite_rules: pattern("using_rewrite_rules(clauses).rewrite(expression)"),
    define_rewrite_rules: pattern("define_rewrite_rules(clauses)"),
    //arrow_function_single_param: pattern("arrow_function_single_param => _;"),
    //arrow_function_paren_params: pattern("(arrow_function_paren_params) => _;"),
    //arrow_function_block_body: pattern("_ => {arrow_function_block_body};"),
    //arrow_function_other_body: pattern("_ => arrow_function_other_body;"),
  };
};
