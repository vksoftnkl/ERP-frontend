import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the framework-agnostic modules only (`domain/**`, and the pure
 * payload/validation helpers under `features/**`). Nothing here renders React,
 * so no jsdom environment and no setup file are needed.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["domain/**/*.test.ts", "features/**/*.test.ts"],
    reporters: ["default"],
  },
});
