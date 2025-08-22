import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    preact(),
    {
      name: "copy-manifest",
      writeBundle() {
        copyFileSync("manifest.json", "dist/manifest.json");
      },
    },
    {
      name: "copy-icons",
      writeBundle() {
        copyFileSync("assets/icon-16.png", "dist/icon-16.png");
        copyFileSync("assets/icon-48.png", "dist/icon-48.png");
        copyFileSync("assets/icon-128.png", "dist/icon-128.png");
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        popup: "popup.html",
        content: "src/content.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    outDir: "dist",
  },
});
