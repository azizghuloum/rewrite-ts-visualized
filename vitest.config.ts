// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/.rts/*.test.rts.ts"],
    coverage: {
      provider: "v8", // or 'istanbul'
    },
  },
});
