import { assert } from "./assert";
import { AST, atom_tag } from "./AST";
import { LL } from "./llhelpers";
import { Context, Loc, STX } from "./syntax-structures";
import { go_next, go_down, mkzipper, stx_list_content } from "./zipper";

type handler = <T>(loc: Loc, pattern: STX, k: (loc: Loc) => T) => T;

const zipper_find: (loc: Loc, pred: (x: STX) => boolean) => Loc | null = (
  loc,
  pred
) => {
  const t = loc.t;
  if (pred(t)) return loc;
  switch (t.type) {
    case "atom":
      return go_next(
        loc,
        (loc) => zipper_find(loc, pred),
        () => null
      );
    case "list":
      return go_down(
        loc,
        (loc) => zipper_find(loc, pred),
        (loc) =>
          go_next(
            loc,
            (loc) => zipper_find(loc, pred),
            () => null
          )
      );
    default:
      const invalid: never = t;
      throw invalid;
  }
};

const find_identifier: (name: string, loc: Loc) => Loc | null = (name, loc) =>
  zipper_find(
    loc,
    (x) => x.type === "atom" && x.tag === "identifier" && x.content === name
  );

type Path = Loc["p"];

const path_depth: (p: Path) => number = (p) =>
  p.type === "top" ? 0 : path_depth(p.p) + 1;

type subst = [STX, LL<STX>][];
type unification = { code_path: Path; subst: subst };

const merge_subst: (s1: subst | null, s2: subst | null) => subst | null = (
  s1,
  s2
) => {
  if (s1 === null || s2 === null) return null;
  if (s1.length === 0) return s2;
  if (s2.length === 0) return s1;
  const [a, ...b] = s1;
  return merge_subst(b, extend_subst(a, s2));
};

const same_lhs: (x: STX, y: STX) => boolean = (_x, _y) => {
  throw new Error("TODO");
};

const same_rhs: (x: LL<STX>, y: LL<STX>) => boolean = (_x, _y) => {
  throw new Error("TODO");
};

const extend_subst: (
  [lhs, rhs]: [STX, LL<STX>],
  subst: subst
) => subst | null = ([lhs, rhs], s) => {
  if (lhs.content === "_") return s; // drop underscore vars from matching
  const x = s.find((x) => same_lhs(x[0], lhs));
  if (!x) return [[lhs, rhs], ...s];
  if (same_rhs(x[1], rhs)) {
    return s;
  } else {
    return null;
  }
};

const merge_unification: (u1: unification, s2: subst) => unification | null = (
  u1,
  s2
) => {
  const s = merge_subst(u1.subst, s2);
  if (s === null) return null;
  return { code_path: u1.code_path, subst: s };
};

const unify_left: (pat: LL<STX>, code: LL<STX>) => subst | null = (
  pat,
  code
) => {
  if (pat === null && code === null) return [];
  console.log({ pat, code });
  throw new Error("unify_left");
};

const id_tags: { [k in atom_tag]: boolean } = {
  identifier: true,
  type_identifier: true,
  property_identifier: true,
  shorthand_property_identifier: true,
  jsx_text: false,
  number: false,
  other: false,
  regex_pattern: false,
  string_fragment: false,
};

const is_id: (x: STX) => boolean = (x) => x.type === "atom" && id_tags[x.tag];

const count_ids: (ls: LL<STX>) => number = (ls) =>
  ls === null ? 0 : (is_id(ls[0]) ? 1 : 0) + count_ids(ls[1]);

const lllength: <A>(ls: LL<A>) => number = (ls) =>
  ls === null ? 0 : 1 + lllength(ls[1]);

const lltake: <A>(n: number, ls: LL<A>) => LL<A> = (n, ls) =>
  n === 0 ? null : (assert(ls !== null), [ls[0], lltake(n - 1, ls[1])]);

const lldrop: <A>(n: number, ls: LL<A>) => LL<A> = (n, ls) =>
  n === 0 ? ls : (assert(ls !== null), lldrop(n - 1, ls[1]));

const unify_right: (kwdls: LL<STX>, codels: LL<STX>) => subst | null = (
  kwdls,
  codels
) => {
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
        return extend_subst([fst_pattern, fsts], s1);
      } else {
        throw new Error("not last one");
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
        stx_list_content(fst_code)
      );
      if (s1 === null) return null;
      const s2 = f(count, rest_patterns, rest_codes);
      return merge_subst(s1, s2);
    }
    const invalid: never = fst_pattern;
    throw invalid;
  }
  return f(count_ids(kwdls), kwdls, codels);
};

const unify_paths: (kwd: Path, code: Path) => unification | null = (
  kwd,
  code
) => {
  if (kwd.type === "node" && code.type === "node") {
    if (kwd.tag !== code.tag) return null;
    const s1 = unify_left(kwd.l, code.l);
    if (!s1) return null;
    const s2 = unify_right(kwd.r, code.r);
    if (!s2) return null;
    const s3 = merge_subst(s1, s2);
    if (!s3) return null;
    const u4 = unify_paths(kwd.p, code.p);
    if (!u4) return null;
    return merge_unification(u4, s3);
  } else if (kwd.type === "top") {
    return { code_path: code, subst: [] };
  }
  throw new Error("unify_paths");
};

const splice: handler = (loc, pattern, k) => {
  const kwd = find_identifier("splice", mkzipper(pattern));
  assert(kwd !== null);
  const unification = unify_paths(kwd.p, loc.p);
  assert(unification !== null);
  const { code_path, subst } = unification;
  assert(subst.length === 1);
  const [body_kwd, body_code] = subst[0];
  assert(
    body_kwd.type === "atom" &&
      body_kwd.tag === "identifier" &&
      body_kwd.content === "body"
  );
  const result: STX = {
    type: "list",
    tag: "slice",
    wrap: undefined,
    content: body_code,
  };
  const result_loc: Loc = { type: "loc", t: result, p: code_path };
  return k(result_loc);
};

export const pattern_match: <S>(
  loc: Loc,
  context: Context,
  name: keyof ReturnType<typeof core_patterns>,
  k: (match: LL<STX>) => S,
  fk: () => S
) => S = (loc, context, name, k, fk) => {
  const binding = context[`global.${name}`];
  assert(
    binding && binding.type === "core_syntax",
    `core pattern for ${name} is undefined`
  );
  const pattern = binding.pattern;
  const subst = unify_right([pattern, null], [loc.t, null]);
  if (subst === null) return fk();
  const b = subst.find((x) => x[0].type === "atom" && x[0].content === name);
  if (b) {
    return k(b[1]);
  } else {
    return fk();
  }
};

export const core_handlers: { [k: string]: handler } = {
  splice,
};

export const core_patterns = (parse: (code: string) => AST) => {
  const pattern = (code: string) => {
    const ast = parse(code);
    assert(ast.type === "list" && ast.tag === "program");
    const bodies = ast.content;
    assert(bodies !== null);
    assert(bodies[1] === null);
    return bodies[0];
  };
  return {
    splice: pattern("splice(() => {body});"),
    //arrow_function_single_param: pattern("arrow_function_single_param => _;"),
    //arrow_function_paren_params: pattern("(arrow_function_paren_params) => _;"),
    //arrow_function_block_body: pattern("_ => {arrow_function_block_body};"),
    //arrow_function_other_body: pattern("_ => arrow_function_other_body;"),
  };
};
