import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "repo/plugins/tests/*_test.{js,ts}"
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
