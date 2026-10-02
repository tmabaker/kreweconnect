import { defineConfig } from "vitest/config";

// Frontend unit tests only. The Functions API under api/ keeps its own node:test
// suite (run from api/ with `npm test`), which vitest must not pick up.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
