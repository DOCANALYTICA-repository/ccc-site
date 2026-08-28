import { defineConfig } from "vitest/config";
import path from "node:path";

// Kept out of vite.config.ts on purpose: vitest resolves its own nested copy of
// Vite, so sharing one defineConfig call makes the plugin types conflict.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // jsdom for component tests, globals so Testing Library's automatic
    // between-test cleanup hook registers.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
