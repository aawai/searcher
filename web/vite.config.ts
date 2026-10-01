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
    build: { outDir: "dist", emptyOutDir: true },
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": { target: "http://127.0.0.1:34567", changeOrigin: false },
        },
    },
});
