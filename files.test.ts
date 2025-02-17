import { readdirSync } from "fs";
import { readFile } from "fs/promises";
import { expect, test, suite } from "vitest";
import { parse } from "./src/parse";
import { core_patterns } from "./src/syntax-core-patterns";
import { initial_step } from "./src/expander";
import { pprint } from "./src/pprint";
import { StxError, syntax_error } from "./src/stx-error";
import { preexpand_helpers } from "./src/preexpand-helpers";
import { get_globals, init_global_context } from "./src/global-module";

const test_dir = __dirname + "/tests";
const md_dir = __dirname + "/examples";

async function compile_script(filename: string, test_name: string) {
  const code = await readFile(filename, { encoding: "utf-8" });
  const patterns = core_patterns(parse);
  const globals = get_globals("es2024.full");
  const [global_unit, global_context] = init_global_context(patterns, globals);
  const helpers: preexpand_helpers = {
    manager: {
      resolve_import(loc) {
        syntax_error(loc, "import not supported in tests");
      },
      resolve_label(_label) {
        throw new Error("resolving labels is not supported in tests");
      },
      get_import_path(_cuid) {
        throw new Error(`imports are not supported in tests`);
      },
      resolve_rib(_rib_id, _cuid) {
        throw new Error(`imports are not supported in gui`);
      },
    },
    global_unit,
    global_context,
    inspect(_loc, _reason, k) {
      return k();
    },
  };
  const [_loc0, expand] = initial_step(parse(code, test_name), test_name, ["es2024.full"]);
  const result = await (async () => {
    try {
      const { loc } = await expand(helpers);
      return { name: "DONE", loc, error: undefined };
    } catch (err) {
      if (err instanceof StxError) {
        return err;
      } else {
        throw err;
      }
    }
  })();
  function ts(code: string): string {
    return "```typescript\n" + code + "```\n\n";
  }
  function qq(code: string): string {
    return "```\n" + code + "```\n\n";
  }
  function q(str: string): string {
    return "`" + str + "`";
  }
  const prog = await pprint(result.loc, { prettify: true });
  const out =
    `## ${q(test_name)}\n\n` +
    `### Status: ${q(result.name)}\n\n` +
    (result.error ? qq(`${result.error}\n`) : "") +
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
