import { assert } from "./assert";
import { AST } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { CompilationUnit, Context, new_rib_id, Rib, Loc, Wrap, STX } from "./syntax-structures";
import {
  extend_unit,
  init_top_level,
  resolve,
  push_wrap,
  lexical_extension,
  modular_extension,
  extend_modular,
  import_req,
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
import { array_to_ll, join_separated, llappend } from "./llhelpers";
import { gen_binding, goodies, preexpand_list_handlers } from "./preexpand-handlers";
import { preexpand_helpers } from "./preexpand-helpers";

export function initial_step(
  ast: AST,
  cu_id: string,
  globals: string[],
  global_macros: string[],
): [
  Loc,
  (helpers: preexpand_helpers) => Promise<{
    loc: Loc;
    unit: CompilationUnit;
    context: Context;
    modular: modular_extension;
  }>,
] {
  const { stx, counter, unit, rib, rib_id } = init_top_level(ast, cu_id, globals, global_macros);
  const initial_loc: Loc = mkzipper(stx);
  const lexical: lexical_extension = { extensible: true, rib, rib_id };
  const context: Context = {};
  const imp: import_req = {};
  return [
    initial_loc,
    (helpers: preexpand_helpers) =>
      expand_program(initial_loc, unit, context, imp, counter, lexical, helpers).then(
        async ({ loc, unit, context, modular, imp }) => {
          const import_code = await generate_imports(imp, helpers);
          assert(loc.t.tag === "program");
          assert(loc.p.type === "top");
          const new_program: STX = {
            ...loc.t,
            wrap: empty_wrap,
            content: llappend(array_to_ll(import_code), loc.t.content),
          };
          return { loc: mkzipper(new_program), unit, context, modular };
        },
      ),
  ];
}

async function generate_imports(imp: import_req, helpers: preexpand_helpers): Promise<STX[]> {
  async function generate(
    cuid: string,
    bindings: { [label: string]: { type: "value" | "type"; new_name: string } },
  ): Promise<STX> {
    const import_path = await helpers.manager.get_import_path(cuid);
    const bindings_codes = await Promise.all(
      Object.entries(bindings).map(async ([label, rhs]) => {
        const binding = await helpers.manager.resolve_label({ cuid, name: label });
        assert(binding.type === "imported_lexical");
        const new_name: STX = {
          type: "atom",
          tag: "identifier",
          content: rhs.new_name,
          src: false,
          wrap: empty_wrap,
        };
        const orig_name: STX = {
          type: "atom",
          tag: "identifier",
          content: binding.name,
          src: false,
          wrap: empty_wrap,
        };
        const code: STX = {
          type: "list",
          tag: "import_specifier",
          content: array_to_ll([orig_name, as_keyword, new_name]),
          src: false,
          wrap: empty_wrap,
        };
        return code;
      }),
    );

    return {
      type: "list",
      tag: "import_declaration",
      src: false,
      wrap: empty_wrap,
      content: array_to_ll([
        import_keyword,
        {
          type: "list",
          tag: "import_specifier",
          src: false,
          wrap: empty_wrap,
          content: llappend(
            [lt_brace_keyword, null],
            llappend(join_separated(array_to_ll(bindings_codes), comma_keyword), [
              rt_brace_keyword,
              null,
            ]),
          ),
        },
        from_keyword,
        string_literal(import_path),
        semi_keyword,
      ]),
    };
  }
  return Promise.all(Object.entries(imp).map(([cuid, bindings]) => generate(cuid, bindings)));
}

async function expand_program(
  loc: Loc,
  unit: CompilationUnit,
  context: Context,
  imp: import_req,
  counter: number,
  lexical: lexical_extension,
  helpers: preexpand_helpers,
): Promise<{
  loc: Loc;
  unit: CompilationUnit;
  context: Context;
  modular: modular_extension;
  imp: import_req;
}> {
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
          postexpand_program(loc, modular, new_unit, counter, context, imp, helpers).then(
            ({ loc, modular, imp, counter }) => {
              return { loc, unit: new_unit, context, modular, imp, counter };
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
    return { loc: mkzipper(empty_program), unit, context, modular, imp, counter };
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
  helpers: preexpand_helpers,
): Promise<{
  loc: Loc;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  lexical: lexical_extension;
}> {
  const handler = core_handlers[name];
  assert(handler !== undefined);
  return handler(loc, context, unit, counter, lexical, helpers);
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
  imp: import_req,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; imp: import_req; counter: number }> {
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
    imp,
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
        const resolution = await resolve(content, wrap, context, unit, sort_env[sort], helpers);
        switch (resolution.type) {
          case "unbound":
            return next(loc);
          case "bound": {
            const binding = resolution.binding;
            switch (binding.type) {
              case "lexical":
              case "type":
              case "ts":
              case "imported_lexical":
                return next(loc);
              case "core_syntax": {
                const { name } = binding;
                return helpers.inspect(loc, "core form", () =>
                  handle_core_syntax(loc, name, context, unit, counter, lexical, helpers).then(
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
                  apply_syntax_rules(loc, clauses, unit, counter, helpers).then(
                    ({ loc, counter }) => {
                      const rewrapped = lexical.extensible
                        ? rewrap(loc, lexical.rib_id, unit.cu_id)
                        : loc;
                      return helpers.inspect(rewrapped, `transformer output`, () =>
                        preexpand_forms(rewrapped, lexical, counter, unit, context, sort, helpers),
                      );
                    },
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
  imp: import_req,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension; counter: number; imp: import_req }> {
  assert(loc.t.tag === "program");
  return go_down(loc, (loc) =>
    postexpand_body(loc, modular, unit, counter, context, imp, "value", helpers),
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
  imp: import_req,
  unit: CompilationUnit,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; imp: import_req; counter: number }> {
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
            imp,
            "value",
            helpers,
          );
        },
        (loc, { imp, counter }) => ({ loc, imp, counter }),
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
  imp: import_req,
  helpers: preexpand_helpers,
): Promise<goodies & { imp: import_req }> {
  type T = Promise<goodies & { imp: import_req }>;
  function post_after_var({
    loc,
    lexical,
    counter,
    unit,
    context,
    imp,
  }: goodies & { imp: import_req }): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ",");
        return go_right(
          loc,
          (loc) => post_var({ loc, lexical, counter, unit, context, imp }),
          (loc) => {
            debug(loc, "cant go past commma2?");
          },
        );
      },
      (loc) => end({ loc: go_up(loc), lexical, unit, counter, context, imp }),
    );
  }

  function post_var({
    loc,
    lexical,
    counter,
    unit,
    context,
    imp,
  }: goodies & { imp: import_req }): T {
    switch (loc.t.tag) {
      case "identifier":
        return post_after_var({ loc, lexical, counter, unit, context, imp });
      case "type_parameter":
        return go_down(loc, (loc) => {
          assert(loc.t.tag === "identifier");
          return go_right(loc, (loc) => {
            if (loc.t.content !== "extends") syntax_error(loc, "expected 'extends'");
            assert(lexical.extensible);
            return go_right(loc, (loc) =>
              expand_expr(
                wrap_loc(loc, {
                  marks: null,
                  subst: [{ rib_id: lexical.rib_id, cu_id: unit.cu_id }, null],
                  aes: null,
                }),
                counter,
                unit,
                context,
                imp,
                "type",
                helpers,
              ).then(({ loc, counter, unit, context, imp }) =>
                go_right(loc, syntax_error, () =>
                  post_after_var({ loc: go_up(loc), lexical, counter, unit, context, imp }),
                ),
              ),
            );
          });
        });
      default:
        syntax_error(loc);
    }
  }

  function pre_after_var({
    loc,
    lexical,
    counter,
    unit,
    context,
    imp,
  }: goodies & { imp: import_req }): T {
    assert(lexical.extensible);
    return go_right(
      loc,
      (loc) => {
        if (loc.t.content !== ",") syntax_error(loc, "expected a comma ','");
        return go_right(
          loc,
          (loc) => pre_var({ loc, lexical, counter, unit, context, imp }),
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
            imp,
          }),
        ),
    );
  }

  function pre_var({
    loc,
    lexical,
    counter,
    unit,
    context,
    imp,
  }: goodies & { imp: import_req }): T {
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
        return pre_after_var({ ...gs, loc: rename(loc, name), imp });
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
          return pre_after_var({ ...gs, loc: go_up(rename(loc, name)), imp });
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
      (loc) => pre_var({ loc, lexical, unit, counter, context, imp }),
      (loc) => end({ loc, unit, lexical, context, counter, imp }),
    );
  }

  async function end({
    loc,
    lexical,
    unit,
    context,
    counter,
    imp,
  }: goodies & { imp: import_req }): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ">");
        return { loc, lexical, unit, counter, context, imp };
      },
      syntax_error,
    );
  }

  assert(loc.t.content === "<");
  return go_right(loc, start, syntax_error);
}

