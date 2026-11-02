// E4b: providers that repeat tool_call id/name in every delta chunk (seen in some OpenAI-compatible proxies) vs client.ts `+=` accumulation.
import { streamOpenAIChat } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/client.ts";
import { saveRaw } from "./lib.ts";
const d = (tc: any) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [tc] } }] })}\n\n`;
const body = d({ index: 0, id: "call_1", function: { name: "lookup_apps", arguments: "{\"query\"" } }) +
    d({ index: 0, id: "call_1", function: { name: "lookup_apps", arguments: ":\"x\"}" } }) + "data: [DONE]\n\n";
const f = (() => Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
const evs: any[] = [];
for await (const e of streamOpenAIChat("https://api.example.com/v1", "k", { model: "m", messages: [{ role: "user", content: "x" }] }, f)) evs.push(e);
console.log(JSON.stringify(evs));
await saveRaw("e4b_toolcall_repeat_id", { note: "synthetic SSE where id+name repeat on every chunk", events: evs });
