import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: ["./src/db/schema.ts", "./src/db/ai-schema.ts"],
    out: "./drizzle",
    dbCredentials: {
        url: Deno.env.get("DATABASE_PATH") ?? "./data/searcher.sqlite",
    },
});
