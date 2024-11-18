import { assert } from "./assert";
import { AST, atom_tag } from "./AST";
import {
  CompilationUnit,
  Context,
  new_rib_id,
  Rib,
  Loc,
  Wrap,
  STX,
} from "./syntax-structures";
import {
  extend_unit,
  init_top_level,
  resolve,
  extend_rib,
  extend_context,
  CorePatterns,
} from "./STX";
import {
  change,
  go_down,
  go_next,
  go_right,
  isolate,
  mkzipper,
  wrap_loc,
} from "./zipper";
import { core_handlers } from "./syntax-core-patterns";

export type Step =
  | {
      type: "ExpandProgram";
      loc: Loc;
      unit: CompilationUnit;
      context: Context;
      counter: number;
    }
  | { type: "SyntaxError"; loc: Loc; reason: string }
  | { type: "Inspect"; loc: Loc; reason: string; k: () => Step }
  | { type: "DONE"; loc: Loc }
  | { type: "DEBUG"; loc: Loc; msg: string; info: any };

export function initial_step(ast: AST, patterns: CorePatterns): Step {
  const { stx, counter, unit, context } = init_top_level(ast, patterns);
  const loc: Loc = mkzipper(stx);
  return {
    type: "ExpandProgram",
    loc,
    counter,
    unit,
    context,
  };
}

const debug: (
  msg: string
) => ({ loc, ...info }: { loc: Loc; [k: string]: any }) => Step =
  (msg) =>
  ({ loc, ...info }) => ({
    type: "DEBUG",
    loc,
    msg,
    info,
  });

const inspect: (loc: Loc, reason: string, k: () => Step) => Step = (
  loc,
  reason,
  k
) => ({ type: "Inspect", loc, reason, k });

function extract_lexical_declaration_bindings<T>(
  loc: Loc,
  rib: Rib,
  context: Context,
  counter: number,
  sk: (args: { loc: Loc; rib: Rib; context: Context; counter: number }) => T,
  fk: (loc: Loc, reason: string) => T
): T {
  function after_vars(ls: Loc, rib: Rib, context: Context, counter: number): T {
    if (ls.t.type === "atom" && ls.t.tag === "other") {
      switch (ls.t.content) {
        case ";":
          return go_next(
            ls,
            (loc) => fk(loc, "expected nothing after semicolon"),
            (loc) => sk({ loc, rib, context, counter })
          );
        case ",":
          return go_right(
            ls,
            (loc) => get_vars(loc, rib, context, counter),
            (loc) => fk(loc, "expected variable after ','")
          );
      }
    }
    return fk(ls, "expected a ',' or a ';'");
  }

  function get_vars(ls: Loc, rib: Rib, context: Context, counter: number): T {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(ls, (loc) => {
        const stx = loc.t;
        if (stx.type === "atom" && stx.tag === "identifier") {
          return extend_rib(
            rib,
            stx.content,
            stx.wrap.marks,
            counter,
            "normal_env",
            ({ rib, counter, label }) =>
              extend_context(
                context,
                counter,
                label,
                "lexical",
                stx.content,
                ({ context, counter }) =>
                  go_next(
                    ls,
                    (loc) => after_vars(loc, rib, context, counter),
                    (loc) => sk({ loc, rib, context, counter })
                  )
              ),
            (reason) => fk(loc, reason)
          );
        } else {
          throw new Error(`HERE2 ${stx.type}:${stx.tag}`);
        }
      });
    } else {
      return fk(ls, `expected a variable declaration; found ${ls.t.tag}`);
    }
  }
  return go_down(loc, (loc) => {
    if (loc.t.type === "atom") {
      if (
        loc.t.tag === "other" &&
        (loc.t.content === "const" || loc.t.content === "let")
      ) {
        return go_right(
          loc,
          (loc) => get_vars(loc, rib, context, counter),
          (loc) => fk(loc, "no bindings after keyword")
        );
      } else {
        throw new Error(`HERE? ${loc.t.type}:${loc.t.tag}`);
      }
    } else {
      return fk(loc, "expected keyword const or let");
    }
  });
}

