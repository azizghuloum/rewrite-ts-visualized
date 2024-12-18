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
import { gen_binding, preexpand_list_handlers } from "./preexpand-handlers";
import { preexpand_helpers } from "./preexpand-helpers";
import { counters, data, swalker, walker, walkerplus } from "./data";

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
  const { stx, counters, unit, rib, rib_id } = init_top_level(ast, cu_id, globals, global_macros);
  const initial_loc: Loc = mkzipper(stx);
  const lexical: lexical_extension = { extensible: true, rib, rib_id };
  const empty_rib: Rib = { type: "rib", normal_env: {}, types_env: {} };
  const modular: modular_extension = { extensible: true, explicit: empty_rib, implicit: empty_rib };
  const context: Context = {};
  const imp: import_req = {};
  const data = { loc: initial_loc, unit, context, imp, counters, lexical, modular };
  return [
    initial_loc,
    (helpers: preexpand_helpers) =>
      expand_program({ ...data, helpers }).then(async ({ loc, imp, ...data }) => {
        const import_code = await generate_imports(imp, helpers);
        assert(loc.t.tag === "program");
        assert(loc.p.type === "top");
        const new_program: STX = {
          ...loc.t,
          wrap: empty_wrap,
          content: llappend(array_to_ll(import_code), loc.t.content),
        };
        return { loc: mkzipper(new_program), ...data };
      }),
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
        assert(binding.type === "imported_lexical" || binding.type === "imported_type");
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
          content: llappend(
            binding.type === "imported_type" ? [type_keyword, null] : null,
            array_to_ll([orig_name, as_keyword, new_name]),
          ),
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

async function expand_program({ loc, ...data }: data): Promise<{
  loc: Loc;
  unit: CompilationUnit;
  context: Context;
  modular: modular_extension;
  imp: import_req;
}> {
  async function expand(loc: Loc) {
    return preexpand_body({
      loc,
      sort: "value",
      ...data,
    }).then(({ loc, lexical, unit, ...new_data }) => {
      // rib is filled
      // context is filled also
      const new_unit = extend_unit(unit, lexical);
      return data.helpers.inspect(loc, "After preexpanding the program", () =>
        postexpand_program({ loc, ...data, ...new_data, unit: new_unit, lexical }).then(
          ({ loc, ...new_new_data }) => {
            return { ...new_data, ...new_new_data, loc, unit: new_unit };
          },
        ),
      );
    });
  }
  async function expand_empty_program() {
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
    return { loc: mkzipper(empty_program), ...data };
  }
  if (loc.t.tag !== "program") syntax_error(loc, "expected a program");
  return go_down(loc, expand, expand_empty_program);
}

const preexpand_body: walkerplus<{ sort: "type" | "value" }> = async ({ loc, sort, ...data }) =>
  in_isolation(loc, (loc) => preexpand_forms(sort)({ loc, ...data })).then(({ loc, ...data }) =>
    go_next(
      loc,
      (loc) => preexpand_body({ loc, sort, ...data }),
      (loc) => Promise.resolve({ loc, ...data }),
    ),
  );

const preexpand_body_curly: walker = async ({ loc, ...data }) =>
  loc.t.content === "}"
    ? go_right(loc, syntax_error, () => ({ loc: go_up(loc), ...data }))
    : in_isolation(loc, (loc) => preexpand_forms("value")({ loc, ...data })).then(
        ({ loc, ...data }) => go_right(loc, (loc) => preexpand_body_curly({ loc, ...data })),
      );

async function handle_core_syntax({ name, ...data }: data & { name: string }): Promise<{
  loc: Loc;
  counters: counters;
  unit: CompilationUnit;
  context: Context;
  lexical: lexical_extension;
}> {
  const handler = core_handlers[name];
  assert(handler !== undefined);
  return handler(data);
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
  export_declaration: "stop",
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

const preexpand_block: walker = async ({ loc, ...data }) => {
  assert(loc.t.type === "list" && loc.t.tag === "statement_block");
  const bodies = go_down(loc, itself, (loc) => syntax_error(loc, "no bodies"));
  assert(bodies.t.type === "atom" && bodies.t.tag === "other" && bodies.t.content === "{");
  const bodies_rest = go_right(bodies, itself, (loc) => syntax_error(loc, "no body rest"));
  const gs = await preexpand_body_curly({ loc: bodies_rest, ...data });
  assert(gs.loc.t.type === "list" && gs.loc.t.tag === "statement_block");
  return gs;
};

const non_modular: (walker: walker) => walker =
  (walker) =>
  ({ modular, ...data }) =>
    walker({ ...data, modular: { extensible: false } }).then((data) => ({ ...data, modular }));

const preexpand_concise_body: walker = ({ loc, ...data }) =>
  loc.t.tag === "statement_block"
    ? preexpand_block({ ...data, loc })
    : preexpand_forms("value")({ ...data, loc });

const postexpand_concise_body: walker = ({ loc, ...data }) =>
  loc.t.tag === "statement_block"
    ? go_down(loc, (loc) => postexpand_body("value")({ loc, ...data }))
    : postexpand_body("value")({ loc, ...data });

const expand_concise_body = non_modular((data) =>
  preexpand_concise_body(data)
    .then(({ unit, lexical, ...data }) => ({ ...data, lexical, unit: extend_unit(unit, lexical) }))
    .then(postexpand_concise_body),
);

function rewrap(loc: Loc, rib_id: string, cu_id: string): Loc {
  return {
    type: "loc",
    t: push_wrap({ marks: null, subst: [{ rib_id, cu_id }, null], aes: null })(loc.t),
    p: loc.p,
  };
}

const preexpand_forms =
  (sort: "type" | "value") =>
  async ({ loc, ...data }: data) => {
    function done(loc: Loc): Promise<data> {
      return Promise.resolve({ loc, ...data });
    }
    function next(loc: Loc): Promise<data> {
      return go_next(loc, (loc) => h(find_form(loc)), done);
    }
    function descend(loc: Loc): Promise<data> {
      return go_down(loc, (loc) => h(find_form(loc)), syntax_error);
    }
    async function h(ffrv: ffrv): Promise<data> {
      const loc = ffrv.loc;
      switch (ffrv.type) {
        case "done":
          return done(loc);
        case "identifier": {
          assert(loc.t.type === "atom" && loc.t.tag === "identifier", loc.t);
          const { content, wrap } = loc.t;
          const resolution = await resolve(
            content,
            wrap,
            data.context,
            data.unit,
            sort_env[sort],
            data.helpers,
          );
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
                case "imported_type":
                  return next(loc);
                case "core_syntax": {
                  const { name } = binding;
                  return data.helpers.inspect(loc, "core form", () =>
                    handle_core_syntax({ ...data, loc, name }).then(({ loc, ...new_data }) =>
                      data.helpers.inspect(loc, `core output`, () =>
                        preexpand_forms(sort)({ loc, ...data, ...new_data }),
                      ),
                    ),
                  );
                }
                case "imported_syntax_rules_transformer":
                case "syntax_rules_transformer": {
                  const { clauses } = binding;
                  return data.helpers.inspect(loc, `transformer form`, () =>
                    apply_syntax_rules(loc, clauses, data.unit, data.counters, data.helpers).then(
                      ({ loc, counters }) => {
                        const rewrapped = data.lexical.extensible
                          ? rewrap(loc, data.lexical.rib_id, data.unit.cu_id)
                          : loc;
                        return data.helpers.inspect(rewrapped, `transformer output`, () =>
                          preexpand_forms(sort)({ loc: rewrapped, ...data, counters }),
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
            return h({ loc, ...data }).then(({ loc, ...data }) =>
              go_next(
                loc,
                (loc) => preexpand_forms(sort)({ loc, ...data }),
                (loc) => Promise.resolve({ loc, ...data }),
              ),
            );
          }
          switch (loc.t.tag) {
            case "export_declaration":
            case "arrow_function":
              return next(loc);
            case "member_expression":
              return descend(loc);
            default: {
              if (list_handlers_table[loc.t.tag] === "todo") {
                debug(loc, `todo list handler for '${loc.t.tag}'`);
              }
              assert(
                list_handlers_table[loc.t.tag] === "descend",
                `non descend tag '${loc.t.tag}'`,
              );
              return next(loc);
            }
          }
        }
      }
    }
    return h(find_form(loc));
  };

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

const postexpand_program: walker = ({ loc, ...data }: data) =>
  go_down(loc, (loc) => postexpand_body("value")({ loc, ...data }));

function itself(loc: Loc): Loc {
  return loc;
}

const extract_parameters: swalker = (data) => {
  //
  const tail: swalker = ({ loc, ...data }) => {
    switch (loc.t.content) {
      case ",":
        return go_right(loc, (loc) => head({ ...data, loc }));
      case ")":
        return go_right(loc, syntax_error, (loc) => ({ ...data, loc: go_up(loc) }));
      default:
        syntax_error(loc);
    }
  };

  const head: swalker = ({ loc, ...data }) => {
    switch (loc.t.tag) {
      case "identifier": {
        const gs = identifier({ loc, ...data });
        return go_right(gs.loc, (loc) => tail({ ...gs, loc }));
      }
      case "other": {
        switch (loc.t.content) {
          case ",":
            return syntax_error(loc);
          case ")":
            return go_right(loc, syntax_error, (loc) => ({ ...data, loc: go_up(loc) }));
        }
      }
    }
    syntax_error(loc);
  };

  const identifier: swalker = (data) => {
    const id = data.loc.t;
    assert(id.type === "atom" && id.tag === "identifier");
    const { name, ...gs } = gen_binding({ ...data, sort: "value" });
    return { ...data, ...gs, loc: rename(data.loc, name) };
  };

  const first_param: swalker = (data) => {
    switch (data.loc.t.tag) {
      case "identifier":
        const gs = identifier(data);
        return go_right(gs.loc, syntax_error, (loc) => ({ ...gs, loc: go_up(loc) }));
      case "other": {
        if (data.loc.t.content === "(") {
          return go_right(data.loc, (loc) => head({ ...data, loc }));
        }
      }
      default:
        syntax_error(data.loc);
    }
  };

  {
    assert(data.loc.t.type === "list" && data.loc.t.tag === "formal_parameters");
    return go_down(data.loc, (loc) => first_param({ ...data, loc }));
  }
};

function check_punct(loc: Loc, content: string) {
  if (loc.t.type !== "atom" || loc.t.tag !== "other" || loc.t.content !== content) {
    syntax_error(loc, `expected '${content}'`);
  }
}

const expand_arrow_function: walker = ({ loc, counters, ...data }) =>
  go_down(loc, (loc) => {
    const [rib_id, new_counters] = new_rib_id(counters);
    const lexical: lexical_extension = {
      extensible: true,
      rib_id,
      rib: { type: "rib", normal_env: {}, types_env: {} },
    };
    const pgs = extract_parameters({ ...data, loc, lexical, counters: new_counters });
    const arr = go_right(pgs.loc, itself);
    check_punct(arr, "=>");
    const body = go_right(arr, itself);
    return in_isolation(body, (body) => {
      const wrap: Wrap = {
        marks: null,
        subst: [{ rib_id, cu_id: pgs.unit.cu_id }, null],
        aes: null,
      };
      return expand_concise_body({
        ...pgs,
        loc: wrap_loc(body, wrap),
        unit: extend_unit(pgs.unit, pgs.lexical),
      });
    });
  });

const expand_type_parameters: walker = ({ loc, ...data }) => {
  //
  const post_after_var: walker = ({ loc, ...data }) => {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ",");
        return go_right(
          loc,
          (loc) => post_var({ loc, ...data }),
          (loc) => {
            debug(loc, "cant go past commma2?");
          },
        );
      },
      (loc) => end({ loc: go_up(loc), ...data }),
    );
  };

  const post_var: walker = ({ loc, lexical, ...data }) => {
    switch (loc.t.tag) {
      case "identifier":
        return post_after_var({ loc, lexical, ...data });
      case "type_parameter":
        return go_down(loc, (loc) => {
          assert(loc.t.tag === "identifier");
          return go_right(loc, (loc) => {
            if (loc.t.content !== "extends") syntax_error(loc, "expected 'extends'");
            assert(lexical.extensible);
            return go_right(loc, (loc) =>
              expand_expr("type")({
                loc: wrap_loc(loc, {
                  marks: null,
                  subst: [{ rib_id: lexical.rib_id, cu_id: data.unit.cu_id }, null],
                  aes: null,
                }),
                lexical,
                ...data,
              }).then(({ loc, ...data }) =>
                go_right(loc, syntax_error, () => post_after_var({ loc: go_up(loc), ...data })),
              ),
            );
          });
        });
      default:
        syntax_error(loc);
    }
  };

  const pre_after_var: walker = ({ loc, lexical, counters, unit, ...data }) => {
    assert(lexical.extensible);
    return go_right(
      loc,
      (loc) => {
        if (loc.t.content !== ",") syntax_error(loc, "expected a comma ','");
        return go_right(
          loc,
          (loc) => pre_var({ loc, lexical, counters, unit, ...data }),
          (loc) => debug(loc, "cant go past commma?"),
        );
      },
      (loc) =>
        go_down(go_up(loc), (loc) =>
          post_var({
            loc,
            lexical,
            counters,
            unit: extend_unit(unit, lexical),
            ...data,
          }),
        ),
    );
  };

  const pre_var: walker = ({ loc, ...data }) => {
    switch (loc.t.tag) {
      case "identifier":
        const { name, ...gs } = gen_binding({ loc, ...data, sort: "type" });
        return pre_after_var({ ...data, ...gs, loc: rename(loc, name) });
      case "type_parameter":
        return go_down(loc, (loc) => {
          if (loc.t.tag !== "identifier") syntax_error(loc, "expected an identifier");
          const { name, ...gs } = gen_binding({ loc, ...data, sort: "type" });
          return pre_after_var({ ...data, ...gs, loc: go_up(rename(loc, name)) });
        });
      default:
        syntax_error(loc);
    }
  };

  const start: walker = ({ loc, counters, ...data }) => {
    assert(loc.t.tag === "syntax_list");
    const [rib_id, new_counters] = new_rib_id(counters);
    const rib: Rib = { type: "rib", normal_env: {}, types_env: {} };
    const lexical: lexical_extension = { extensible: true, rib_id, rib };
    return go_down(
      loc,
      (loc) => pre_var({ loc, ...data, lexical, counters: new_counters }),
      (loc) => end({ loc, ...data, lexical, counters: new_counters }),
    );
  };

  const end: walker = async ({ loc, ...data }) =>
    go_right(loc, (loc) => {
      assert(loc.t.content === ">");
      return { loc, ...data };
    });

  assert(loc.t.content === "<");
  return go_right(loc, (loc) => start({ loc, ...data }), syntax_error);
};

const expand_expr = (sort: "type" | "value") =>
  non_modular(({ loc, ...data }) =>
    in_isolation(loc, (loc) => preexpand_forms(sort)({ loc, ...data }).then(postexpand_body(sort))),
  );

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

const empty_slice: STX = {
  type: "list",
  tag: "slice",
  content: null,
  wrap: empty_wrap,
  src: false,
};

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

const type_keyword: STX = {
  type: "atom",
  tag: "other",
  content: "type",
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

const insert_export_keyword: swalker = ({ loc, counters, modular, imp, ...data }) => {
  if (modular.extensible) {
    assert(loc.t.type === "list");
    const content = stx_list_content(loc.t);
    assert(content !== null);
    const fst = content[0];
    if (fst.content === "export") {
      return { ...data, loc, modular, imp, counters };
    } else {
      return {
        ...data,
        loc: { type: "loc", t: { ...loc.t, content: [export_keyword, content] }, p: loc.p },
        modular,
        imp,
        counters,
      };
    }
  } else {
    return { ...data, loc, modular, counters, imp };
  }
};

const handle_optional_semi: walker = async ({ loc, ...data }) => {
  function done(loc: Loc) {
    return { ...data, loc: go_up(loc) };
  }
  return go_right(
    loc,
    (loc) => {
      assert(loc.t.content === ";");
      return go_right(loc, syntax_error, done);
    },
    done,
  );
};

const postexpand_type_alias_declaration: walker = async (data) => {
  const do_after_equal: walker = (data: data) =>
    expand_expr("type")(data).then(handle_optional_semi);
  const do_after_identifier: walker = async ({ loc, ...data }) => {
    switch (loc.t.content) {
      case "=":
        return go_right(loc, (loc) => do_after_equal({ loc, ...data }));
      case "<":
        return expand_type_parameters({
          loc,
          ...data,
        }).then(({ loc, unit, lexical, ...data }) => {
          assert(loc.t.content === ">");
          assert(lexical.extensible);
          return go_right(loc, (loc) => {
            if (loc.t.content !== "=") syntax_error(loc, "expected '='");
            return go_right(loc, (loc) =>
              do_after_equal({
                loc: wrap_loc(loc, {
                  marks: null,
                  subst: [{ rib_id: lexical.rib_id, cu_id: unit.cu_id }, null],
                  aes: null,
                }),
                unit,
                lexical,
                ...data,
              }),
            );
          });
        });
      default:
        return syntax_error(loc);
    }
  };

  function handle_type(loc: Loc, exporting: boolean): Promise<data> {
    const { context, unit, modular, helpers } = data;
    assert(loc.t.content === "type");
    return go_right(loc, async (loc) => {
      assert(loc.t.tag === "identifier");
      const { content, wrap } = loc.t;
      const resolution = await resolve(content, wrap, context, unit, "types_env", helpers);
      assert(resolution.type === "bound");
      assert(resolution.binding.type === "type");
      const new_name = resolution.binding.name;
      const gs = await go_right(rename(loc, new_name), (loc) =>
        do_after_identifier({ ...data, loc }),
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
      return { ...gs, modular: new_modular };
    });
  }

  function handle_export(loc: Loc): Promise<data> {
    assert(loc.t.content === "export");
    const { modular } = data;
    if (!modular.extensible) syntax_error(loc, "location does not permit export");
    return go_right(loc, (loc) => handle_type(loc, true), syntax_error);
  }

  {
    const { loc } = data;
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
};

const postexpand_lexical_declaration: walker = async ({ loc, ...data }) => {
  const handle_value_initializer: walker = ({ loc, ...data }) => {
    assert(loc.t.content === "=");
    return go_right(
      loc,
      (loc) => expand_expr("value")({ loc, ...data }),
      (loc) => syntax_error(loc, "expected an expression following the '=' sign"),
    );
  };

  const handle_type_then_initializer: walker = ({ loc, ...data }) => {
    assert(loc.t.content === ":");
    return go_right(
      loc,
      (loc) =>
        expand_expr("type")({ loc, ...data }).then(({ loc, ...data }) =>
          go_right(
            loc,
            (loc) => handle_value_initializer({ loc, ...data }),
            (loc) => Promise.resolve({ loc, ...data }),
          ),
        ),
      (loc) => syntax_error(loc, "expected a type following the ':' sign"),
    );
  };

  async function handle_initializer(loc: Loc): Promise<data> {
    switch (loc.t.content) {
      case "=":
        return handle_value_initializer({ loc, ...data });
      case ":":
        return handle_type_then_initializer({ loc, ...data });
      default:
        syntax_error(loc);
    }
  }

  function handle_declaration_list(exporting: boolean) {
    //
    async function handle_inner_variable_declarator(loc: Loc): Promise<data> {
      assert(loc.t.tag === "identifier");
      const { content, wrap } = loc.t;
      const resolution = await resolve(
        content,
        wrap,
        data.context,
        data.unit,
        "normal_env",
        data.helpers,
      );
      assert(resolution.type === "bound");
      assert(resolution.binding.type === "lexical");
      const new_name = resolution.binding.name;
      const gs = await go_right(
        rename(loc, new_name),
        (loc) => handle_initializer(loc),
        (loc) => Promise.resolve({ ...data, loc }),
      );
      return {
        ...data,
        ...gs,
        loc: go_up(gs.loc),
        modular: extend_modular(
          data.modular,
          exporting,
          content,
          wrap.marks,
          resolution.label,
          "normal_env",
          loc,
        ),
      };
    }

    async function handle_variable_declarator(loc: Loc): Promise<data> {
      assert(loc.t.tag === "variable_declarator");
      return go_down(loc, (loc) => handle_inner_variable_declarator(loc));
    }

    async function handle_declarations(loc: Loc): Promise<data> {
      if (loc.t.tag === "variable_declarator") {
        return handle_variable_declarator(loc).then(({ loc, ...data }) =>
          go_right(
            loc,
            (loc) => {
              switch (loc.t.content) {
                case ",":
                  return go_right(
                    loc,
                    (loc) => handle_declarations(loc),
                    (loc) => Promise.resolve({ loc: go_up(loc), ...data }),
                  );
                case ";":
                  return Promise.resolve({ loc: go_up(loc), ...data });
                default:
                  syntax_error(loc);
              }
            },
            (loc) => Promise.resolve({ loc: go_up(loc), ...data }),
          ),
        );
      }
      debug(loc, "handle_declarations");
    }

    async function handle_declaration_list(loc: Loc): Promise<data> {
      assert(loc.t.content === "let" || loc.t.content === "const");
      return go_right(loc, (loc) => handle_declarations(loc));
    }

    return handle_declaration_list;
  }

  async function handle_export(loc: Loc): Promise<data> {
    if (!data.modular.extensible) syntax_error(loc, "unexpected export keyword");
    return go_right(loc, handle_declaration_list(true));
  }

  return go_down(loc, (loc) => {
    switch (loc.t.content) {
      case "export":
        return handle_export(loc);
      case "const":
      case "let":
        return handle_declaration_list(false)(loc);
      default:
        syntax_error(loc);
    }
  }).then(insert_export_keyword);
};

const postexpand_export_declaration: walker = ({ loc: main_loc, ...data }) => {
  const handle_identifier: walker = async ({ loc, modular, context, unit, helpers, ...data }) => {
    assert(modular.extensible);
    assert(loc.t.tag === "identifier");
    const { content, wrap } = loc.t;
    const resolution = await resolve(content, wrap, context, unit, "normal_env", helpers);
    if (resolution.type !== "bound") syntax_error(loc, "unbound identifier");
    const new_modular = extend_modular(
      modular,
      true,
      content,
      wrap.marks,
      resolution.label,
      "normal_env",
      loc,
    );
    return go_right(loc, (loc) =>
      after_identifier({ loc, modular: new_modular, context, unit, helpers, ...data }),
    );
  };
  const after_identifier: walker = ({ loc, ...data }) =>
    loc.t.content === "}" ? Promise.resolve({ loc, ...data }) : debug(loc, "TODO");

  const expect_export: walker = ({ loc, ...data }) =>
    loc.t.content === "}"
      ? Promise.resolve({ loc, ...data })
      : loc.t.tag === "identifier"
        ? handle_identifier({ loc, ...data })
        : syntax_error(loc);

  const start: walker = ({ loc, ...data }) =>
    loc.t.content === "export"
      ? go_right(loc, (loc) =>
          go_down(loc, (loc) =>
            loc.t.content === "{"
              ? go_right(loc, (loc) => expect_export({ loc, ...data }))
              : syntax_error(loc),
          ),
        )
      : syntax_error(loc);

  if (!data.modular.extensible) syntax_error(main_loc, "invalid context for export");
  return go_down(main_loc, (loc) =>
    start({ loc, ...data }).then((data) => ({
      ...data,
      loc: change(main_loc, mkzipper(empty_slice)),
    })),
  );
};

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

const postexpand_forms = (sort: "type" | "value") => non_modular(postexpand_body(sort));

function cleanup_name(name: string): string {
  return name.replace(/(_\d+)+$/, "");
}

const postexpand_body = (sort: "type" | "value") => (data: data) => {
  const cont: walker = ({ loc, ...data }) =>
    go_next(
      loc,
      (loc) => h({ loc, ...data }),
      (loc) => Promise.resolve({ loc, ...data }),
    );
  const h: walker = async ({ loc: old_loc, ...data }) => {
    const ffrv = find_form(old_loc);
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return { ...data, loc };
      case "identifier": {
        assert(loc.t.type === "atom");
        const { tag, content, wrap } = loc.t;
        switch (tag) {
          case "identifier": {
            const resolution = await resolve(
              content,
              wrap,
              data.context,
              data.unit,
              sort_env[sort],
              data.helpers,
            );
            switch (resolution.type) {
              case "bound": {
                const { binding, label } = resolution;
                switch (binding.type) {
                  case "ts":
                  case "type":
                  case "lexical": {
                    return cont({ ...data, loc: rename(loc, binding.name) });
                  }
                  case "imported_type":
                  case "imported_lexical": {
                    const { imp, counters } = data;
                    const existing = (imp[label.cuid] ?? {})[label.name];
                    if (existing) {
                      return cont({ ...data, loc: rename(loc, existing.new_name) });
                    } else {
                      const { name } = binding;
                      const new_name = `${cleanup_name(name)}_${counters.vars}`;
                      const new_counters = { ...counters, vars: counters.vars + 1 };
                      const new_imp: import_req = {
                        ...imp,
                        [label.cuid]: {
                          ...(imp[label.cuid] ?? {}),
                          [label.name]: {
                            type: {
                              imported_lexical: "value" as const,
                              imported_type: "type" as const,
                            }[binding.type],
                            new_name,
                          },
                        },
                      };
                      return cont({
                        ...data,
                        loc: rename(loc, new_name),
                        imp: new_imp,
                        counters: new_counters,
                      });
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
            return postexpand_lexical_declaration({ ...data, loc }).then(cont);
          case "arrow_function": {
            return in_isolation(loc, (loc) => expand_arrow_function({ ...data, loc })).then(cont);
          }
          case "slice": {
            return syntax_error(loc, "invalid slice");
          }
          case "type_alias_declaration": {
            return postexpand_type_alias_declaration({ ...data, loc }).then(cont);
          }
          case "export_declaration": {
            return postexpand_export_declaration({ ...data, loc }).then(cont);
          }
          case "member_expression": {
            return go_down(loc, (loc) =>
              in_isolation(loc, (loc) => postexpand_forms(sort)({ ...data, loc }))
                .then(({ loc, ...data }) =>
                  go_right(loc, (loc) => {
                    assert(loc.t.content === ".");
                    return go_right(loc, (loc) => {
                      if (loc.t.tag === "identifier") {
                        // rename to identifier name itself
                        return { ...data, loc: rename(loc, loc.t.content) };
                      } else {
                        return syntax_error(loc, "not an identifier");
                      }
                    });
                  }),
                )
                .then(cont),
            );
          }
          default: {
            if (list_handlers_table[loc.t.tag] !== "descend") {
              debug(loc, `unhandled '${loc.t.tag}' form in postexpand_body`);
            }
            return cont({ ...data, loc });
          }
        }
      }
    }
  };
  return h(data);
};
