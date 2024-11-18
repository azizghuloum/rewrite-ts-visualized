import { assert } from "./assert";
import { AST } from "./AST";
import { Loc, STX } from "./syntax-structures";

type handler = <T>(loc: Loc, pattern: STX, k: (loc: Loc) => T) => T;

const splice: handler = (loc, pattern, k) => {
  throw new Error("handling splice");
};

export const core_handlers: { [k: string]: handler } = {
  splice,
};

export const core_patterns = (parse: (code: string) => AST) => {
  const pattern = (code: string) => {
    const ast = parse(code);
    assert(ast.type === "list" && ast.tag === "program");
    const bodies = ast.content;
    assert(bodies !== null);
    assert(bodies[1] === null);
    return bodies[0];
  };
  return {
    splice: pattern("splice(() => {body});"),
  };
};
