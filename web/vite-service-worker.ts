import type { Plugin } from "vite";
import { rolldown } from "rolldown";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { shellAssetPaths } from "./src/pwa/sw-policy.ts";
import { SERVICE_WORKER_PATH } from "../src/shared/pwa.ts";

const entry = fileURLToPath(new URL("./src/pwa/sw.ts", import.meta.url));

/**
 * Emits `/sw.js` for the shell HTML this build produced: the worker precaches
 * exactly the assets `index.html` references, and its version changes with
 * any output file name, so every deploy installs a new worker.
 */
export function serviceWorkerPlugin(): Plugin {
    return {
        name: "searcher-service-worker",
        apply: "build",
        // After vite:build-html has emitted index.html.
        enforce: "post",
        async generateBundle(_options, bundle) {
            const html = bundle["index.html"];
            if (html?.type !== "asset") {
                this.error("index.html is missing from the bundle");
            }
            const source = typeof html.source === "string"
                ? html.source
                : new TextDecoder().decode(html.source);
            const shellAssets = shellAssetPaths(source);
            for (const path of shellAssets) {
                if (!bundle[path.slice(1)]) {
                    this.error(`index.html references unbuilt ${path}`);
                }
            }
            const version = createHash("sha256")
                .update(source)
                .update(Object.keys(bundle).sort().join("\n"))
                .digest("base64url")
                .slice(0, 16);
            const worker = await rolldown({
                input: entry,
                transform: {
                    target: "es2022",
                    define: {
                        __SW_VERSION__: JSON.stringify(version),
                        __SW_SHELL_ASSETS__: JSON.stringify(shellAssets),
                    },
                },
            });
            const result = await worker.generate({
                format: "iife",
                minify: true,
            });
            await worker.close();
            const chunk = result.output.find((item) => item.type === "chunk");
            if (!chunk) this.error("Service Worker bundle is missing");
            this.emitFile({
                type: "asset",
                fileName: SERVICE_WORKER_PATH.slice(1),
                source: chunk.code,
            });
        },
    };
}