function expand_expr(
  loc: Loc,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  imp: import_req,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<Omit<goodies, "lexical" | "modular"> & { imp: import_req }> {
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
        postexpand_body(
          loc,
          { extensible: false },
          unit,
          counter,
          context,
          imp,
          sort,
          helpers,
        ).then(({ loc, imp, counter }) => ({
          loc,
          unit,
          counter,
          context,
          imp,
        })),
      );
    },
    (loc, { unit, counter, context, imp }) => ({ loc, unit, counter, context, imp }),
  );
}

const empty_wrap: Wrap = { marks: null, subst: null, aes: null };

function string_literal(value: string): STX {
  return {
    type: "atom",
    tag: "string",
    content: JSON.stringify(value),
    wrap: empty_wrap,
    src: false,
  };
}

const export_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "export",
  wrap: empty_wrap,
  src: false,
};

const comma_keyword: STX = {
  type: "atom",
  tag: "other",
  content: ",",
  wrap: empty_wrap,
  src: false,
};

const semi_keyword: STX = {
  type: "atom",
  tag: "other",
  content: ";",
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

const import_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "import",
  wrap: empty_wrap,
  src: false,
};

const from_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "from",
  wrap: empty_wrap,
  src: false,
};

const as_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "as",
  wrap: empty_wrap,
  src: false,
};

