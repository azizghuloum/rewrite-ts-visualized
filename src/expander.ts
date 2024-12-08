import { assert } from "./assert";
import { AST } from "./ast";
import { atom_tag, list_tag } from "./tags";
import { CompilationUnit, Context, new_rib_id, Rib, Loc, Wrap, STX } from "./syntax-structures";
import {
  extend_unit,
  init_top_level,
  resolve,
  extend_rib,
  extend_context_lexical,
  CorePatterns,
  push_wrap,
  extension,
} from "./stx";
import { change, go_down, go_next, go_right, go_up, mkzipper, wrap_loc } from "./zipper";
import { apply_syntax_rules, core_handlers } from "./syntax-core-patterns";
import { debug, inspect, in_isolation, syntax_error } from "./stx-error";

export function initial_step(
  ast: AST,
  cu_id: string,
  patterns: CorePatterns,
): [Loc, (inspect: inspect) => Promise<{ loc: Loc; unit: CompilationUnit; context: Context }>] {
  const { stx, counter, unit, context, rib, rib_id } = init_top_level(ast, cu_id, patterns);
  const initial_loc: Loc = mkzipper(stx);
  return [
    initial_loc,
    (inspect: inspect) =>
      expand_program(initial_loc, unit, context, counter, inspect, {
        extensible: true,
        rib,
        rib_id,
      }),
  ];
}

type goodies = {
  loc: Loc;
  extension: extension;
  context: Context;
  counter: number;
  unit: CompilationUnit;
};

