import { assert } from "./assert";
import { AST } from "./AST";

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