function expand_program(step: {
  loc: Loc;
  unit: CompilationUnit;
  context: Context;
  counter: number;
}): Step {
  assert(step.loc.t.tag === "program");
  const rib: Rib = {
    type: "rib",
    types_env: {},
    normal_env: {},
  };
  const [rib_id, counter] = new_rib_id(step.counter);
  const wrap: Wrap = { marks: null, subst: [{ rib_id }, null] };
  return go_down(wrap_loc(step.loc, wrap), (loc) =>
    preexpand_body({
      loc,
      rib,
      unit: extend_unit(step.unit, rib_id, rib), // rib is empty
      context: step.context,
      counter,
      k: ({ loc, rib, counter, context }) => {
        // rib is filled
        // context is filled also
        const unit = extend_unit(step.unit, rib_id, rib);
        // unit is now filled
        return postexpand_program({
          loc,
          counter,
          context,
          unit,
          k: debug("finished postexpand"),
        });
      },
    })
  );
}

function preexpand_body(step: {
  loc: Loc;
  rib: Rib;
  unit: CompilationUnit;
  context: Context;
  counter: number;
  k: (props: { loc: Loc; rib: Rib; context: Context; counter: number }) => Step;
}): Step {
  return preexpand_forms({
    loc: isolate(step.loc),
    rib: step.rib,
    counter: step.counter,
    unit: step.unit,
    context: step.context,
    k: ({ loc, rib, context, counter }) =>
      go_next<Step>(
        change(step.loc, loc), // unisolate
        (loc) =>
          preexpand_body({
            loc,
            rib,
            counter,
            context,
            unit: step.unit,
            k: step.k,
          }),
        (loc) => step.k({ loc, rib, context, counter })
      ),
  });
}

function handle_core_syntax<T>(
  loc: Loc,
  name: string,
  pattern: STX,
  k: (loc: Loc) => T
): T {
  const handler = core_handlers[name];
  if (handler) {
    return handler(loc, pattern, k);
  } else {
    throw new Error(`missing handler for ${name}`);
  }
}

function preexpand_forms(step: {
  loc: Loc;
  rib: Rib;
  counter: number;
  unit: CompilationUnit;
  context: Context;
  k: (props: { loc: Loc; rib: Rib; context: Context; counter: number }) => Step;
}): Step {
  return find_form({
    loc: step.loc,
    done: (loc) =>
      step.k({
        loc,
        rib: step.rib,
        context: step.context,
        counter: step.counter,
      }),
    kid: ({ loc, cont }) => {
      if (loc.t.type !== "atom") throw new Error("expected atom");
      const { tag, content, wrap } = loc.t;
      switch (tag) {
        case "identifier": {
          const resolution = resolve(
            content,
            wrap,
            step.context,
            step.unit,
            "normal_env"
          );
          switch (resolution.type) {
            case "unbound":
              return cont(loc);
            case "bound": {
              const binding = resolution.binding;
              switch (binding.type) {
                case "lexical":
                  return cont(loc);
                case "core_syntax": {
                  const { name, pattern } = binding;
                  return inspect(loc, `Handling core '${name}' syntax.`, () =>
                    handle_core_syntax(loc, name, pattern, (loc) =>
                      debug("after inspect")({ loc })
                    )
                  );
                }
                default:
                  const invalid: never = binding;
                  throw invalid;
              }
            }
            case "error": {
              return { type: "SyntaxError", loc, reason: resolution.reason };
            }
            default:
              const invalid: never = resolution;
              throw invalid;
          }
        }
        default:
          return debug("unhandled atom tag")({ loc, tag });
      }
    },
    klist: ({ loc, cont }) => {
      if (loc.t.type !== "list") throw new Error("expected list");
      switch (loc.t.tag) {
        case "lexical_declaration": {
          return extract_lexical_declaration_bindings(
            loc,
            step.rib,
            step.context,
            step.counter,
            ({ loc, rib, context, counter }) =>
              go_next(
                loc,
                (loc) => debug("next of lexical")({ loc }),
                (loc) => step.k({ loc, rib, context, counter })
              ),
            (loc, reason) => {
              return { type: "SyntaxError", loc, reason };
            }
          );
        }
        default: {
          assert(list_handlers[loc.t.tag] === "descend");
          return cont(loc);
        }
      }
    },
  });
}

