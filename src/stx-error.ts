import { join } from "path";
import { assert } from "./assert";
import { Loc, STX } from "./syntax-structures";
import { isolate, unisolate } from "./zipper";
import indexToPosition from "index-to-position";
import { codeFrameColumns } from "@babel/code-frame";
import fs from "node:fs/promises";
import { llmap, llreduce } from "./llhelpers";
import { AST, source } from "./ast";

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

export const in_isolation: <G extends { loc: Loc }, T>(
  loc: Loc,
  f: (loc: Loc) => Promise<G>,
  k: (loc: Loc, g: Omit<G, "loc">) => T,
) => Promise<T> = async (loc, f, k) => {
  return f(isolate(loc)).then(({ loc: res, ...g }) => k(unisolate(loc, res), g));
};

type LibraryManager = {
  get_package: (name: string, version: string) => { dir: string } | undefined;
};

export async function print_stx_error(error: StxError, library_manager: LibraryManager) {
  console.error(`${error.name}: ${error.error}`);
  if (error.info) console.error(error.info);
  const ls = loc_src_origins(error.loc.t);
  for (const x of ls) {
    const pkg = library_manager.get_package(x.f.package.name, x.f.package.version);
    assert(pkg !== undefined);
    const full_path = join(pkg.dir, x.f.path);
    const code = await fs.readFile(full_path, { encoding: "utf8" });
    const pos0 = indexToPosition(code, x.p + 1, { oneBased: true });
    const pos1 = indexToPosition(code, x.e, { oneBased: true });
    const cf = codeFrameColumns(code, { start: pos0, end: pos1 }, { highlightCode: true });
    console.error(cf);
    console.error(`In ${full_path}:${x.p}-${x.e}`);
  }
}

function loc_src_origins(t: STX | AST | false): source[] {
  if (t === false) return [];
  const wrap_srcs = llreduce(
    llmap(t.wrap?.aes ?? null, loc_src_origins),
    (s1, s2) => [...s1, ...s2],
    [] as source[],
  );
  const src = t.src;
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
