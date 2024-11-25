import { assert } from "./assert";
import { AST, atom_tag, list_tag } from "./AST";
import { CompilationUnit, Context, new_rib_id, Rib, Loc, Wrap, STX } from "./syntax-structures";
import {
  extend_unit,
  init_top_level,
  resolve,
  extend_rib,
  extend_context_lexical,
  CorePatterns,
} from "./STX";
import { change, go_down, go_next, go_right, go_up, mkzipper, wrap_loc } from "./zipper";
import { apply_syntax_rules, core_handlers } from "./syntax-core-patterns";
import { debug, DONE, inspect, in_isolation, Step, syntax_error } from "./step";

class SInitial extends Step {
  constructor(loc: Loc, unit: CompilationUnit, context: Context, counter: number) {
    super("ExpandProgram", loc, undefined, () => expand_program({ loc, unit, context, counter }));
  }
}

export function initial_step(ast: AST, patterns: CorePatterns): Step {
  const { stx, counter, unit, context } = init_top_level(ast, patterns);
  const loc: Loc = mkzipper(stx);
  return new SInitial(loc, unit, context, counter);
}

type goodies = { loc: Loc; rib: Rib; context: Context; counter: number; unit: CompilationUnit };

function gen_lexical({
  loc,
  rib,
  counter,
  context,
  unit,
}: goodies): Omit<goodies, "loc"> & { name: string } {
  const stx = loc.t;
  assert(stx.type === "atom" && stx.tag === "identifier");
  return extend_rib(
    rib,
    stx.content,
    stx.wrap.marks,
    counter,
    "normal_env",
    ({ rib, counter, label }) =>
      extend_context_lexical(
        context,
        counter,
        label,
        "lexical",
        stx.content,
        ({ context, counter, name }) => ({
          rib,
          context,
          counter,
          name,
          unit,
        }),
      ),
    (reason) => syntax_error(loc, reason),
  );
}

function extract_lexical_declaration_bindings({
  loc,
  rib,
  context,
  counter,
  unit,
}: goodies): goodies {
  function after_vars({ loc, rib, context, counter, unit }: goodies): goodies {
    if (loc.t.type === "atom" && loc.t.tag === "other") {
      switch (loc.t.content) {
        case ";":
          return go_right(
            loc,
            (loc) => syntax_error(loc, "expected nothing after semicolon"),
            (loc) => ({ loc, rib, context, counter, unit }),
          );
        case ",":
          return go_right(
            loc,
            (loc) => get_vars(loc, rib, context, counter),
            (loc) => syntax_error(loc, "expected variable after ','"),
          );
      }
    }
    syntax_error(loc, "expected a ',' or a ';'");
  }

  function get_vars(ls: Loc, rib: Rib, context: Context, counter: number): goodies {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(
        ls,
        (loc) => {
          const goodies = gen_lexical({ loc, rib, counter, context, unit });
          return go_next(
            ls,
            (loc) => after_vars({ ...goodies, loc }),
            (loc) => ({ ...goodies, loc }),
          );
        },
        syntax_error,
      );
    } else {
      syntax_error(ls, `expected a variable declaration; found ${ls.t.tag}`);
    }
  }
  return go_down(
    loc,
    (loc) => {
      if (loc.t.type === "atom") {
        if (loc.t.tag === "other" && (loc.t.content === "const" || loc.t.content === "let")) {
          return go_right(
            loc,
            (loc) => get_vars(loc, rib, context, counter),
            (loc) => syntax_error(loc, "no bindings after keyword"),
          );
        } else {
          throw new Error(`HERE? ${loc.t.type}:${loc.t.tag}`);
        }
      } else {
        syntax_error(loc, "expected keyword const or let");
      }
    },
    syntax_error,
  );
}

