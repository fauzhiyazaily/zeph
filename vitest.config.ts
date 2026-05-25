import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: ["tests/e2e/**", "tests/**/*.e2e.ts"],
    testTimeout: 20_000,
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared/ingestion": path.resolve(__dirname, "../shared/ingestion/index.js"),
    },
  },
});