function gen_binding({
  loc,
  extension,
  counter,
  context,
  unit,
  sort,
}: goodies & { sort: "type" | "value" }): Omit<goodies, "loc"> & { name: string } {
  const stx = loc.t;
  assert(stx.type === "atom" && stx.tag === "identifier", stx);
  assert(extension.extensible);
  const { rib, rib_id } = extension;
  return extend_rib(
    rib,
    stx.content,
    stx.wrap.marks,
    counter,
    { type: "types_env" as const, value: "normal_env" as const }[sort],
    ({ rib, counter, label }) =>
      extend_context_lexical(
        context,
        counter,
        label,
        { type: "type" as const, value: "lexical" as const }[sort],
        stx.content,
        ({ context, counter, name }) => ({
          extension: { extensible: true, rib, rib_id },
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
  extension,
  context,
  counter,
  unit,
}: goodies): goodies {
  function after_vars({ loc, extension, context, counter, unit }: goodies): goodies {
    if (loc.t.type === "atom" && loc.t.tag === "other") {
      switch (loc.t.content) {
        case ";":
          return go_right(
            loc,
            (loc) => syntax_error(loc, "expected nothing after semicolon"),
            (loc) => ({ loc, extension, context, counter, unit }),
          );
        case ",":
          return go_right(
            loc,
            (loc) => get_vars(loc, extension, context, counter),
            (loc) => syntax_error(loc, "expected variable after ','"),
          );
      }
    }
    syntax_error(loc, "expected a ',' or a ';'");
  }

  function get_vars(ls: Loc, extension: extension, context: Context, counter: number): goodies {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(
        ls,
        (loc) => {
          const goodies = gen_binding({ loc, extension, counter, context, unit, sort: "value" });
          return go_right(
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
            (loc) => get_vars(loc, extension, context, counter),
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

function extract_type_alias_declaration_bindings({
  loc,
  extension,
  context,
  counter,
  unit,
}: goodies): goodies {
  return go_down(
    loc,
    (loc) => {
      assert(loc.t.content === "type", "expected 'type' keyword");
      return go_right(
        loc,
        (loc) => {
          assert(loc.t.type === "atom" && loc.t.tag === "identifier", "expected an identifier");
          const gs = gen_binding({ loc, extension, counter, context, unit, sort: "type" });
          return { ...gs, loc: go_up(loc) };
        },
        syntax_error,
      );
    },
    syntax_error,
  );
}

async function expand_program(
  loc: Loc,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  inspect: inspect,
  extension: extension,
): Promise<{ loc: Loc; unit: CompilationUnit; context: Context }> {
  if (loc.t.tag !== "program") syntax_error(loc, "expected a program");
  const fst = go_down(
    loc,
    (x) => x,
    (loc) => syntax_error(loc, "empty program?"),
  );
  return preexpand_body(fst, extension, unit, context, counter, "value", inspect).then(
    ({ loc, extension, counter, context, unit }) => {
      // rib is filled
      // context is filled also
      const new_unit = extend_unit(unit, extension);
      return inspect(loc, "After preexpanding the program", () =>
        postexpand_program(loc, new_unit, counter, context, inspect).then(({ loc }) => {
          return { loc, unit: new_unit, context };
        }),
      );
    },
  );
}

async function preexpand_body(
  loc: Loc,
  extension: extension,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  sort: "type" | "value",
  inspect: inspect,
): Promise<goodies> {
  return in_isolation(
    loc,
    (loc) => preexpand_forms(loc, extension, counter, unit, context, sort, inspect),
    (loc, { extension, context, counter, unit }) =>
      go_next(
        loc,
        (loc) => preexpand_body(loc, extension, unit, context, counter, sort, inspect),
        (loc) => Promise.resolve({ loc, extension, context, counter, unit }),
      ),
  );
}

async function preexpand_body_curly(
  loc: Loc,
  extension: extension,
  unit: CompilationUnit,
  context: Context,
  counter: number,
  sort: "type" | "value",
  inspect: inspect,
): Promise<goodies> {
  if (loc.t.type === "atom" && loc.t.tag === "other" && loc.t.content === "}") {
    return go_right(loc, syntax_error, () =>
      Promise.resolve({
        loc: go_up(loc),
        context,
        counter,
        extension,
        unit,
      }),
    );
  }
  return in_isolation(
    loc,
    (loc) => preexpand_forms(loc, extension, counter, unit, context, sort, inspect),
    (loc, { extension, context, counter, unit }) => {
      return go_right(
        loc,
        (loc) => preexpand_body_curly(loc, extension, unit, context, counter, sort, inspect),
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
  extension: extension,
): Promise<{
  loc: Loc;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  extension: extension;
}> {
  const handler = core_handlers[name];
  assert(handler !== undefined);
  return handler(loc, context, unit, counter, extension);
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
  export_statement: "descend",
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
  import_clause: "todo",
  import_specifier: "todo",
  import_statement: "todo",
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
  extension: extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  inspect: inspect,
): Promise<goodies> {
  assert(loc.t.type === "list" && loc.t.tag === "statement_block");
  const bodies = go_down(loc, itself, (loc) => syntax_error(loc, "no bodies"));
  assert(bodies.t.type === "atom" && bodies.t.tag === "other" && bodies.t.content === "{");
  const bodies_rest = go_right(bodies, itself, (loc) => syntax_error(loc, "no body rest"));
  const gs = await preexpand_body_curly(
    bodies_rest,
    extension,
    unit,
    context,
    counter,
    sort,
    inspect,
  );
  assert(gs.loc.t.type === "list" && gs.loc.t.tag === "statement_block");
  return gs;
}

async function expand_concise_body(
  loc: Loc,
  extension: extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  inspect: inspect,
): Promise<{ loc: Loc }> {
  const gs = await (loc.t.type === "list" && loc.t.tag === "statement_block"
    ? preexpand_block(loc, extension, counter, unit, context, sort, inspect).then(
        ({ loc, ...gs }) =>
          go_down(
            loc,
            (loc) => ({ ...gs, loc }),
            (loc) => debug(loc, "???"),
          ),
      )
    : preexpand_forms(loc, extension, counter, unit, context, sort, inspect));
  const new_unit = extend_unit(gs.unit, gs.extension);
  return postexpand_body(gs.loc, new_unit, gs.counter, gs.context, sort, inspect);
}

function rewrap(loc: Loc, rib_id: string, cu_id: string): Loc {
  return {
    type: "loc",
    t: push_wrap({ marks: null, subst: [{ rib_id, cu_id }, null] })(loc.t),
    p: loc.p,
  };
}

async function preexpand_forms(
  loc: Loc,
  extension: extension,
  counter: number,
  unit: CompilationUnit,
  context: Context,
  sort: "type" | "value",
  inspect: inspect,
): Promise<goodies> {
  function done(loc: Loc): Promise<goodies> {
    return Promise.resolve({
      loc,
      extension,
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
  function h(ffrv: ffrv): Promise<goodies> {
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
                return inspect(loc, "core form", () =>
                  handle_core_syntax(loc, name, context, unit, counter, extension).then(
                    ({ loc, counter, unit, context, extension }) =>
                      inspect(loc, `core output`, () =>
                        preexpand_forms(loc, extension, counter, unit, context, sort, inspect),
                      ),
                  ),
                );
              }
              case "syntax_rules_transformer": {
                const { clauses } = binding;
                return inspect(loc, `transformer form`, () =>
                  apply_syntax_rules(loc, clauses, unit, counter).then(({ loc, counter }) => {
                    const rewrapped = extension.extensible
                      ? rewrap(loc, extension.rib_id, unit.cu_id)
                      : loc;
                    return inspect(rewrapped, `transformer output`, () =>
                      preexpand_forms(rewrapped, extension, counter, unit, context, sort, inspect),
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
        switch (loc.t.tag) {
          case "lexical_declaration": {
            const goodies = extract_lexical_declaration_bindings({
              loc,
              extension,
              context,
              counter,
              unit,
            });
            return go_next(
              goodies.loc,
              (loc) =>
                preexpand_forms(
                  loc,
                  goodies.extension,
                  goodies.counter,
                  goodies.unit,
                  goodies.context,
                  sort,
                  inspect,
                ),
              (loc) => Promise.resolve({ ...goodies, loc }),
            );
          }
          case "type_alias_declaration": {
            const goodies = extract_type_alias_declaration_bindings({
              loc,
              extension,
              context,
              counter,
              unit,
            });
            return go_next(
              goodies.loc,
              (loc) =>
                preexpand_forms(
                  loc,
                  goodies.extension,
                  goodies.counter,
                  goodies.unit,
                  goodies.context,
                  sort,
                  inspect,
                ),
              (loc) => Promise.resolve({ ...goodies, loc }),
            );
          }
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
  unit: CompilationUnit,
  counter: number,
  context: Context,
  inspect: inspect,
): Promise<{ loc: Loc }> {
  assert(loc.t.tag === "program");
  return go_down(loc, (loc) => postexpand_body(loc, unit, counter, context, "value", inspect));
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
  inspect: inspect,
): Promise<{ loc: Loc }> {
  return go_down(
    loc,
    (loc) => {
      const [rib_id, new_counter] = new_rib_id(counter);
      const extension: extension = {
        extensible: true,
        rib_id,
        rib: { type: "rib", normal_env: {}, types_env: {} },
      };
      const pgs = extract_parameters({ loc, extension, counter, context, unit });
      const arr = go_right(pgs.loc, itself, invalid_form);
      check_punct(arr, "=>");
      const body = go_right(arr, itself, invalid_form);
      return in_isolation(
        body,
        async (body) => {
          const wrap: Wrap = { marks: null, subst: [{ rib_id, cu_id: unit.cu_id }, null] };
          const loc = wrap_loc(body, wrap);
          assert(pgs.extension.extensible);
          const new_unit = extend_unit(pgs.unit, pgs.extension); // params are in rib
          return expand_concise_body(
            loc,
            pgs.extension,
            new_counter,
            new_unit,
            pgs.context,
            "value",
            inspect,
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
  inspect: inspect,
): Promise<goodies> {
  type T = Promise<goodies>;
  function post_after_var({ loc, extension, counter, unit, context }: goodies): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ",");
        return go_right(
          loc,
          (loc) => post_var({ loc, extension, counter, unit, context }),
          (loc) => {
            debug(loc, "cant go past commma2?");
          },
        );
      },
      (loc) => end({ loc: go_up(loc), extension, unit, counter, context }),
    );
  }

  function post_var({ loc, extension, counter, unit, context }: goodies): T {
    switch (loc.t.tag) {
      case "identifier":
        return post_after_var({ loc, extension, counter, unit, context });
      case "type_parameter":
        return go_down(loc, (loc) => {
          assert(loc.t.tag === "identifier");
          return go_right(loc, (loc) => {
            if (loc.t.content !== "extends") syntax_error(loc, "expected 'extends'");
            assert(extension.extensible);
            return go_right(loc, (loc) =>
              expand_expr({
                loc: wrap_loc(loc, {
                  marks: null,
                  subst: [{ rib_id: extension.rib_id, cu_id: unit.cu_id }, null],
                }),
                counter,
                unit,
                context,
                sort: "type",
                inspect,
              }).then(({ loc, counter, unit, context }) =>
                go_right(loc, syntax_error, () =>
                  post_after_var({ loc: go_up(loc), extension, counter, unit, context }),
                ),
              ),
            );
          });
        });
      default:
        syntax_error(loc);
    }
  }

  function pre_after_var({ loc, extension, counter, unit, context }: goodies): T {
    assert(extension.extensible);
    return go_right(
      loc,
      (loc) => {
        if (loc.t.content !== ",") syntax_error(loc, "expected a comma ','");
        return go_right(
          loc,
          (loc) => pre_var({ loc, extension, counter, unit, context }),
          (loc) => debug(loc, "cant go past commma?"),
        );
      },
      (loc) =>
        go_down(go_up(loc), (loc) =>
          post_var({
            loc,
            extension,
            counter,
            unit: extend_unit(unit, extension),
            context,
          }),
        ),
    );
  }

  function pre_var({ loc, extension, counter, unit, context }: goodies): T {
    switch (loc.t.tag) {
      case "identifier":
        const { name, ...gs } = gen_binding({
          loc,
          extension,
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
            extension,
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
    const extension: extension = { extensible: true, rib_id, rib };
    return go_down(
      loc,
      (loc) => pre_var({ loc, extension, unit, counter, context }),
      (loc) => end({ loc, unit, extension, context, counter }),
    );
  }

  async function end({ loc, extension, unit, context, counter }: goodies): T {
    return go_right(
      loc,
      (loc) => {
        assert(loc.t.content === ">");
        return { loc, extension, unit, counter, context };
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
  inspect,
}: {
  loc: Loc;
  unit: CompilationUnit;
  counter: number;
  context: Context;
  sort: "type" | "value";
  inspect: inspect;
}): Promise<Omit<goodies, "extension">> {
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
        inspect,
      ).then(({ loc, unit, counter, context }) =>
        postexpand_body(loc, unit, counter, context, sort, inspect).then(({ loc }) => ({
          loc,
          unit,
          counter,
          context,
        })),
      );
    },
    (loc, { unit, counter, context }) => ({ loc, unit, counter, context }),
  );
}

async function postexpand_type_alias_declaration(
  loc: Loc,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  inspect: inspect,
): Promise<Loc> {
  return go_down(loc, (loc) => {
    assert(loc.t.content === "type");
    return go_right(loc, (loc) => {
      assert(loc.t.tag === "identifier");
      const { content, wrap } = loc.t;
      const resolution = resolve(content, wrap, context, unit, "types_env");
      assert(resolution.type === "bound");
      assert(resolution.binding.type === "type");
      const new_name = resolution.binding.name;
      return go_right(rename(loc, new_name), async (loc) => {
        async function do_after_equal({ loc, counter, unit, context }: Omit<goodies, "extension">) {
          return expand_expr({
            loc,
            counter,
            unit,
            context,
            sort: "type",
            inspect,
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
        switch (loc.t.content) {
          case "=":
            return go_right(loc, (loc) => do_after_equal({ loc, counter, unit, context }));
          case "<":
            return expand_type_parameters(loc, unit, counter, context, inspect).then(
              ({ loc, counter, unit, context, extension }) => {
                assert(loc.t.content === ">");
                assert(extension.extensible);
                return go_right(loc, (loc) => {
                  if (loc.t.content !== "=") syntax_error(loc, "expected '='");
                  return go_right(loc, (loc) =>
                    do_after_equal({
                      loc: wrap_loc(loc, {
                        marks: null,
                        subst: [{ rib_id: extension.rib_id, cu_id: unit.cu_id }, null],
                      }),
                      counter,
                      unit,
                      context,
                    }),
                  );
                });
              },
            );
          default:
            return syntax_error(loc);
        }
      });
    });
  });
}

function rename(loc: Loc, new_name: string): Loc {
  const new_id: STX = {
    type: "atom",
    tag: "identifier",
    wrap: { marks: null, subst: null },
    content: new_name,
  };
  return change(loc, { type: "loc", t: new_id, p: { type: "top" } });
}

const sort_env = { type: "types_env" as const, value: "normal_env" as const };

async function postexpand_body(
  loc: Loc,
  unit: CompilationUnit,
  counter: number,
  context: Context,
  sort: "type" | "value",
  inspect: inspect,
): Promise<{ loc: Loc }> {
  type T = Promise<{ loc: Loc }>;

  async function done(loc: Loc): T {
    return { loc };
  }
  function cont(loc: Loc): T {
    return go_next(loc, (loc) => h(find_form(loc)), done);
  }
  function descend(loc: Loc): T {
    return go_down(loc, (loc) => h(find_form(loc)), cont);
  }
  async function h(ffrv: ffrv): T {
    const loc = ffrv.loc;
    switch (ffrv.type) {
      case "done":
        return done(loc);
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
                    return cont(rename(loc, binding.name));
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
            return descend(loc);
          case "variable_declarator": {
            return go_down(
              loc,
              (loc) =>
                in_isolation(
                  loc,
                  (loc) =>
                    expand_expr({
                      // TODO not exactly right
                      loc,
                      counter,
                      unit,
                      context,
                      sort: "value",
                      inspect,
                    }),
                  (loc, { counter, context, unit }) =>
                    go_right(
                      loc,
                      (loc) => {
                        assert(loc.t.content === "=");
                        return go_right(
                          loc,
                          (loc) =>
                            in_isolation(
                              loc,
                              (loc) =>
                                expand_expr({
                                  loc,
                                  counter,
                                  unit,
                                  context,
                                  sort: "value",
                                  inspect,
                                }),
                              (loc, { counter, unit, context }) => go_up(loc),
                            ).then(cont),
                          syntax_error,
                        );
                      },
                      syntax_error,
                    ),
                ),
              syntax_error,
            );
          }
          case "arrow_function": {
            return in_isolation(
              loc,
              (loc) => expand_arrow_function(loc, counter, context, unit, inspect),
              (loc, _gs) => loc,
            ).then(cont);
          }
          case "slice": {
            return syntax_error(loc, "invalid slice");
          }
          case "type_alias_declaration": {
            return postexpand_type_alias_declaration(loc, unit, counter, context, inspect).then(
              cont,
            );
          }
          case "member_expression": {
            return go_down(loc, (loc) =>
              in_isolation(
                loc,
                (loc) => postexpand_body(loc, unit, counter, context, sort, inspect),
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
              ).then(cont),
            );
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
  return h(find_form(loc));
}
