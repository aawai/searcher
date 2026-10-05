import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "assistant-cloud/ai-sdk": fileURLToPath(
                new URL(
                    "../node_modules/.deno/assistant-cloud@0.2.3/node_modules/assistant-cloud/dist/ai-sdk/index.js",
                    import.meta.url,
                ),
            ),
            "assistant-cloud": fileURLToPath(
                new URL(
                    "../node_modules/.deno/assistant-cloud@0.2.3/node_modules/assistant-cloud/dist/index.js",
                    import.meta.url,
                ),
            ),
        },
    },
    plugins: [deno(), react(), tailwindcss()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        manifest: "manifest.json",
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes("/node_modules/")) return;
                    const m = id.match(/\/node_modules\/(?:\.deno\/)?([^\/]+)/);
                    if (!m) return;
                    let pkg = m[1];
                    if (pkg.startsWith("@") && pkg.includes("+")) {
                        pkg = pkg.replace("+", "/");
                    }
                    const atIdx = pkg.indexOf("@", 1);
                    if (atIdx !== -1) {
                        pkg = pkg.slice(0, atIdx);
                    }

                    if (
                        pkg === "react" ||
                        pkg === "react-dom" ||
                        pkg === "react-router" ||
                        pkg === "react-router-dom"
                    ) {
                        return "react-vendor";
                    }
                    if (
                        pkg.startsWith("@assistant-ui/") ||
                        pkg === "assistant-stream" ||
                        pkg === "assistant-cloud"
                    ) {
                        return "assistant-vendor";
                    }
                    if (
                        pkg === "react-markdown" ||
                        pkg.startsWith("remark-") ||
                        pkg.startsWith("rehype-") ||
                        pkg.startsWith("micromark") ||
                        pkg.startsWith("mdast-") ||
                        pkg.startsWith("unist-") ||
                        pkg.startsWith("hast-") ||
                        pkg.startsWith("vfile") ||
                        pkg === "devlop" ||
                        pkg === "trim-lines" ||
                        pkg === "trough" ||
                        pkg === "unified" ||
                        pkg === "bail" ||
                        pkg === "is-plain-obj" ||
                        pkg === "extend" ||
                        pkg === "ccount" ||
                        pkg === "escape-string-regexp" ||
                        pkg === "markdown-table" ||
                        pkg === "longest-streak" ||
                        pkg === "zwitch" ||
                        pkg === "decode-named-character-reference" ||
                        pkg === "character-entities" ||
                        pkg === "comma-separated-tokens" ||
                        pkg === "space-separated-tokens" ||
                        pkg === "property-information" ||
                        pkg === "html-url-attributes"
                    ) {
                        return "markdown-vendor";
                    }
                    if (
                        pkg === "@base-ui/react" ||
                        pkg.startsWith("@dnd-kit/") ||
                        pkg === "lucide-react"
                    ) {
                        return "ui-vendor";
                    }
                },
            },
        },
    },
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": { target: "http://127.0.0.1:34567", changeOrigin: false },
        },
    },
});
