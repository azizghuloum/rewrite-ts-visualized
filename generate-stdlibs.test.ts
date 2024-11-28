import { expect, suite, test } from "vitest";
import { generate_libs_file } from "./src/generate-stdlibs";

suite("generating libs file", () => {
  test("generating libs file", async () => {
    await expect(await generate_libs_file("es2024.full")).toMatchFileSnapshot(
      "./src/generated-stdlibs.ts",
    );
  });
});