function expand_program(step: {
  loc: Loc;
  unit: CompilationUnit;
  context: Context;
  counter: number;
}): never {
  assert(step.loc.t.tag === "program");
  const rib: Rib = {
    type: "rib",
    types_env: {},
    normal_env: {},
  };
  const [rib_id, counter] = new_rib_id(step.counter);
  const wrap: Wrap = { marks: null, subst: [{ rib_id }, null] };
  const loc = go_down(
    wrap_loc(step.loc, wrap),
    (x) => x,
    (loc) => syntax_error(loc, "empty program?"),
  );
  return preexpand_body({
    loc,
    rib,
    unit: extend_unit(step.unit, rib_id, rib), // rib is empty
    context: step.context,
    counter,
    k: ({ loc, rib, counter, context, unit }) => {
      // rib is filled
      // context is filled also
      return postexpand_program({
        loc,
        counter,
        context,
        unit: extend_unit(unit, rib_id, rib),
        k: DONE,
      });
    },
  });
}

function preexpand_body(step: {
  loc: Loc;
  rib: Rib;
  unit: CompilationUnit;
  context: Context;
  counter: number;
  k: (props: goodies) => never;
}): never {
  return in_isolation<goodies>(
    step.loc,
    (loc, k) => preexpand_forms({ ...step, loc, k: (gs) => k(gs.loc, gs) }),
    (loc, { rib, context, counter, unit }) =>
      go_next(
        loc,
        (loc) => preexpand_body({ loc, rib, counter, context, unit, k: step.k }),
        (loc) => step.k({ loc, rib, context, counter, unit }),
      ),
  );
}

function preexpand_body_curly(step: {
  loc: Loc;
  rib: Rib;
  unit: CompilationUnit;
  context: Context;
  counter: number;
  k: (props: goodies) => never;
}): never {
  if (step.loc.t.type === "atom" && step.loc.t.tag === "other" && step.loc.t.content === "}") {
    return go_right(step.loc, syntax_error, () =>
      step.k({
        loc: go_up(step.loc),
        context: step.context,
        counter: step.counter,
        rib: step.rib,
        unit: step.unit,
      }),
    );
  }
  return in_isolation<goodies>(
    step.loc,
    (loc, k) => preexpand_forms({ ...step, loc, k: (gs) => k(gs.loc, gs) }),
    (loc, { rib, context, counter, unit }) => {
      return go_right(
        loc,
        (loc) => preexpand_body_curly({ loc, rib, counter, context, unit, k: step.k }),
        (loc) => syntax_error(loc, "no right"),
      );
    },
  );
}

function handle_core_syntax(
  loc: Loc,
  name: string,
  context: Context,
  unit: CompilationUnit,
  counter: number,
  k: (gs: { loc: Loc; counter: number; unit: CompilationUnit; context: Context }) => never,
  pattern: STX,
): never {
  const handler = core_handlers[name];
  assert(handler !== undefined);
  return handler(loc, context, unit, counter, k, pattern);
}

const atom_handlers_table: { [tag in atom_tag]: "next" | "stop" } = {
  identifier: "stop",
  type_identifier: "stop",
  property_identifier: "stop",
  shorthand_property_identifier: "stop",
  number: "next",
  jsx_text: "next",
  string_fragment: "next",
  regex_pattern: "next",
  ERROR: "stop",
  other: "next",
};

const list_handlers_table: { [tag in list_tag]: "descend" | "stop" } = {
  lexical_declaration: "stop",
  variable_declarator: "stop",
  export_statement: "stop",
  slice: "descend",
  arrow_function: "stop",
  statement_block: "stop",
  call_expression: "descend",
  arguments: "descend",
  binary_expression: "descend",
  unary_expression: "descend",
  array: "descend",
  member_expression: "descend",
  empty_statement: "descend",
  formal_parameters: "stop",
  program: "stop",
  parenthesized_expression: "descend",
  ternary_expression: "descend",
  ERROR: "stop",
};

function preexpand_block(step: {
  loc: Loc;
  rib: Rib;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  k: (goodies: goodies) => never;
}): never {
  const loc = step.loc;
  assert(loc.t.type === "list" && loc.t.tag === "statement_block");
  const bodies = go_down(loc, itself, (loc) => syntax_error(loc, "no bodies"));
  assert(bodies.t.type === "atom" && bodies.t.tag === "other" && bodies.t.content === "{");
  const bodies_rest = go_right(bodies, itself, (loc) => syntax_error(loc, "no body rest"));
  return preexpand_body_curly({
    ...step,
    loc: bodies_rest,
    k: (gs) => {
      const loc = gs.loc;
      assert(loc.t.type === "list" && loc.t.tag === "statement_block");
      return step.k(gs);
    },
  });
}

