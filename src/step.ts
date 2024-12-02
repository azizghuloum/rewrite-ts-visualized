import { Loc } from "./syntax-structures";
import { isolate, unisolate } from "./zipper";

export class Step {
  name: string;
  loc: Loc;
  next?: () => Promise<{ loc: Loc }>;
  error?: string | undefined;
  info?: any;
  constructor(
    name: string,
    loc: Loc,
    error?: string,
    next?: () => Promise<{ loc: Loc }>,
    info?: any,
  ) {
    this.name = name;
    this.loc = loc;
    this.error = error;
    this.next = next;
    this.info = info;
  }
}

export function debug(loc: Loc, msg: string, info?: any): never {
  throw new Step("DEBUG", loc, msg, undefined, info);
}

export const inspect: <T>(loc: Loc, reason: string, k: () => Promise<T>) => Promise<T> = (
  loc,
  reason,
  k,
) => {
  return k();
  //throw new Step("Inspect", loc, undefined, k, reason);
};

export function syntax_error(loc: Loc, reason?: string): never {
  throw new Step("SyntaxError", loc, reason ?? "syntax error");
}

export const in_isolation: <G extends { loc: Loc }, T>(
  loc: Loc,
  f: (loc: Loc) => Promise<G>,
  k: (loc: Loc, g: Omit<G, "loc">) => T,
) => Promise<T> = async (loc, f, k) => {
  return f(isolate(loc)).then(({ loc: res, ...g }) => k(unisolate(loc, res), g));
};