const atom_handlers: { [tag in atom_tag]: "next" | "stop" } = {
  identifier: "stop",
  type_identifier: "stop",
  property_identifier: "stop",
  shorthand_property_identifier: "stop",
  number: "next",
  jsx_text: "next",
  string_fragment: "next",
  regex_pattern: "next",
  other: "next",
};

const list_handlers: { [tag: string]: "descend" | "stop" } = {
  lexical_declaration: "stop",
  variable_declarator: "stop",
  expression_statement: "descend",
  call_expression: "descend",
  arguments: "descend",
  binary_expression: "descend",
  array: "descend",
  member_expression: "descend",
};

function find_form<T>({
  loc,
  done,
  kid,
  klist,
}: {
  loc: Loc;
  done: (loc: Loc) => T;
  kid: (args: { loc: Loc; cont: (loc: Loc) => T }) => T;
  klist: (args: {
    loc: Loc;
    cont: (loc: Loc) => T;
    descend: (loc: Loc) => T;
  }) => T;
}): T {
  function find_form(loc: Loc): T {
    switch (loc.t.type) {
      case "atom": {
        const { tag, content } = loc.t;
        const action = atom_handlers[tag];
        switch (action) {
          case "stop": {
            return kid({ loc, cont: (loc) => go_next(loc, find_form, done) });
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
        const action = list_handlers[tag];
        if (action === undefined) {
          throw new Error(`no stop_table entry for ${tag}`);
        }
        switch (action) {
          case "descend":
            return go_down(loc, find_form);
          case "stop":
            return klist({
              loc,
              cont: (loc) => go_next(loc, find_form, done),
              descend: (loc) => go_down(loc, find_form),
            });
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
  k: (args: { loc: Loc }) => Step;
}): Step {
  assert(step.loc.t.tag === "program");
  return go_down(step.loc, (loc) =>
    postexpand_body({
      loc,
      unit: step.unit,
      counter: step.counter,
      context: step.context,
      k: step.k,
    })
  );
}

function postexpand_done(loc: Loc): Step {
  return { type: "DONE", loc };
}

function postexpand_body(step: {
  loc: Loc;
  unit: CompilationUnit;
  counter: number;
  context: Context;
  k: (args: { loc: Loc }) => Step;
}): Step {
  return find_form({
    loc: step.loc,
    done: postexpand_done,
    kid: ({ loc, cont }) => {
      if (loc.t.type !== "atom") throw new Error("expected atom");
      const { tag, content, wrap } = loc.t;
      switch (tag) {
        case "identifier": {
          const resolution = resolve(
            content,
            wrap,
            step.context,
            step.unit,
            "normal_env"
          );
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
                    change(loc, { type: "loc", t: new_id, p: { type: "top" } })
                  );
                }
              }
            }
            case "unbound":
              return { type: "SyntaxError", loc, reason: "unbound identifier" };
          }
          return debug("resolved")({ loc, resolution });
        }
        default:
          return debug("unhandled atom tag")({ loc, tag });
      }
    },
    klist: ({ loc, cont, descend }) => {
      if (loc.t.type !== "list") throw new Error("expected list");
      switch (loc.t.tag) {
        case "lexical_declaration":
          return descend(loc);
        case "variable_declarator":
          return descend(loc);
        default: {
          assert(list_handlers[loc.t.tag] === "descend");
          return cont(loc);
        }
      }
    },
  });
}

export function next_step(step: Step): Step {
  switch (step.type) {
    case "ExpandProgram":
      return expand_program(step);
    case "Inspect":
      return step.k();
  }
  throw new Error(`${step.type} is not implemented`);
}