function expand_concise_body(step: {
  loc: Loc;
  rib: Rib;
  rib_id: string;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  k: (loc: Loc) => never;
}): never {
  const loc = step.loc;
  const k: (gs: goodies) => never = (gs: goodies) => {
    const new_unit = extend_unit(gs.unit, step.rib_id, gs.rib);
    return postexpand_body({ ...gs, unit: new_unit, k: step.k });
  };
  return loc.t.type === "list" && loc.t.tag === "statement_block"
    ? preexpand_block({
        ...step,
        k: ({ loc, ...gs }) =>
          go_down(
            loc,
            (loc) => k({ ...gs, loc }),
            (loc) => debug(loc, "???"),
          ),
      })
    : preexpand_forms({ ...step, k });
}

function preexpand_forms(step: {
  loc: Loc;
  rib: Rib;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  k: (goodies: goodies) => never;
}): never {
  function done(loc: Loc): never {
    return step.k({
      loc,
      rib: step.rib,
      context: step.context,
      counter: step.counter,
      unit: step.unit,
    });
  }
  function next(loc: Loc): never {
    return go_next(loc, (loc) => h(find_form(loc)), done);
  }
  function h(ffrv: ffrv): never {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc);
      case "identifier": {
        assert(
          (loc.t.type === "atom" && loc.t.tag === "identifier") ||
            loc.t.tag === "property_identifier",
          loc.t,
        );
        const { content, wrap } = loc.t;
        const resolution = resolve(content, wrap, step.context, step.unit, "normal_env");
        switch (resolution.type) {
          case "unbound":
            return next(loc);
          case "bound": {
            const binding = resolution.binding;
            switch (binding.type) {
              case "lexical":
                return next(loc);
              case "core_syntax": {
                const { name, pattern } = binding;
                return inspect(loc, "core form", () =>
                  handle_core_syntax(
                    loc,
                    name,
                    step.context,
                    step.unit,
                    step.counter,
                    ({ loc, counter, unit, context }) =>
                      inspect(loc, `core output`, () =>
                        preexpand_forms({ loc, rib: step.rib, counter, unit, context, k: step.k }),
                      ),
                    pattern,
                  ),
                );
              }
              case "syntax_rules_transformer": {
                const { clauses } = binding;
                inspect(loc, `transformer form`, () =>
                  apply_syntax_rules(loc, clauses, step.unit, step.counter, (loc, counter) =>
                    inspect(loc, `transformer output`, () =>
                      preexpand_forms({ ...step, counter, loc }),
                    ),
                  ),
                );
              }
              default:
                const invalid: never = binding;
                throw invalid;
            }
          }
          case "error":
            syntax_error(loc, resolution.reason);
          default:
            const invalid: never = resolution;
            throw invalid;
        }
      }
      case "list": {
        assert(loc.t.type === "list");
        switch (loc.t.tag) {
          case "lexical_declaration": {
            const goodies = extract_lexical_declaration_bindings({ ...step, loc });
            return go_next(
              goodies.loc,
              //(loc) => syntax_error(loc, "unexpected token after lexical"),
              (loc) => preexpand_forms({ ...goodies, loc, k: step.k }),
              (loc) => step.k({ ...goodies, loc }),
            );
          }
          case "arrow_function":
            return next(loc);
          default: {
            assert(list_handlers_table[loc.t.tag] === "descend", `non descend tag '${loc.t.tag}'`);
            return next(loc);
          }
        }
      }
    }
  }
  return h(find_form(step.loc));
}

type ffrv =
  | { type: "done"; loc: Loc }
  | { type: "identifier"; loc: Loc }
  | { type: "list"; loc: Loc };

