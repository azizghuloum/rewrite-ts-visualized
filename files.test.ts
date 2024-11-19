import { readdirSync } from "fs";
import { readFile } from "fs/promises";
import { expect, test, suite } from "vitest";
import { load_parser, parse_with } from "./src/parser-loader";
import treesitter_wasm_url from "web-tree-sitter/tree-sitter.wasm?url";
import tsx_url from "./src/assets/tree-sitter-tsx.wasm?url";
import { core_patterns } from "./src/syntax-core-patterns";
import { initial_step, next_step } from "./src/expander";
import Parser from "web-tree-sitter";

const test_dir = __dirname + "/tests";

const cleanup_url: (url: string) => string = (url) => url.replace(/^\/@fs/, "");

async function compile_script(filename: string, parser: Parser) {
  const code = await readFile(filename, { encoding: "utf-8" });
  const parse = (code: string) => parse_with(parser, code);
  const patterns = core_patterns(parse);
  let step = initial_step(parse(code), patterns);
  while (true) {
    switch (step.type) {
      case "DONE":
      case "SyntaxError":
        return step;
      case "ExpandProgram":
      case "Inspect":
        step = next_step(step);
        continue;
      case "DEBUG":
        console.error(step);
        throw new Error("crashed");
      default:
        const invalid: never = step;
        throw invalid;
    }
  }
}

suite("files in tests dir", async () => {
  const test_files = readdirSync(test_dir).filter((x) => x.match(/\.ts$/));
  const parser = await load_parser({
    parser_url: cleanup_url(treesitter_wasm_url),
    lang_url: cleanup_url(tsx_url),
  });
  test_files.forEach((x) =>
    test(`expanding file ${x}`, async () => {
      const test_file = `${test_dir}/${x}`;
      await expect(await compile_script(test_file, parser)).toMatchFileSnapshot(
        `${test_file}.expanded`
      );
    })
  );
});
