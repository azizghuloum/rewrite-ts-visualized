import { assert } from "./assert";
import { AST } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { CompilationUnit, Context, new_rib_id, Rib, Loc, Wrap, STX } from "./syntax-structures";
import {
  extend_unit,
  init_top_level,
  resolve,
  CorePatterns,
  push_wrap,
  lexical_extension,
  modular_extension,
  extend_modular,
} from "./stx";
import {
  change,
  go_down,
  go_next,
  go_right,
  go_up,
  mkzipper,
  stx_list_content,
  wrap_loc,
} from "./zipper";
import { apply_syntax_rules, core_handlers } from "./syntax-core-patterns";
import { debug, in_isolation, syntax_error } from "./stx-error";
import { array_to_ll } from "./llhelpers";
import { gen_binding, goodies, preexpand_list_handlers } from "./preexpand-handlers";
import { preexpand_helpers } from "./preexpand-helpers";

export function initial_step(
  ast: AST,
  cu_id: string,
  patterns: CorePatterns,
): [
  Loc,
  (
    helpers: preexpand_helpers,
  ) => Promise<{ loc: Loc; unit: CompilationUnit; context: Context; modular: modular_extension }>,
] {
  const { stx, counter, unit, context, rib, rib_id } = init_top_level(ast, cu_id, patterns);
  const initial_loc: Loc = mkzipper(stx);
  const lexical: lexical_extension = { extensible: true, rib, rib_id };
  return [
    initial_loc,
    (helpers: preexpand_helpers) =>
      expand_program(initial_loc, unit, context, counter, lexical, helpers),
  ];
}

async function expand_program(
  loc: Loc,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  lexical: lexical_extension,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; unit: CompilationUnit; context: Context; modular: modular_extension }> {
  async function expand(loc: Loc) {
    return preexpand_body(loc, lexical, unit, context, counter, "value", helpers).then(
      ({ loc, lexical, counter, context, unit }) => {
        // rib is filled
        // context is filled also
        const new_unit = extend_unit(unit, lexical);
        const modular: modular_extension = {
          extensible: true,
          explicit: { type: "rib", normal_env: {}, types_env: {} },
          implicit: { type: "rib", normal_env: {}, types_env: {} },
        };
        return helpers.inspect(loc, "After preexpanding the program", () =>
          postexpand_program(loc, modular, new_unit, counter, context, helpers).then(
            ({ loc, modular }) => {
              return { loc, unit: new_unit, context, modular };
            },
          ),
        );
      },
    );
  }
  async function expand_empty_program() {
    const empty_rib: Rib = { type: "rib", normal_env: {}, types_env: {} };
    const modular: modular_extension = {
      extensible: true,
      implicit: empty_rib,
      explicit: empty_rib,
    };
    const empty_export: STX = {
      type: "list",
      tag: "export_declaration",
      wrap: empty_wrap,
      content: array_to_ll([export_keyword, lt_brace_keyword, rt_brace_keyword]),
      src: false,
    };
    const empty_program: STX = {
      type: "list",
      tag: "program",
      wrap: empty_wrap,
      content: array_to_ll([empty_export]),
      src: false,
    };
    return { loc: mkzipper(empty_program), unit, context, modular };
  }
  if (loc.t.tag !== "program") syntax_error(loc, "expected a program");
  return go_down(loc, expand, expand_empty_program);
}