function find_form(loc: Loc): ffrv {
  function done(loc: Loc): ffrv {
    return { type: "done", loc };
  }
  function find_form(loc: Loc): ffrv {
    switch (loc.t.type) {
      case "atom": {
        const { tag, content } = loc.t;
        const action = atom_handlers_table[tag];
        switch (action) {
          case "stop": {
            return { type: "identifier", loc };
          }
          case "next": {
            return go_next(loc, find_form, done);
          }
          case undefined:
            throw new Error(`no table entry for atom ${tag}:${content}`);
          default:
            const invalid: never = action;
            throw invalid;
        }
      }
      case "list": {
        const { tag } = loc.t;
        const action = list_handlers_table[tag];
        if (action === undefined) {
          throw new Error(`no stop_table entry for ${tag}`);
        }
        switch (action) {
          case "descend":
            return go_down(loc, find_form, (loc) => go_next(loc, find_form, done));
          case "stop":
            return {
              type: "list",
              loc,
            };
          default:
            const invalid: never = action;
            throw invalid;
        }
      }
      default:
        const invalid: never = loc.t;
        throw invalid;
    }
  }
  return find_form(loc);
}

function postexpand_program(step: {
  loc: Loc;
  unit: CompilationUnit;
  counter: number;
  context: Context;
  k: (loc: Loc) => never;
}): never {
  assert(step.loc.t.tag === "program");
  // console.log(`postexpand store=${Object.keys(step.unit.store).join(",")}`);
  return go_down(
    step.loc,
    (loc) =>
      postexpand_body({
        loc,
        unit: step.unit,
        counter: step.counter,
        context: step.context,
        k: step.k,
      }),
    (loc) => step.k(loc),
  );
}

function invalid_form(loc: Loc): never {
  syntax_error(loc, "invalid form");
}

function itself(loc: Loc): Loc {
  return loc;
}

function extract_parameters(goodies: goodies): goodies {
  //

  function tail(goodies: goodies): goodies {
    const loc = goodies.loc;
    switch (loc.t.type) {
      case "atom": {
        switch (loc.t.tag) {
          case "other": {
            switch (loc.t.content) {
              case ",":
                return go_right(loc, (loc) => head({ ...goodies, loc }), invalid_form);
              case ")":
                return go_right(loc, invalid_form, (loc) => ({ ...goodies, loc: go_up(loc) }));
            }
          }
        }
      }
    }
    syntax_error(loc);
  }

  function head(goodies: goodies): goodies {
    const loc = goodies.loc;
    switch (loc.t.type) {
      case "atom": {
        switch (loc.t.tag) {
          case "identifier": {
            const gs = identifier(goodies);
            return go_right(gs.loc, (loc) => tail({ ...gs, loc }), invalid_form);
          }
          case "other": {
            switch (loc.t.content) {
              case ",":
                return invalid_form(loc);
              case ")":
                return go_right(loc, invalid_form, (loc) => ({ ...goodies, loc: go_up(loc) }));
            }
          }
        }
      }
    }
    syntax_error(loc);
  }

  const rename = (loc: Loc, name: string) =>
    change(loc, {
      type: "loc",
      p: { type: "top" },
      t: { type: "atom", tag: "identifier", content: name, wrap: { marks: null, subst: null } },
    });

  function identifier(goodies: goodies): goodies {
    const id = goodies.loc.t;
    assert(id.type === "atom" && id.tag === "identifier");
    const { name, ...gs } = gen_lexical(goodies);
    return { ...gs, loc: rename(goodies.loc, name) };
  }

  function first_param(goodies: goodies): goodies {
    switch (goodies.loc.t.type) {
      case "atom": {
        switch (goodies.loc.t.tag) {
          case "identifier":
            const gs = identifier(goodies);
            return go_right(gs.loc, invalid_form, (loc) => ({ ...gs, loc: go_up(loc) }));
          case "other": {
            if (goodies.loc.t.content === "(") {
              return go_right(goodies.loc, (loc) => head({ ...goodies, loc }), invalid_form);
            }
          }
        }
        return syntax_error(goodies.loc);
      }
    }
    debug(goodies.loc, "non atom first_param");
  }
  {
    assert(goodies.loc.t.type === "list" && goodies.loc.t.tag === "formal_parameters");
    return go_down(goodies.loc, (loc) => first_param({ ...goodies, loc }), invalid_form);
  }
}

