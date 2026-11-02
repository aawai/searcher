import { AiService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/service.ts";
import { addUser, makeStore } from "./lib.ts";

export const KEY = "12345678901234567890123456789012";

export const sseText = (...parts: string[]) =>
    parts.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n";
export const sseDone = (usage?: { p: number; c: number }) =>
    (usage ? `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: usage.p, completion_tokens: usage.c } })}\n\n` : "") + "data: [DONE]\n\n";
export const sseTool = (id: string, name: string, args: string, pre = "") =>
    (pre ? `data: ${JSON.stringify({ choices: [{ delta: { content: pre } }] })}\n\n` : "") +
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: args } }] } }] })}\n\n` + "data: [DONE]\n\n";
const sse = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });

export interface Upstream { url: string; body: any; bytes: number }
export type Responder = (req: Upstream, callIndex: number) => string | Response;

export async function makeAi(tag: string, responder: Responder) {
    const env = await makeStore(tag);
    await addUser(env.store, "u1");
    const calls: Upstream[] = [];
    const fetchFn: typeof fetch = (input, init) => {
        const url = String(input);
        if (url.endsWith("/models")) return Promise.resolve(Response.json({ data: [{ id: "m1" }] }));
        const raw = String(init?.body ?? "");
        const req = { url, body: JSON.parse(raw), bytes: new TextEncoder().encode(raw).length };
        calls.push(req);
        const r = responder(req, calls.length - 1);
        return Promise.resolve(typeof r === "string" ? sse(r) : r);
    };
    const service = new AiService({ store: env.store, encryptionKey: KEY, fetchFn });
    const provider = await service.createProvider("u1", { name: "p", baseUrl: "https://api.example.com/v1", apiKey: "sk-test-1234567890", scope: "user" }, false);
    await env.store.nativeTransaction((n) => { n.prepare("UPDATE ai_models SET supports_tools = 1").run(); });
    return { ...env, service, provider, calls };
}

export async function chat(service: AiService, req: any) {
    const events: Array<{ event: string; data: any }> = [];
    let ttfbMs = -1; const t0 = performance.now();
    for await (const ev of service.streamChat("u1", req)) {
        if (ttfbMs < 0 && ev.event === "token") ttfbMs = performance.now() - t0;
        events.push(ev as any);
    }
    return { events, totalMs: performance.now() - t0, ttfbMs };
}
