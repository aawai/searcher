// Build the experiment harness against the REAL sources in /home/aawei/searcher/web/src (read-only).
import { defineConfig } from "/home/aawei/searcher/node_modules/vite/dist/node/index.js";
import tailwindcss from "/home/aawei/searcher/node_modules/@tailwindcss/vite/dist/index.mjs";
const REPO = "/home/aawei/searcher";
export default defineConfig({
  root: "/home/aawei/experiments/editor-study/harness",
  resolve: { alias: { "@shared": `${REPO}/src/shared`, "@": `${REPO}/web/src` } },
  plugins: [tailwindcss()],
  server: { fs: { strict: false } },
  build: { outDir: "/home/aawei/experiments/editor-study/dist", emptyOutDir: true, minify: true, target: "es2022" },
});
