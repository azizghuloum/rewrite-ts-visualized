import { assert } from "./assert";
import { counters, data, walker } from "./data";
import { imported_module } from "./preexpand-helpers";
import {
  extend_context_lexical,
  extend_rib,
  extend_unit,
  lexical_extension,
  rib_push,
} from "./stx";
import { syntax_error } from "./stx-error";
import { CompilationUnit, Context, Loc, STX } from "./syntax-structures";
import { list_tag } from "./tags";
import { change, go_down, go_right, go_up, mkzipper } from "./zipper";

function skip_optional(loc: Loc, kwd: string): Loc {
  if (loc.t.content === kwd) {
    return go_right(loc, (loc) => loc, syntax_error);
  } else {
    return loc;
  }
}

function skip_required(loc: Loc, kwd_options: string[]): Loc {
  if (loc.t.type === "atom" && kwd_options.includes(loc.t.content)) {
    return go_right(loc, (loc) => loc, syntax_error);
  } else {
    syntax_error(loc, `expected '${kwd_options}'`);
  }
}

export function gen_binding({
  loc,
  lexical,
  counters,
  context,
  unit,
  sort,
}: {
  loc: Loc;
  lexical: lexical_extension;
  counters: counters;
  context: Context;
  unit: CompilationUnit;
  sort: "type" | "value";
}): {
  name: string;
  lexical: lexical_extension;
  counters: counters;
  context: Context;
  unit: CompilationUnit;
} {
  const stx = loc.t;
  assert(stx.type === "atom" && stx.tag === "identifier", stx);
  assert(lexical.extensible);
  const { rib, rib_id } = lexical;
  const env_type = { type: "types_env" as const, value: "normal_env" as const }[sort];
  const cuid = unit.cu_id;
  return extend_rib(
    rib,
    cuid,
    stx.content,
    stx.wrap.marks,
    counters,
    env_type,
    ({ rib, counters, label }) =>
      extend_context_lexical(
        context,
        counters,
        label.name,
        { type: "type" as const, value: "lexical" as const }[sort],
        stx.content,
        ({ context, counters, name }) => ({
          lexical: { extensible: true, rib, rib_id },
          context,
          counters,
          name,
          unit,
        }),
      ),
    (reason) => syntax_error(loc, reason),
  );
}

const lexical_declaration: walker = ({ loc, lexical, context, counters, unit, ...data }) => {
  const after_vars: walker = async ({ loc, lexical, context, counters, unit, ...data }) => {
    if (loc.t.type === "atom" && loc.t.tag === "other") {
      switch (loc.t.content) {
        case ";":
          return go_right(
            loc,
            (loc) => syntax_error(loc, "expected nothing after semicolon"),
            (loc) => ({ loc, lexical, context, counters, unit, ...data }),
          );
        case ",":
          return go_right(
            loc,
            (loc) => get_vars(loc, lexical, context, counters),
            (loc) => syntax_error(loc, "expected variable after ','"),
          );
      }
    }
    syntax_error(loc, "expected a ',' or a ';'");
  };
  function get_vars(ls: Loc, lexical: lexical_extension, context: Context, counters: counters) {
    if (ls.t.type === "list" && ls.t.tag === "variable_declarator") {
      return go_down(
        ls,
        (loc) => {
          const goodies = gen_binding({
            loc,
            lexical,
            counters,
            context,
            unit,
            sort: "value",
          });
          return go_right(
            ls,
            (loc) => after_vars({ ...data, ...goodies, loc }),
            (loc) => Promise.resolve({ ...data, ...goodies, loc }),
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
    (loc) =>
      get_vars(
        skip_required(skip_optional(loc, "export"), ["let", "const"]),
        lexical,
        context,
        counters,
      ),
    syntax_error,
  );
};

const type_alias_declaration: walker = ({ loc, ...data }) => {
  async function after_type(loc: Loc) {
    assert(loc.t.type === "atom" && loc.t.tag === "identifier", "expected an identifier");
    const gs = gen_binding({ loc, sort: "type", ...data });
    return { ...data, ...gs, loc: go_up(loc) };
  }
  return go_down(
    loc,
    (loc) => after_type(skip_required(skip_optional(loc, "export"), ["type"])),
    syntax_error,
  );
};

const import_declaration: walker = async ({ loc, helpers, ...data }) => {
  async function handle_import_from_file(loc: Loc) {
    if (loc.t.tag !== "string") syntax_error(loc, "expected a string literal for import");
    const mod = await helpers.manager.resolve_import(loc);
    return mod;
  }
  async function after_var(loc: Loc, mod: imported_module): Promise<data> {
    switch (loc.t.content) {
      case "}":
        return { loc: go_up(loc), helpers, ...data };
      case ",":
        return go_right(loc, (loc) => handle_named_import(loc, mod), syntax_error);
      default:
        syntax_error(loc);
    }
  }
  async function handle_named_import(loc0: Loc, mod: imported_module): Promise<data> {
    switch (loc0.t.tag) {
      case "identifier": {
        const name = loc0.t.content;
        const wrap = loc0.t.wrap;
        const resolutions = await mod.resolve_exported_identifier(name, loc0);
        const { loc, counters, unit, context, lexical } = await go_right(
          loc0,
          (loc) => after_var(loc, mod),
          syntax_error,
        );
        assert(lexical.extensible);
        const { rib, rib_id } = lexical;
        const new_rib = resolutions.reduce((rib, resolution) => {
          assert(typeof resolution.label !== "string");
          return rib_push(
            rib,
            name,
            wrap.marks,
            resolution.label,
            { type: "types_env" as const, value: "normal_env" as const }[resolution.type],
            loc0,
          );
        }, rib);
        const new_lexical: lexical_extension = { extensible: true, rib: new_rib, rib_id };
        const new_unit = extend_unit(unit, new_lexical);
        return { loc, ...data, counters, unit: new_unit, context, lexical: new_lexical, helpers };
      }
      default:
        syntax_error(loc, `unexpected ${loc.t.tag} in import context`);
    }
  }
  async function handle_named_imports(loc: Loc, mod: imported_module): Promise<data> {
    if (loc.t.content !== "{") syntax_error(loc);
    return go_right(loc, (loc) => handle_named_import(loc, mod), syntax_error);
  }
  async function handle_imports(loc: Loc, mod: imported_module): Promise<data> {
    switch (loc.t.tag) {
      case "named_imports":
        return go_down(loc, (loc) => handle_named_imports(loc, mod), syntax_error);
      default:
        syntax_error(loc, `unexpected ${loc.t.tag} in import`);
    }
  }
  async function handle_import_clause(loc: Loc): Promise<data> {
    if (loc.t.tag === "import_clause") {
      const mod = await handle_import_from_file(
        skip_required(
          go_right(loc, (loc) => loc, syntax_error),
          ["from"],
        ),
      );
      return go_down(loc, (loc) => handle_imports(loc, mod), syntax_error);
    } else {
      syntax_error(loc, "expected an import clause");
    }
  }
  const empty_slice: STX = {
    type: "list",
    tag: "slice",
    content: null,
    src: loc.t,
    wrap: undefined,
  };
  return go_down(
    loc,
    (loc) => handle_import_clause(skip_required(loc, ["import"])),
    syntax_error,
  ).then(({ ...gs }) => ({ ...gs, loc: change(loc, mkzipper(empty_slice)) }));
};

export const preexpand_list_handlers: { [k in list_tag]?: walker } = {
  lexical_declaration,
  type_alias_declaration,
  import_declaration,
};
