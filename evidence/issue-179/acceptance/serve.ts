import { startProductionApp } from "../../web/e2e/helpers/production-app.ts";

const app = await startProductionApp();
console.log(`ISSUE179_ORIGIN=${app.origin}`);
let stop!: () => void;
const stopped = new Promise<void>((resolve) => stop = resolve);
Deno.addSignalListener("SIGINT", stop);
Deno.addSignalListener("SIGTERM", stop);
try {
    await stopped;
} finally {
    Deno.removeSignalListener("SIGINT", stop);
    Deno.removeSignalListener("SIGTERM", stop);
    await app.close();
}
