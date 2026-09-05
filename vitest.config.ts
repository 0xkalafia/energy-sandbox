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
    // scripts/ had no tests at all until the geometry and spreadsheet helpers
    // got them, and they are the foundation of every boundary, area and
    // figure the app ships. They are .mjs because the build scripts run under
    // plain node, not through vite.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