function insert_export_keyword(
  loc: Loc,
  counter: number,
  modular: modular_extension,
  imp: import_req,
): {
  loc: Loc;
  modular: modular_extension;
  counter: number;
  imp: import_req;
} {
  if (modular.extensible) {
    assert(loc.t.type === "list");
    const content = stx_list_content(loc.t);
    assert(content !== null);
    const fst = content[0];
    if (fst.content === "export") {
      return { loc, modular, imp, counter };
    } else {
      return {
        loc: { type: "loc", t: { ...loc.t, content: [export_keyword, content] }, p: loc.p },
        modular,
        imp,
        counter,
      };
    }
  } else {
    return { loc, modular, counter, imp };
  }
}

async function postexpand_type_alias_declaration(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  imp: import_req,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
  async function do_after_equal(
    loc: Loc,
    counter: number,
    unit: CompilationUnit,
    context: Context,
    imp: import_req,
  ): Promise<{ loc: Loc; imp: import_req; counter: number }> {
    return expand_expr(loc, counter, unit, context, imp, "type", helpers).then(
      ({ loc, unit: _unit, counter, context: _context, imp }) => {
        function done(loc: Loc) {
          return { loc: go_up(loc), imp, counter };
        }
        return go_right(
          loc,
          (loc) => {
            assert(loc.t.content === ";");
            return go_right(loc, syntax_error, done);
          },
          done,
        );
      },
    );
  }
  async function do_after_identifier(
    loc: Loc,
    counter: number,
    unit: CompilationUnit,
    context: Context,
    imp: import_req,
  ): Promise<{ loc: Loc; imp: import_req; counter: number }> {
    switch (loc.t.content) {
      case "=":
        return go_right(loc, (loc) => do_after_equal(loc, counter, unit, context, imp));
      case "<":
        return expand_type_parameters(loc, unit, counter, context, imp, helpers).then(
          ({ loc, counter, unit, context, lexical, imp }) => {
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
                  imp,
                ),
              );
            });
          },
        );
      default:
        return syntax_error(loc);
    }
  }

  function handle_type(
    loc: Loc,
    exporting: boolean,
  ): Promise<{ loc: Loc; imp: import_req; counter: number; modular: modular_extension }> {
    assert(loc.t.content === "type");
    return go_right(loc, async (loc) => {
      assert(loc.t.tag === "identifier");
      const { content, wrap } = loc.t;
      const resolution = await resolve(content, wrap, context, unit, "types_env", helpers);
      assert(resolution.type === "bound");
      assert(resolution.binding.type === "type");
      const new_name = resolution.binding.name;
      const gs = await go_right(rename(loc, new_name), (loc) =>
        do_after_identifier(loc, counter, unit, context, imp),
      );
      const new_modular = extend_modular(
        modular,
        exporting,
        content,
        wrap.marks,
        resolution.label,
        "types_env",
        loc,
      );
      return { loc: gs.loc, modular: new_modular, counter: gs.counter, imp: gs.imp };
    });
  }

  function handle_export(
    loc: Loc,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
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
  }).then(({ loc, modular, imp, counter }) => insert_export_keyword(loc, counter, modular, imp));
}

