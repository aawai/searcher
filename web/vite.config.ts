import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { serviceWorkerPlugin } from "./vite-service-worker.ts";

function bundleReportPlugin(): Plugin {
    const rootPath = fileURLToPath(new URL("..", import.meta.url)).replace(
        /\/$/,
        "",
    );
    return {
        name: "bundle-report",
        generateBundle(_options, bundle) {
            const report: Record<string, {
                file: string;
                name?: string;
                isEntry?: boolean;
                isDynamicEntry?: boolean;
                imports?: string[];
                dynamicImports?: string[];
                renderedLength: number;
                modules: Array<{
                    id: string;
                    renderedLength: number;
                }>;
            }> = {};

            for (const [_fileName, chunk] of Object.entries(bundle)) {
                if (chunk.type === "chunk") {
                    report[chunk.fileName] = {
                        file: chunk.fileName,
                        name: chunk.name,
                        isEntry: chunk.isEntry,
                        isDynamicEntry: chunk.isDynamicEntry,
                        imports: chunk.imports,
                        dynamicImports: chunk.dynamicImports,
                        renderedLength: chunk.code
                            ? Buffer.byteLength(chunk.code)
                            : 0,
                        modules: Object.entries(chunk.modules).map((
                            [id, mod],
                        ) => ({
                            id: id
                                .replaceAll(`file://${rootPath}/`, "")
                                .replaceAll(`file://${rootPath}`, "")
                                .replaceAll(`${rootPath}/`, "")
                                .replaceAll(rootPath, ""),
                            renderedLength: mod.renderedLength,
                        })),
                    };
                }
            }
            this.emitFile({
                type: "asset",
                fileName: "bundle-report.json",
                source: JSON.stringify(report, null, 2),
            });
        },
    };
}

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
    plugins: [
        deno(),
        react(),
        tailwindcss(),
        bundleReportPlugin(),
        serviceWorkerPlugin(),
    ],
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
                        pkg.startsWith("@milkdown/") ||
                        pkg.startsWith("prosemirror-") ||
                        pkg === "remark-stringify" ||
                        pkg === "orderedmap" ||
                        pkg === "w3c-keyname" ||
                        pkg === "rope-sequence"
                    ) {
                        return "editor-vendor";
                    }
                    if (
                        pkg === "react-markdown" ||
                        pkg === "remark-rehype" ||
                        pkg === "remark-breaks" ||
                        pkg.startsWith("rehype-") ||
                        pkg.startsWith("hast-") ||
                        pkg === "mdast-util-to-hast" ||
                        pkg === "property-information" ||
                        pkg === "html-url-attributes" ||
                        pkg === "comma-separated-tokens" ||
                        pkg === "space-separated-tokens"
                    ) {
                        return "markdown-renderer-vendor";
                    }
                    if (
                        pkg.startsWith("remark-") ||
                        pkg.startsWith("micromark") ||
                        pkg.startsWith("mdast-") ||
                        pkg.startsWith("unist-") ||
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
                        pkg === "character-entities"
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
