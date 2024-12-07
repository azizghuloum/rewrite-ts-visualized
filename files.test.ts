import { readdirSync } from "fs";
import { readFile } from "fs/promises";
import { expect, test, suite } from "vitest";
import { parse } from "./src/parse";
import { core_patterns } from "./src/syntax-core-patterns";
import { initial_step } from "./src/expander";
import { pprint } from "./src/pprint";

const test_dir = __dirname + "/tests";
const md_dir = __dirname + "/examples";

async function compile_script(filename: string, test_name: string) {
  const code = await readFile(filename, { encoding: "utf-8" });
  const patterns = core_patterns(parse);
  const [init_step, expand] = initial_step(parse(code), test_name, patterns);
  const step = await expand((loc, reason, k) => k());
  function ts(code: string): string {
    return "```typescript\n" + code + "```\n\n";
  }
  function qq(code: string): string {
    return "```\n" + code + "```\n\n";
  }
  function q(str: string): string {
    return "`" + str + "`";
  }
  const prog = await pprint(step.loc);
  const out =
    `## ${q(test_name)}\n\n` +
    `### Status: ${q(step.name)}\n\n` +
    (step.error ? qq(`${step.error}\n`) : "") +
    `### Input Program\n\n` +
    ts(code) +
    `### Output Program\n\n` +
    ts(prog) +
    "";
  return out;
}

suite("files in tests dir", async () => {
  const test_files = readdirSync(test_dir).filter((x) => x.match(/\.ts$/));
  test_files.forEach((x) =>
    test(`expanding file ${x}`, async () => {
      const test_path = `${test_dir}/${x}`;
      await expect(await compile_script(test_path, x)).toMatchFileSnapshot(`${md_dir}/${x}.md`);
    }),
  );
});
