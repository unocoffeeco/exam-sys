import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only (no emulator needed). Rules tests: see vitest.rules.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Vitest does not read the "@/*" alias from tsconfig.json
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
