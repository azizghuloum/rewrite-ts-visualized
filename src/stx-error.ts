import { Loc } from "./syntax-structures";
import { isolate, unisolate } from "./zipper";

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
