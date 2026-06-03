import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vite.config.ts so the build config stays untouched.
// Engine modules are pure (no DOM), so the node environment is enough.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
