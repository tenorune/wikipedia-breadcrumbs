/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["dexie"],
    },
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
