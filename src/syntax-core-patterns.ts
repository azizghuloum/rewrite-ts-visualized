import { assert } from "./assert";
import { AST } from "./AST";
import { CorePattern } from "./STX";

export const core_patterns = (parse: (code: string) => AST) => {
  const from = (code: string) => {
    const ast = parse(code);
    assert(ast.type === "list" && ast.tag === "program");
    const bodies = ast.content;
    assert(bodies !== null);
    assert(bodies[1] === null);
    return bodies[0];
  };
  const patterns: CorePattern[] = [
    { name: "splice", pattern: from("splice(() => {body});") },
  ];
  return patterns;
};
