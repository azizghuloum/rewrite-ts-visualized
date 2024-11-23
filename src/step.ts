import { Loc } from "./syntax-structures";
import { isolate, unisolate } from "./zipper";

export class Step {
  name: string;
  loc: Loc;
  next?: () => never;
  error?: string | undefined;
  info?: any;
  constructor(name: string, loc: Loc, error?: string, next?: () => never, info?: any) {
    this.name = name;
    this.loc = loc;
    this.error = error;
    this.next = next;
    this.info = info;
  }
}

export const DONE = (loc: Loc) => {
  throw new Step("DONE", loc);
};

export function debug(loc: Loc, msg: string, info?: any): never {
  throw new Step("DEBUG", loc, msg, undefined, info);
}

export const inspect: (loc: Loc, reason: string, k: () => never) => never = (loc, reason, k) => {
  throw new Step("Inspect", loc, undefined, k, reason);
};

export function syntax_error(loc: Loc, reason?: string): never {
  throw new Step("SyntaxError", loc, reason ?? "syntax error");
}

export const in_isolation: <G>(
  loc: Loc,
  f: (loc: Loc, k: (loc: Loc, g: G) => never) => never,
  k: (loc: Loc, g: G) => never,
) => never = (loc, f, k) => {
  return f(isolate(loc), (res, g) => {
    return k(unisolate(loc, res), g);
  });
};