async function postexpand_lexical_declaration(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  imp: import_req,
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
  async function handle_value_initializer(
    loc: Loc,
  ): Promise<{ loc: Loc; imp: import_req; counter: number }> {
    assert(loc.t.content === "=");
    return go_right(
      loc,
      (loc) => expand_expr(loc, counter, unit, context, imp, "value", helpers),
      (loc) => syntax_error(loc, "expected an expression following the '=' sign"),
    );
  }
  async function handle_type_then_initializer(
    loc: Loc,
  ): Promise<{ loc: Loc; imp: import_req; counter: number }> {
    assert(loc.t.content === ":");
    return go_right(
      loc,
      (loc) =>
        expand_expr(loc, counter, unit, context, imp, "type", helpers).then(
          ({ loc, counter, unit: _ignored_unit, context: _ignored_context, imp }) =>
            go_right(loc, handle_value_initializer, (loc) =>
              Promise.resolve({ loc, imp, counter }),
            ),
        ),
      (loc) => syntax_error(loc, "expected an expression following the '=' sign"),
    );
  }
  async function handle_initializer(
    loc: Loc,
  ): Promise<{ loc: Loc; imp: import_req; counter: number }> {
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
    imp: import_req,
    counter: number,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
    assert(loc.t.tag === "identifier");
    const { content, wrap } = loc.t;
    const resolution = await resolve(content, wrap, context, unit, "normal_env", helpers);
    assert(resolution.type === "bound");
    assert(resolution.binding.type === "lexical");
    const new_name = resolution.binding.name;
    const gs = await go_right(
      rename(loc, new_name),
      (loc) => handle_initializer(loc),
      (loc) => Promise.resolve({ loc, imp, counter }),
    );
    return {
      loc: go_up(gs.loc),
      modular: extend_modular(
        modular,
        exporting,
        content,
        wrap.marks,
        resolution.label,
        "normal_env",
        loc,
      ),
      imp: gs.imp,
      counter: gs.counter,
    };
  }
  async function handle_variable_declarator(
    loc: Loc,
    exporting: boolean,
    modular: modular_extension,
    imp: import_req,
    counter: number,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
    assert(loc.t.tag === "variable_declarator");
    return go_down(
      loc,
      (loc) => handle_inner_variable_declarator(loc, exporting, modular, imp, counter),
      syntax_error,
    );
  }
  async function handle_declarations(
    loc: Loc,
    exporting: boolean,
    modular: modular_extension,
    imp: import_req,
    counter: number,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
    if (loc.t.tag === "variable_declarator") {
      return handle_variable_declarator(loc, exporting, modular, imp, counter).then(
        ({ loc, modular, imp, counter }) =>
          go_right(
            loc,
            (loc) => {
              switch (loc.t.content) {
                case ",":
                  return go_right(
                    loc,
                    (loc) => handle_declarations(loc, exporting, modular, imp, counter),
                    (loc) => Promise.resolve({ loc: go_up(loc), modular, imp, counter }),
                  );
                case ";":
                  return Promise.resolve({ loc: go_up(loc), modular, imp, counter });
                default:
                  syntax_error(loc);
              }
            },
            (loc) => Promise.resolve({ loc: go_up(loc), modular, imp, counter }),
          ),
      );
    }
    debug(loc, "handle_declarations");
  }
  async function handle_declaration_list(
    loc: Loc,
    exporting: boolean,
    imp: import_req,
    counter: number,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
    assert(loc.t.content === "let" || loc.t.content === "const");
    return go_right(
      loc,
      (loc) => handle_declarations(loc, exporting, modular, imp, counter),
      syntax_error,
    );
  }
  async function handle_export(
    loc: Loc,
  ): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
    if (!modular.extensible) syntax_error(loc, "unexpected export keyword");
    return go_right(loc, (loc) => handle_declaration_list(loc, true, imp, counter), syntax_error);
  }
  return go_down(
    loc,
    (loc) => {
      switch (loc.t.content) {
        case "export":
          return handle_export(loc);
        case "const":
        case "let":
          return handle_declaration_list(loc, false, imp, counter);
        default:
          syntax_error(loc);
      }
    },
    syntax_error,
  ).then(({ loc, modular: new_modular, imp, counter }) =>
    insert_export_keyword(loc, counter, new_modular, imp),
  );
}