async function preexpand_body(
  loc: Loc,
  lexical: lexical_extension,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<goodies> {
  return in_isolation(
    loc,
    (loc) => preexpand_forms(loc, lexical, counter, unit, context, sort, helpers),
    (loc, { lexical, context, counter, unit }) =>
      go_next(
        loc,
        (loc) => preexpand_body(loc, lexical, unit, context, counter, sort, helpers),
        (loc) => Promise.resolve({ loc, lexical, context, counter, unit }),
      ),
  );
}

async function preexpand_body_curly(
  loc: Loc,
  lexical: lexical_extension,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<goodies> {
  if (loc.t.type === "atom" && loc.t.tag === "other" && loc.t.content === "}") {
    return go_right(loc, syntax_error, () =>
      Promise.resolve({
        loc: go_up(loc),
        context,
        counter,
        lexical,
        unit,
      }),
    );
  }
  return in_isolation(
    loc,
    (loc) => preexpand_forms(loc, lexical, counter, unit, context, sort, helpers),
    (loc, { lexical, context, counter, unit }) => {
      return go_right(
        loc,
        (loc) => preexpand_body_curly(loc, lexical, unit, context, counter, sort, helpers),
        (loc) => syntax_error(loc, "no right"),
      );
    },
  );
}

async function handle_core_syntax(
  loc: Loc,
  name: string,
  context: Context,
  unit: CompilationUnit,
  counter: number,
  lexical: lexical_extension,
): Promise<{
  loc: Loc;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  lexical: lexical_extension;
}> {
  const handler = core_handlers[name];
  assert(handler !== undefined);
  return handler(loc, context, unit, counter, lexical);
}

const atom_handlers_table: { [tag in atom_tag]: "next" | "stop" } = {
  identifier: "stop",
  number: "next",
  jsx_text: "next",
  string: "next",
  regex: "next",
  ERROR: "stop",
  other: "next",
};

const list_handlers_table: { [tag in list_tag]: "descend" | "stop" | "todo" } = {
  ERROR: "stop",
  lexical_declaration: "stop",
  variable_declarator: "stop",
  export_specifier: "todo",
  export_clause: "todo",
  export_declaration: "todo",
  named_exports: "todo",
  slice: "descend",
  arrow_function: "stop",
  statement_block: "stop",
  call_expression: "descend",
  arguments: "descend",
  binary_expression: "descend",
  unary_expression: "descend",
  array: "descend",
  member_expression: "stop",
  empty_statement: "descend",
  formal_parameters: "stop",
  program: "stop",
  parenthesized_expression: "descend",
  ternary_expression: "descend",
  object: "descend",
  pair: "descend",
  array_pattern: "todo",
  constraint: "todo",
  import: "todo",
  import_declaration: "stop",
  import_clause: "todo",
  import_specifier: "todo",
  namespace_import: "todo",
  named_imports: "todo",
  instantiation_expression: "todo",
  literal_type: "todo",
  object_pattern: "todo",
  property_signature: "todo",
  required_parameter: "todo",
  tuple_type: "todo",
  type_alias_declaration: "stop",
  type_annotation: "todo",
  type_arguments: "todo",
  type_parameter: "todo",
  type_parameters: "todo",
  type_query: "todo",
  syntax_list: "descend",
};

async function preexpand_block(
  loc: Loc,
  lexical: lexical_extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<goodies> {
  assert(loc.t.type === "list" && loc.t.tag === "statement_block");
  const bodies = go_down(loc, itself, (loc) => syntax_error(loc, "no bodies"));
  assert(bodies.t.type === "atom" && bodies.t.tag === "other" && bodies.t.content === "{");
  const bodies_rest = go_right(bodies, itself, (loc) => syntax_error(loc, "no body rest"));
  const gs = await preexpand_body_curly(
    bodies_rest,
    lexical,
    unit,
    context,
    counter,
    sort,
    helpers,
  );
  assert(gs.loc.t.type === "list" && gs.loc.t.tag === "statement_block");
  return gs;
}

async function expand_concise_body(
  loc: Loc,
  lexical: lexical_extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<{ loc: Loc }> {
  const gs = await (loc.t.type === "list" && loc.t.tag === "statement_block"
    ? preexpand_block(loc, lexical, counter, unit, context, sort, helpers).then(({ loc, ...gs }) =>
        go_down(
          loc,
          (loc) => ({ ...gs, loc }),
          (loc) => debug(loc, "???"),
        ),
      )
    : preexpand_forms(loc, lexical, counter, unit, context, sort, helpers));
  const new_unit = extend_unit(gs.unit, gs.lexical);
  return postexpand_body(
    gs.loc,
    { extensible: false },
    new_unit,
    gs.counter,
    gs.context,
    sort,
    helpers,
  );
}

function rewrap(loc: Loc, rib_id: string, cu_id: string): Loc {
  return {
    type: "loc",
    t: push_wrap({ marks: null, subst: [{ rib_id, cu_id }, null], aes: null })(loc.t),
    p: loc.p,
  };
}

async function preexpand_forms(
  loc: Loc,
  lexical: lexical_extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<goodies> {
  function done(loc: Loc): Promise<goodies> {
    return Promise.resolve({
      loc,
      lexical,
      context,
      counter,
      unit,
    });
  }
  function next(loc: Loc): Promise<goodies> {
    return go_next(loc, (loc) => h(find_form(loc)), done);
  }
  function descend(loc: Loc): Promise<goodies> {
    return go_down(loc, (loc) => h(find_form(loc)), syntax_error);
  }
  async function h(ffrv: ffrv): Promise<goodies> {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc);
      case "identifier": {
        assert(loc.t.type === "atom" && loc.t.tag === "identifier", loc.t);
        const { content, wrap } = loc.t;
        const resolution = resolve(content, wrap, context, unit, sort_env[sort]);
        switch (resolution.type) {
          case "unbound":
            return next(loc);
          case "bound": {
            const binding = resolution.binding;
            switch (binding.type) {
              case "lexical":
              case "type":
              case "ts":
                return next(loc);
              case "core_syntax": {
                const { name } = binding;
                return helpers.inspect(loc, "core form", () =>
                  handle_core_syntax(loc, name, context, unit, counter, lexical).then(
                    ({ loc, counter, unit, context, lexical }) =>
                      helpers.inspect(loc, `core output`, () =>
                        preexpand_forms(loc, lexical, counter, unit, context, sort, helpers),
                      ),
                  ),
                );
              }
              case "syntax_rules_transformer": {
                const { clauses } = binding;
                return helpers.inspect(loc, `transformer form`, () =>
                  apply_syntax_rules(loc, clauses, unit, counter).then(({ loc, counter }) => {
                    const rewrapped = lexical.extensible
                      ? rewrap(loc, lexical.rib_id, unit.cu_id)
                      : loc;
                    return helpers.inspect(rewrapped, `transformer output`, () =>
                      preexpand_forms(rewrapped, lexical, counter, unit, context, sort, helpers),
                    );
                  }),
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
        const h = preexpand_list_handlers[loc.t.tag];
        if (h) {
          return h({ loc, lexical, counter, unit, context }, helpers).then(
            ({ loc, lexical, counter, unit, context }) =>
              go_next(
                loc,
                (loc) => preexpand_forms(loc, lexical, counter, unit, context, sort, helpers),
                (loc) => Promise.resolve({ loc, lexical, counter, unit, context }),
              ),
          );
        }
        switch (loc.t.tag) {
          case "arrow_function":
            return next(loc);
          case "member_expression":
            return descend(loc);
          default: {
            if (list_handlers_table[loc.t.tag] === "todo") {
              debug(loc, `todo list handler for '${loc.t.tag}'`);
            }
            assert(list_handlers_table[loc.t.tag] === "descend", `non descend tag '${loc.t.tag}'`);
            return next(loc);
          }
        }
      }
    }
  }
  return h(find_form(loc));
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
          debug(loc, `no stop_table entry for ${tag}`);
        }
        switch (action) {
          case "descend":
            return go_down(loc, find_form, (loc) => go_next(loc, find_form, done));
          case "stop":
            return {
              type: "list",
              loc,
            };
          case "todo":
            debug(loc, `todo ${tag}`);
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

function postexpand_program(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension }> {
  assert(loc.t.tag === "program");
  return go_down(loc, (loc) =>
    postexpand_body(loc, modular, unit, counter, context, "value", helpers),
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

  function identifier(goodies: goodies): goodies {
    const id = goodies.loc.t;
    assert(id.type === "atom" && id.tag === "identifier");
    const { name, ...gs } = gen_binding({ ...goodies, sort: "value" });
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

function expand_arrow_function(
  loc: Loc,
  counter: number,
  context: Context,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc }> {
  return go_down(
    loc,
    (loc) => {
      const [rib_id, new_counter] = new_rib_id(counter);
      const lexical: lexical_extension = {
        extensible: true,
        rib_id,
        rib: { type: "rib", normal_env: {}, types_env: {} },
      };
      const pgs = extract_parameters({ loc, lexical, counter, context, unit });
      const arr = go_right(pgs.loc, itself, invalid_form);
      check_punct(arr, "=>");
      const body = go_right(arr, itself, invalid_form);
      return in_isolation(
        body,
        async (body) => {
          const wrap: Wrap = {
            marks: null,
            subst: [{ rib_id, cu_id: unit.cu_id }, null],
            aes: null,
          };
          const loc = wrap_loc(body, wrap);
          const new_unit = extend_unit(pgs.unit, pgs.lexical); // params are in rib
          return expand_concise_body(
            loc,
            pgs.lexical,
            new_counter,
            new_unit,
            pgs.context,
            "value",
            helpers,
          );
        },
        (loc) => ({ loc }),
      );
    },
    invalid_form,
  );
}

function expand_type_parameters(
  loc: Loc,
  unit: CompilationUnit,
  orig_counter: number,
  context: Context,
  helpers: preexpand_helpers,
): Promise<goodies> {
  type T = Promise<goodies>;
  function post_after_var({ loc, lexical, counter, unit, context }: goodies): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ",");
        return go_right(
          loc,
          (loc) => post_var({ loc, lexical, counter, unit, context }),
          (loc) => {
            debug(loc, "cant go past commma2?");
          },
        );
      },
      (loc) => end({ loc: go_up(loc), lexical, unit, counter, context }),
    );
  }

  function post_var({ loc, lexical, counter, unit, context }: goodies): T {
    switch (loc.t.tag) {
      case "identifier":
        return post_after_var({ loc, lexical, counter, unit, context });
      case "type_parameter":
        return go_down(loc, (loc) => {
          assert(loc.t.tag === "identifier");
          return go_right(loc, (loc) => {
            if (loc.t.content !== "extends") syntax_error(loc, "expected 'extends'");
            assert(lexical.extensible);
            return go_right(loc, (loc) =>
              expand_expr({
                loc: wrap_loc(loc, {
                  marks: null,
                  subst: [{ rib_id: lexical.rib_id, cu_id: unit.cu_id }, null],
                  aes: null,
                }),
                counter,
                unit,
                context,
                sort: "type",
                helpers,
              }).then(({ loc, counter, unit, context }) =>
                go_right(loc, syntax_error, () =>
                  post_after_var({ loc: go_up(loc), lexical, counter, unit, context }),
                ),
              ),
            );
          });
        });
      default:
        syntax_error(loc);
    }
  }

  function pre_after_var({ loc, lexical, counter, unit, context }: goodies): T {
    assert(lexical.extensible);
    return go_right(
      loc,
      (loc) => {
        if (loc.t.content !== ",") syntax_error(loc, "expected a comma ','");
        return go_right(
          loc,
          (loc) => pre_var({ loc, lexical, counter, unit, context }),
          (loc) => debug(loc, "cant go past commma?"),
        );
      },
      (loc) =>
        go_down(go_up(loc), (loc) =>
          post_var({
            loc,
            lexical,
            counter,
            unit: extend_unit(unit, lexical),
            context,
          }),
        ),
    );
  }

  function pre_var({ loc, lexical, counter, unit, context }: goodies): T {
    switch (loc.t.tag) {
      case "identifier":
        const { name, ...gs } = gen_binding({
          loc,
          lexical,
          counter,
          context,
          unit,
          sort: "type",
        });
        return pre_after_var({ ...gs, loc: rename(loc, name) });
      case "type_parameter":
        return go_down(loc, (loc) => {
          if (loc.t.tag !== "identifier") syntax_error(loc, "expected an identifier");
          const { name, ...gs } = gen_binding({
            loc,
            lexical,
            counter,
            context,
            unit,
            sort: "type",
          });
          return pre_after_var({ ...gs, loc: go_up(rename(loc, name)) });
        });
      default:
        syntax_error(loc);
    }
  }

  function start(loc: Loc): T {
    assert(loc.t.tag === "syntax_list");

    const [rib_id, counter] = new_rib_id(orig_counter);
    const rib: Rib = { type: "rib", normal_env: {}, types_env: {} };
    const lexical: lexical_extension = { extensible: true, rib_id, rib };
    return go_down(
      loc,
      (loc) => pre_var({ loc, lexical, unit, counter, context }),
      (loc) => end({ loc, unit, lexical, context, counter }),
    );
  }

  async function end({ loc, lexical, unit, context, counter }: goodies): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ">");
        return { loc, lexical, unit, counter, context };
      },
      syntax_error,
    );
  }

  assert(loc.t.content === "<");
  return go_right(loc, start, syntax_error);
}

function expand_expr({
  loc,
  counter,
  unit,
  context,
  sort,
  helpers,
}: {
  loc: Loc;
  unit: CompilationUnit;
  counter: number;
  context: Context;
  sort: "type" | "value";
  helpers: preexpand_helpers;
}): Promise<Omit<goodies, "lexical" | "modular">> {
  return in_isolation(
    loc,
    async (loc) => {
      return preexpand_forms(
        loc,
        { extensible: false },
        counter,
        unit,
        context,
        sort,
        helpers,
      ).then(({ loc, unit, counter, context }) =>
        postexpand_body(loc, { extensible: false }, unit, counter, context, sort, helpers).then(
          ({ loc }) => ({
            loc,
            unit,
            counter,
            context,
          }),
        ),
      );
    },
    (loc, { unit, counter, context }) => ({ loc, unit, counter, context }),
  );
}

const empty_wrap: Wrap = { marks: null, subst: null, aes: null };

const export_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "export",
  wrap: empty_wrap,
  src: false,
};

const lt_brace_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "{",
  wrap: empty_wrap,
  src: false,
};

const rt_brace_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "}",
  wrap: empty_wrap,
  src: false,
};

function insert_export_keyword({ loc, modular }: { loc: Loc; modular: modular_extension }): {
  loc: Loc;
  modular: modular_extension;
} {
  if (modular.extensible) {
    assert(loc.t.type === "list");
    const content = stx_list_content(loc.t);
    assert(content !== null);
    const fst = content[0];
    if (fst.content === "export") {
      return { loc, modular };
    } else {
      return {
        loc: { type: "loc", t: { ...loc.t, content: [export_keyword, content] }, p: loc.p },
        modular,
      };
    }
  } else {
    return { loc, modular };
  }
}
async function postexpand_type_alias_declaration(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension }> {
  async function do_after_equal(
    loc: Loc,
    counter: number,
    unit: CompilationUnit,
    context: Context,
  ): Promise<Loc> {
    return expand_expr({
      loc,
      counter,
      unit,
      context,
      sort: "type",
      helpers,
    }).then(({ loc, unit: _unit, counter: _counter, context: _context }) => {
      return go_right(
        loc,
        (loc) => {
          assert(loc.t.content === ";");
          return go_right(loc, syntax_error, (loc) => go_up(loc));
        },
        (loc) => go_up(loc),
      );
    });
  }
  async function do_after_identifier(
    loc: Loc,
    counter: number,
    unit: CompilationUnit,
    context: Context,
  ): Promise<Loc> {
    switch (loc.t.content) {
      case "=":
        return go_right(loc, (loc) => do_after_equal(loc, counter, unit, context));
      case "<":
        return expand_type_parameters(loc, unit, counter, context, helpers).then(
          ({ loc, counter, unit, context, lexical }) => {
            assert(loc.t.content === ">");
            assert(lexical.extensible);
            return go_right(loc, (loc) => {
              if (loc.t.content !== "=") syntax_error(loc, "expected '='");
              return go_right(loc, (loc) =>
                do_after_equal(
                  wrap_loc(loc, {
                    marks: null,
                    subst: [{ rib_id: lexical.rib_id, cu_id: unit.cu_id }, null],
                    aes: null,
                  }),
                  counter,
                  unit,
                  context,
                ),
              );
            });
          },
        );
      default:
        return syntax_error(loc);
    }
  }

  function handle_type(loc: Loc, exporting: boolean) {
    assert(loc.t.content === "type");
    return go_right(loc, async (loc) => {
      assert(loc.t.tag === "identifier");
      const { content, wrap } = loc.t;
      const resolution = resolve(content, wrap, context, unit, "types_env");
      assert(resolution.type === "bound");
      assert(resolution.binding.type === "type");
      const new_name = resolution.binding.name;
      const new_loc = await go_right(rename(loc, new_name), async (loc) =>
        do_after_identifier(loc, counter, unit, context),
      );
      const new_modular = extend_modular(
        modular,
        exporting,
        content,
        wrap.marks,
        resolution.label,
        "types_env",
      );
      return { loc: new_loc, modular: new_modular };
    });
  }

  function handle_export(loc: Loc) {
    assert(loc.t.content === "export");
    if (!modular.extensible) syntax_error(loc, "location does not permit export");
    return go_right(loc, (loc) => handle_type(loc, true), syntax_error);
  }
  return go_down(loc, (loc) => {
    switch (loc.t.content) {
      case "type":
        return handle_type(loc, false);
      case "export":
        return handle_export(loc);
      default:
        syntax_error(loc);
    }
  }).then(insert_export_keyword);
}

async function postexpand_lexical_declaration(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension }> {
  async function handle_value_initializer(loc: Loc): Promise<Loc> {
    assert(loc.t.content === "=");
    return go_right(
      loc,
      (loc) =>
        expand_expr({ loc, counter, unit, context, sort: "value", helpers }).then(({ loc }) => loc),
      (loc) => syntax_error(loc, "expected an expression following the '=' sign"),
    );
  }
  async function handle_type_then_initializer(loc: Loc): Promise<Loc> {
    assert(loc.t.content === ":");
    return go_right(
      loc,
      (loc) =>
        expand_expr({ loc, counter, unit, context, sort: "type", helpers }).then(
          ({ loc, counter, unit, context }) =>
            go_right(loc, handle_value_initializer, (loc) => Promise.resolve(loc)),
        ),
      (loc) => syntax_error(loc, "expected an expression following the '=' sign"),
    );
  }
  async function handle_initializer(loc: Loc): Promise<Loc> {
    switch (loc.t.content) {
      case "=":
        return handle_value_initializer(loc);
      case ":":
        return handle_type_then_initializer(loc);
      default:
        syntax_error(loc);
    }
  }
  async function handle_inner_variable_declarator(
    loc: Loc,
    exporting: boolean,
    modular: modular_extension,
  ): Promise<{ loc: Loc; modular: modular_extension }> {
    assert(loc.t.tag === "identifier");
    const { content, wrap } = loc.t;
    const resolution = resolve(content, wrap, context, unit, "normal_env");
    assert(resolution.type === "bound");
    assert(resolution.binding.type === "lexical");
    const new_name = resolution.binding.name;
    const new_loc = await go_right(
      rename(loc, new_name),
      (loc) => handle_initializer(loc),
      (loc) => Promise.resolve(loc),
    );
    return {
      loc: go_up(new_loc),
      modular: extend_modular(
        modular,
        exporting,
        content,
        wrap.marks,
        resolution.label,
        "normal_env",
      ),
    };
  }
  async function handle_variable_declarator(
    loc: Loc,
    exporting: boolean,
    modular: modular_extension,
  ): Promise<{ loc: Loc; modular: modular_extension }> {
    assert(loc.t.tag === "variable_declarator");
    return go_down(
      loc,
      (loc) => handle_inner_variable_declarator(loc, exporting, modular),
      syntax_error,
    );
  }
  async function handle_declarations(
    loc: Loc,
    exporting: boolean,
    modular: modular_extension,
  ): Promise<{ loc: Loc; modular: modular_extension }> {
    if (loc.t.tag === "variable_declarator") {
      return handle_variable_declarator(loc, exporting, modular).then(({ loc, modular }) =>
        go_right(
          loc,
          (loc) => {
            switch (loc.t.content) {
              case ",":
                return go_right(
                  loc,
                  (loc) => handle_declarations(loc, exporting, modular),
                  (loc) => Promise.resolve({ loc: go_up(loc), modular }),
                );
              case ";":
                return Promise.resolve({ loc: go_up(loc), modular });
              default:
                syntax_error(loc);
            }
          },
          (loc) => Promise.resolve({ loc: go_up(loc), modular }),
        ),
      );
    }
    debug(loc, "handle_declarations");
  }
  async function handle_declaration_list(
    loc: Loc,
    exporting: boolean,
  ): Promise<{ loc: Loc; modular: modular_extension }> {
    assert(loc.t.content === "let" || loc.t.content === "const");
    return go_right(loc, (loc) => handle_declarations(loc, exporting, modular), syntax_error);
  }
  async function handle_export(loc: Loc): Promise<{ loc: Loc; modular: modular_extension }> {
    if (!modular.extensible) syntax_error(loc, "unexpected export keyword");
    return go_right(loc, (loc) => handle_declaration_list(loc, true), syntax_error);
  }
  return go_down(
    loc,
    (loc) => {
      switch (loc.t.content) {
        case "export":
          return handle_export(loc);
        case "const":
        case "let":
          return handle_declaration_list(loc, false);
        default:
          syntax_error(loc);
      }
    },
    syntax_error,
  ).then(insert_export_keyword);
}

function rename(loc: Loc, new_name: string): Loc {
  const new_id: STX = {
    type: "atom",
    tag: "identifier",
    wrap: { marks: null, subst: null, aes: null },
    content: new_name,
    src: loc.t,
  };
  return change(loc, { type: "loc", t: new_id, p: { type: "top" } });
}

const sort_env = { type: "types_env" as const, value: "normal_env" as const };

async function postexpand_body(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension }> {
  type T = Promise<{ loc: Loc; modular: modular_extension }>;
  async function done(loc: Loc, modular: modular_extension): T {
    return { loc, modular }; // FIXME
  }
  function cont(loc: Loc, modular: modular_extension): T {
    return go_next(
      loc,
      (loc) => h(find_form(loc), modular),
      (loc) => done(loc, modular),
    );
  }
  async function h(ffrv: ffrv, modular: modular_extension): T {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc, modular);
      case "identifier": {
        assert(loc.t.type === "atom");
        const { tag, content, wrap } = loc.t;
        switch (tag) {
          case "identifier": {
            const resolution = resolve(content, wrap, context, unit, sort_env[sort]);
            switch (resolution.type) {
              case "bound": {
                const { binding } = resolution;
                switch (binding.type) {
                  case "ts":
                  case "type":
                  case "lexical": {
                    return cont(rename(loc, binding.name), modular); // FIXME
                  }
                  default: {
                    debug(loc, `unhandled ${binding.type}`);
                  }
                }
              }
              case "unbound": {
                syntax_error(loc, `unbound identifier '${content}'`);
              }
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
            assert(sort === "value");
            return postexpand_lexical_declaration(
              loc,
              modular,
              unit,
              counter,
              context,
              helpers,
            ).then(({ loc, modular }) => cont(loc, modular));
          case "arrow_function": {
            return in_isolation(
              loc,
              (loc) => expand_arrow_function(loc, counter, context, unit, helpers),
              (loc, _gs) => loc,
            ).then((loc) => cont(loc, modular));
          }
          case "slice": {
            return syntax_error(loc, "invalid slice");
          }
          case "type_alias_declaration": {
            return postexpand_type_alias_declaration(
              loc,
              modular,
              unit,
              counter,
              context,
              helpers,
            ).then(({ loc, modular }) => cont(loc, modular));
          }
          case "member_expression": {
            return go_down(loc, (loc) =>
              in_isolation(
                loc,
                (loc) =>
                  postexpand_body(
                    loc,
                    { extensible: false },
                    unit,
                    counter,
                    context,
                    sort,
                    helpers,
                  ),
                (loc, _gs) =>
                  go_right(loc, (loc) => {
                    assert(loc.t.content === ".");
                    return go_right(loc, (loc) => {
                      if (loc.t.tag === "identifier") {
                        // rename to identifier name itself
                        return rename(loc, loc.t.content);
                      } else {
                        return syntax_error(loc, "not an identifier");
                      }
                    });
                  }),
              ).then((loc) => cont(loc, modular)),
            );
          }
          default: {
            if (list_handlers_table[loc.t.tag] !== "descend") {
              debug(loc, `unhandled '${loc.t.tag}' form in postexpand_body`);
            }
            return cont(loc, modular);
          }
        }
      }
    }
  }
  return h(find_form(loc), modular);
}