function check_punct(loc: Loc, content: string) {
  if (loc.t.type !== "atom" || loc.t.tag !== "other" || loc.t.content !== content) {
    syntax_error(loc, `expected '${content}'`);
  }
}

function expand_arrow_function({
  loc,
  counter,
  context,
  unit,
  arrow_k,
}: {
  loc: Loc;
  counter: number;
  context: Context;
  unit: CompilationUnit;
  arrow_k: (loc: Loc, _?: undefined) => never;
}): never {
  return go_down(
    loc,
    (loc) => {
      const pgs = extract_parameters({
        loc,
        rib: { type: "rib", normal_env: {}, types_env: {} },
        counter,
        context,
        unit,
      });
      const arr = go_right(pgs.loc, itself, invalid_form);
      check_punct(arr, "=>");
      const body = go_right(arr, itself, invalid_form);
      return in_isolation(
        body,
        (body, k) => {
          const [rib_id, new_counter] = new_rib_id(pgs.counter);
          const wrap: Wrap = { marks: null, subst: [{ rib_id }, null] };
          const loc = wrap_loc(body, wrap);
          const new_unit = extend_unit(pgs.unit, rib_id, pgs.rib); // params are in rib
          return expand_concise_body({
            loc,
            rib: pgs.rib,
            rib_id,
            context: pgs.context,
            counter: new_counter,
            unit: new_unit,
            k: (loc) => k(loc, undefined),
          });
        },
        (loc) => {
          return arrow_k(loc);
        },
      );
    },
    invalid_form,
  );
}

function postexpand_body(step: {
  loc: Loc;
  unit: CompilationUnit;
  counter: number;
  context: Context;
  k: (loc: Loc) => never;
}): never {
  function done(loc: Loc): never {
    return step.k(loc);
  }
  function cont(loc: Loc): never {
    return go_next(loc, (loc) => h(find_form(loc)), done);
  }
  function descend(loc: Loc): never {
    return go_down(loc, (loc) => h(find_form(loc)), cont);
  }
  function h(ffrv: ffrv): never {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc);
      case "identifier": {
        assert(loc.t.type === "atom");
        const { tag, content, wrap } = loc.t;
        switch (tag) {
          case "identifier": {
            const resolution = resolve(content, wrap, step.context, step.unit, "normal_env");
            switch (resolution.type) {
              case "bound": {
                const { binding } = resolution;
                switch (binding.type) {
                  case "lexical": {
                    const new_id: STX = {
                      type: "atom",
                      tag: "identifier",
                      wrap: { marks: null, subst: null },
                      content: binding.name,
                    };
                    return cont(
                      change(loc, {
                        type: "loc",
                        t: new_id,
                        p: { type: "top" },
                      }),
                    );
                  }
                }
              }
              case "unbound":
                syntax_error(loc, "unbound identifier");
            }
            debug(loc, "resolved", resolution);
          }
          default:
            debug(loc, "unhandled atom tag", tag);
        }
      }
      case "list": {
        if (loc.t.type !== "list") throw new Error("expected list");
        switch (loc.t.tag) {
          case "lexical_declaration":
            return descend(loc);
          case "variable_declarator":
            return descend(loc);
          case "arrow_function": {
            return in_isolation(
              loc,
              (loc, k) => expand_arrow_function({ ...step, loc, arrow_k: k }),
              cont,
            );
          }
          case "slice": {
            return syntax_error(loc, "invalid slice");
          }
          default: {
            if (list_handlers_table[loc.t.tag] !== "descend") {
              debug(loc, `unhandled '${loc.t.tag}' form in postexpand_body`);
            }
            return cont(loc);
          }
        }
      }
    }
  }
  return h(find_form(step.loc));
}

export function next_step(step: Step): Step {
  if (!step.next) throw new Error("no next step");
  try {
    const x = step.next();
    console.error(x);
    throw new Error("invalid return from step function");
  } catch (err) {
    if (err instanceof Step) {
      return err;
    } else {
      throw err;
    }
  }
}