function rename(loc: Loc, new_name: string): Loc {
  const new_id: STX = {
    type: "atom",
    tag: "identifier",
    wrap: { marks: null, subst: null, aes: null },
    content: new_name,
    src: loc.t,
  };
  return change(loc, mkzipper(new_id));
}

const sort_env = { type: "types_env" as const, value: "normal_env" as const };

async function postexpand_body(
  loc: Loc,
  modular: modular_extension,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  imp: import_req,
  sort: "type" | "value",
  helpers: preexpand_helpers,
): Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }> {
  type T = Promise<{ loc: Loc; modular: modular_extension; imp: import_req; counter: number }>;
  async function done(loc: Loc, modular: modular_extension, imp: import_req, counter: number): T {
    return { loc, modular, imp, counter };
  }
  function cont(loc: Loc, modular: modular_extension, imp: import_req, counter: number): T {
    return go_next(
      loc,
      (loc) => h(find_form(loc), modular, imp, counter),
      (loc) => done(loc, modular, imp, counter),
    );
  }
  async function h(ffrv: ffrv, modular: modular_extension, imp: import_req, counter: number): T {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc, modular, imp, counter);
      case "identifier": {
        assert(loc.t.type === "atom");
        const { tag, content, wrap } = loc.t;
        switch (tag) {
          case "identifier": {
            const resolution = await resolve(content, wrap, context, unit, sort_env[sort], helpers);
            switch (resolution.type) {
              case "bound": {
                const { binding, label } = resolution;
                switch (binding.type) {
                  case "ts":
                  case "type":
                  case "lexical": {
                    return cont(rename(loc, binding.name), modular, imp, counter);
                  }
                  case "imported_lexical": {
                    const existing = (imp[label.cuid] ?? {})[label.name];
                    if (existing) {
                      return cont(rename(loc, existing.new_name), modular, imp, counter);
                    } else {
                      const { name } = binding;
                      const new_name = `${name}_${counter}`;
                      const new_counter = counter + 1;
                      const new_imp: import_req = {
                        ...imp,
                        [label.cuid]: {
                          ...(imp[label.cuid] ?? {}),
                          [label.name]: { type: "value", new_name },
                        },
                      };
                      return cont(rename(loc, new_name), modular, new_imp, new_counter);
                    }
                  }
                  default: {
                    debug(loc, `unhandled ${binding.type} in postexpand_body`);
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
              imp,
              helpers,
            ).then(({ loc, modular, imp, counter }) => cont(loc, modular, imp, counter));
          case "arrow_function": {
            return in_isolation(
              loc,
              (loc) => expand_arrow_function(loc, counter, context, imp, unit, helpers),
              (loc, gs) => ({ ...gs, loc }),
            ).then(({ loc, imp, counter }) => cont(loc, modular, imp, counter));
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
              imp,
              helpers,
            ).then(({ loc, modular, imp, counter }) => cont(loc, modular, imp, counter));
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
                    imp,
                    sort,
                    helpers,
                  ),
                (loc, { modular: _ignored_modular, imp, counter }) =>
                  go_right(loc, (loc) => {
                    assert(loc.t.content === ".");
                    return go_right(loc, (loc) => {
                      if (loc.t.tag === "identifier") {
                        // rename to identifier name itself
                        return { loc: rename(loc, loc.t.content), modular, imp, counter };
                      } else {
                        return syntax_error(loc, "not an identifier");
                      }
                    });
                  }),
              ).then(({ loc, modular, imp, counter }) => cont(loc, modular, imp, counter)),
            );
          }
          default: {
            if (list_handlers_table[loc.t.tag] !== "descend") {
              debug(loc, `unhandled '${loc.t.tag}' form in postexpand_body`);
            }
            return cont(loc, modular, imp, counter);
          }
        }
      }
    }
  }
  return h(find_form(loc), modular, imp, counter);
}
