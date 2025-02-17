import { Loc, STX } from "./syntax-structures";
import { isolate, unisolate } from "./zipper";
import indexToPosition from "index-to-position";
import { codeFrameColumns } from "@babel/code-frame";
import fs from "node:fs/promises";
import { llmap, llreduce } from "./llhelpers";
import { AST, source } from "./ast";
import { assert } from "./assert";

export class StxError {
  name: string;
  loc: Loc;
  error?: string | undefined;
  info?: any;
  constructor(name: string, loc: Loc, error?: string, info?: any) {
    this.name = name;
    this.loc = loc;
    this.error = error;
    this.info = info;
  }
}

export function debug(loc: Loc, msg: string, info?: any): never {
  throw new StxError("DEBUG", loc, msg, info);
}

export function syntax_error(loc: Loc, reason?: string): never {
  throw new StxError("SyntaxError", loc, reason ?? "syntax error");
}

export const in_isolation: <G extends { loc: Loc }>(
  loc: Loc,
  f: (loc: Loc) => Promise<G>,
) => Promise<Omit<G, "loc"> & { loc: Loc }> = async (loc, f) => {
  return f(isolate(loc))
    .then(({ loc: res, ...g }) => ({ ...g, loc: unisolate(loc, res) }))
    .catch((err) => {
      if (err instanceof StxError) {
        throw new StxError(err.name, unisolate(loc, err.loc), err.error, err.info);
      } else {
        throw err;
      }
    });
};

type LibraryManager = {
  get_module_by_cuid: (cuid: string) => { path: string } | undefined;
};

export async function print_stx_error(error: StxError, library_manager: LibraryManager) {
  console.error(`${error.name}: ${error.error}`);
  if (error.info) console.error(error.info);
  const ls = loc_src_origins(error.loc.t);
  for (const x of ls) {
    const mod = library_manager.get_module_by_cuid(x.cuid);
    assert(mod !== undefined, `cannot find module with cuid ${x.cuid}`);
    const full_path = mod.path;
    const code = await fs.readFile(full_path, { encoding: "utf8" });
    const pos0 =
      typeof x.s === "number"
        ? indexToPosition(code, x.s + 1, { oneBased: true })
        : { line: x.s.line + 1, column: x.s.column + 1 };
    const pos1 =
      typeof x.e === "number"
        ? indexToPosition(code, x.e, { oneBased: true })
        : { line: x.e.line + 1, column: x.e.column + 1 };
    const cf = codeFrameColumns(code, { start: pos0, end: pos1 }, { highlightCode: true });
    console.error(cf);
    console.error(`In ${full_path}:${pos0.line}:${pos0.column}-${pos1.line}:${pos1.column}`);
  }
}

function loc_src_origins(t: STX | AST | source | false): source[] {
  if (t === false) return [];
  if (t.type === "origin") return [t];
  const wrap_srcs = llreduce(
    llmap(t.wrap?.aes ?? null, loc_src_origins),
    (s1, s2) => [...s1, ...s2],
    [] as source[],
  );
  const src = t.origin;
  if (src) {
    switch (src.type) {
      case "origin":
        return [...wrap_srcs, src];
      default: {
        const ls = loc_src_origins(src);
        return [...wrap_srcs, ...ls];
      }
    }
  }
  return wrap_srcs;
}
