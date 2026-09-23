import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import { fileURLToPath } from "node:url";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [deno(), react()],
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
