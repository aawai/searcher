import type { Plugin } from "vite";
import { rolldown } from "rolldown";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(
    new URL("./src/app/first-frame-boot.ts", import.meta.url),
);
const shared = fileURLToPath(new URL("../src/shared", import.meta.url));

/**
 * Inlines `first-frame-boot.ts` as a classic script at the end of `<head>`:
 * after the stylesheets (so the theme colour can be read from the tokens) and
 * before the first paint, which module scripts cannot guarantee.
 */
export function firstFramePlugin(): Plugin {
    return {
        name: "searcher-first-frame",
        transformIndexHtml: {
            // After Vite has injected the stylesheet links into <head>.
            order: "post",
            async handler() {
                const bundle = await rolldown({
                    input: entry,
                    resolve: { alias: { "@shared": shared } },
                    transform: { target: "es2022" },
                    // The shared modules only declare constants; keep what the
                    // boot path reads.
                    treeshake: { moduleSideEffects: false },
                });
                const result = await bundle.generate({
                    format: "iife",
                    minify: true,
                });
                await bundle.close();
                const chunk = result.output.find((item) =>
                    item.type === "chunk"
                );
                if (!chunk) throw new Error("First-frame script is missing");
                if (/<\/script/i.test(chunk.code)) {
                    throw new Error("First-frame script cannot be inlined");
                }
                return [{
                    tag: "script",
                    children: chunk.code.trim(),
                    injectTo: "head",
                }];
            },
        },
    };
}
