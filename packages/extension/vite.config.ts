/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    svelte(),
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
        "src/offscreen/index.html",
        "src/history/index.html",
      ],
    }),
  ],
  envDir: "../..",
  publicDir: "static",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
