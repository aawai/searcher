// E4: provider transport/control at HEAD: streamOpenAIChat microbench on mock fetch (no network), edge cases,
// param-mapping matrix (buildProviderGenerationParams), normalizeBaseUrl matrix.
import { normalizeBaseUrl, streamOpenAIChat } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/client.ts";
import { buildProviderGenerationParams, ReasoningValidationError } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/reasoning.ts";
import { inferReasoningCapabilityFromName, isStrictReasoningModel } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/model-capabilities.ts";
import { saveRaw, summarize } from "./lib.ts";

const out: any = {};
const mk = (body: string, status = 200) => ((() => Promise.resolve(new Response(body, { status, headers: { "Content-Type": "text/event-stream" } }))) as typeof fetch);
const delta = (d: any, extra: any = {}) => `data: ${JSON.stringify({ choices: [{ delta: d, ...extra }] })}\n\n`;
const req = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };

async function drain(fetchFn: typeof fetch, signal?: AbortSignal) {
    const evs: any[] = [];
    for await (const e of streamOpenAIChat("https://api.example.com/v1", "k", req, fetchFn, signal)) evs.push(e);
    return evs;
}

// 1) throughput: N tokens in one SSE body
{
    const rows: any[] = [];
    for (const n of [100, 1000, 10000, 50000]) {
        const body = Array.from({ length: n }, () => delta({ content: "tok " })).join("") + "data: [DONE]\n\n";
        const ts: number[] = [];
        for (let k = 0; k < 7; k++) { const t = performance.now(); const e = await drain(mk(body)); ts.push(performance.now() - t); if (e.length !== n + 1) throw new Error("count " + e.length); }
        rows.push({ tokens: n, bytes: body.length, ms: ts, tokensPerSec_median: n / (summarize(ts).p50 / 1000) });
    }
    out.throughput = rows;
}
// 2) fixed per-call overhead (client construction + 1 token)
{
    const body = delta({ content: "x" }) + "data: [DONE]\n\n";
    const ts: number[] = [];
    for (let k = 0; k < 500; k++) { const t = performance.now(); await drain(mk(body)); ts.push(performance.now() - t); }
    out.perCallOverheadMs = { first: ts[0], ...summarize(ts.slice(20)) };
}
// 3) edge cases
{
    const c: any = {};
    c.reasoning_content_delta = await drain(mk(delta({ reasoning_content: "thinking..." }) + delta({ content: "ans" }) + "data: [DONE]\n\n"));
    c.finish_reason_length = await drain(mk(delta({ content: "partial" }, { finish_reason: "length" }) + "data: [DONE]\n\n"));
    c.usage_chunk = await drain(mk(delta({ content: "a" }) + `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\n` + "data: [DONE]\n\n"));
    c.http_429 = await drain(mk(JSON.stringify({ error: { message: "rate limited" } }), 429));
    c.http_500 = await drain(mk("oops", 500));
    c.malformed_sse_json = await drain(mk(delta({ content: "a" }) + "data: {broken\n\n"));
    c.truncated_stream_no_done = await drain(mk(delta({ content: "a" })));
    c.interleaved_text_and_tool = await drain(mk(delta({ content: "pre" }) + delta({ tool_calls: [{ index: 0, id: "c1", function: { name: "lookup_apps", arguments: "{\"q" } }] }) + delta({ tool_calls: [{ index: 0, function: { arguments: "uery\":\"x\"}" } }] }) + "data: [DONE]\n\n"));
    c.tool_call_id_split_across_chunks = await drain(mk(delta({ tool_calls: [{ index: 0, id: "ab", function: { name: "lookup", arguments: "{}" } }] }) + delta({ tool_calls: [{ index: 0, id: "cd", function: { name: "_apps" } }] }) + "data: [DONE]\n\n"));
    // abort mid-stream: latency from abort() to terminal event
    const ac = new AbortController();
    const slow = (() => { const enc = new TextEncoder(); let i = 0; return Promise.resolve(new Response(new ReadableStream({ async pull(ctl) { await new Promise((r) => setTimeout(r, 5)); if (ac.signal.aborted) return ctl.error(new DOMException("aborted", "AbortError")); ctl.enqueue(enc.encode(delta({ content: "t" }))); if (++i > 10000) ctl.close(); } }), { status: 200 })); }) as typeof fetch;
    const evs: any[] = []; let tAbort = 0, tEnd = 0;
    for await (const e of streamOpenAIChat("https://api.example.com/v1", "k", req, slow, ac.signal)) { evs.push(e); if (evs.length === 5) { tAbort = performance.now(); ac.abort(); } tEnd = performance.now(); }
    c.abort_midstream = { events: evs.length, last: evs[evs.length - 1], abortToTerminalMs: tEnd - tAbort };
    // retries: count upstream attempts on 429/500 (docs claim maxRetries 0)
    let attempts = 0; const counting = (() => { attempts++; return Promise.resolve(new Response("x", { status: 429 })); }) as typeof fetch;
    await drain(counting); c.attempts_on_429 = attempts;
    for (const k of Object.keys(c)) if (Array.isArray(c[k])) c[k] = c[k].map((e: any) => ({ ...e, error: e.error?.slice(0, 120) }));
    out.edgeCases = c;
}
// 4) base URL matrix
{
    const cases = ["https://api.openai.com/v1", "http://localhost:11434/v1", "http://127.0.0.1:8080/v1/", "http://10.0.0.5/v1", "http://192.168.1.2/v1", "https://api.example.com/v1?x=1", "https://u:p@api.example.com/v1", "https://llm.internal/v1", "http://api.example.com/v1", "https://[::1]/v1", "http://100.78.0.1/v1", "https://api.example.com//v1//"];
    out.normalizeBaseUrl = cases.map((u) => { try { return { u, ok: normalizeBaseUrl(u) }; } catch (e) { return { u, err: String((e as Error).message).slice(0, 60) }; } });
}
// 5) generation param matrix
{
    const rows: any[] = [];
    const caps: Record<string, any> = {
        supported_low_high: { status: "supported", levels: ["low", "medium", "high"], defaultLevel: "medium", source: "provider" },
        supported_with_none_auto: { status: "supported", levels: ["none", "auto", "low", "high"], source: "manual" },
        unsupported: { status: "unsupported", levels: [], source: "provider" },
        unknown: { status: "unknown", levels: [], source: "unknown" },
    };
    const transports: Record<string, any> = {
        openai: { type: "openai_reasoning_effort" }, boolean: { type: "boolean", parameter: "thinking" },
        custom: { type: "custom", parameter: "thinking_budget", valueMap: { low: 1024, high: 8192 } }, unsupported: { type: "unsupported" },
    };
    for (const [cn, cap] of Object.entries(caps)) for (const [tn, tr] of Object.entries(transports)) for (const eff of [undefined, "none", "auto", "low", "high", "max"]) {
        for (const extra of [{}, { temperature: 0.5 }]) {
            const key = { cap: cn, transport: tn, effort: eff ?? null, extra };
            try { rows.push({ ...key, params: buildProviderGenerationParams({ reasoningEffort: eff as any, ...extra }, cap, tr) }); }
            catch (e) { rows.push({ ...key, error: e instanceof ReasoningValidationError ? "ReasoningValidationError: " + e.message : String(e) }); }
        }
    }
    out.paramMatrix = rows;
    out.strictModelDetect = ["o1", "o3-mini", "o3-pro", "o4-mini", "gpt-5", "deepseek-reasoner", "qwen3-thinking", "o1-2024-12-17"].map((m) => ({ m, strict: isStrictReasoningModel(m), inferred: inferReasoningCapabilityFromName(m)?.levels ?? null }));
    out.paramMatrix_summary = { total: rows.length, errors: rows.filter((r) => r.error).length };
}
await saveRaw("e4_provider", out);
console.log(JSON.stringify(out.throughput.map((r: any) => [r.tokens, Math.round(r.tokensPerSec_median)])), JSON.stringify(out.perCallOverheadMs));
console.log(JSON.stringify(out.edgeCases, null, 0).slice(0, 2500));
console.log(JSON.stringify(out.normalizeBaseUrl)); console.log(JSON.stringify(out.paramMatrix_summary), JSON.stringify(out.strictModelDetect));
