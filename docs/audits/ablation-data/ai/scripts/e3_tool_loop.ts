// E3: tool-loop semantics at HEAD via real AiService.streamChat + mock provider. Each scenario records upstream request count,
// whether `tools` was sent each round, event sequence, and persisted status/content.
import { DocumentsService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/documents/service.ts";
import { chat, makeAi, sseText, sseTool } from "./ailib.ts";
import { saveRaw } from "./lib.ts";

const T = { documents: true, apps: true, webSearch: false };
const out: any = {};
async function scenario(name: string, responder: (i: number, req: any) => string, req: any = {}, seed?: (env: any) => Promise<void>) {
    const env = await makeAi(`e3-${name}`, (r, i) => responder(i, r.body));
    if (seed) await seed(env);
    const r = await chat(env.service, { providerId: env.provider.id, modelId: "m1", message: "q", tools: T, ...req });
    const metaConv = r.events.find((e) => e.event === "meta")!.data.conversationId;
    const conv = await env.service.getConversation("u1", metaConv);
    const last = conv.messages[conv.messages.length - 1];
    out[name] = {
        upstreamCalls: env.calls.length,
        toolsSentPerCall: env.calls.map((c) => Array.isArray(c.body.tools) ? c.body.tools.map((t: any) => t.function.name) : null),
        events: r.events.map((e) => e.event === "tool-result" ? { event: e.event, toolName: e.data.toolName, error: e.data.error ?? null, resultPreview: JSON.stringify(e.data.result)?.slice(0, 120) } : e.event === "tool-call" ? { event: e.event, toolName: e.data.toolName, args: e.data.args } : { event: e.event, data: e.event === "token" ? e.data : undefined }),
        persisted: { status: last.status, content: last.content },
        lastUpstreamMessageRoles: env.calls[env.calls.length - 1].body.messages.map((m: any) => m.role),
    };
    console.log(name, JSON.stringify(out[name]).slice(0, 500));
    await env.cleanup();
}

// S1: model always calls a tool, never text -> 3 tool rounds then forced no-tools turn (which returns text)
await scenario("S1_always_tool_then_forced_final", (i, b) => b.tools ? sseTool(`c${i}`, "lookup_apps", "{}") : sseText("forced final"));
// S2: same, but forced final turn is also useless (empty) -> failed fixed message
await scenario("S2_always_tool_forced_final_empty", (i, b) => b.tools ? sseTool(`c${i}`, "lookup_apps", "{}") : "data: [DONE]\n\n");
// S3: model emits preamble text AND a tool call every round -> content non-empty, no forced final?
await scenario("S3_preamble_plus_tool_each_round", (i, b) => b.tools ? sseTool(`c${i}`, "lookup_apps", "{}", `Let me check ${i}. `) : sseText("forced final"));
// S4: unknown tool name
await scenario("S4_unknown_tool_name", (i) => i === 0 ? sseTool("c0", "delete_everything", "{}") : sseText("ok"));
// S5: tool not enabled by user but model calls it anyway (webSearch disabled)
await scenario("S5_disabled_tool_called", (i) => i === 0 ? sseTool("c0", "web_search", JSON.stringify({ query: "x" })) : sseText("ok"));
// S6: malformed JSON args
await scenario("S6_malformed_args", (i) => i === 0 ? sseTool("c0", "lookup_documents", "{not json") : sseText("ok"));
// S7: documents tool with model-generated natural language query (AND semantics) vs fact present
await scenario("S7_nl_query_documents", (i) => i === 0 ? sseTool("c0", "lookup_documents", JSON.stringify({ query: "what did I write about zebraword yesterday" })) : sseText("ok"), {}, async (env) => {
    const d = new DocumentsService(env.store);
    await d.create("u1", { title: "zebra notes", body: "zebraword is my project codename" });
});
// S8: tool-capable model flag off -> tools not sent
await scenario("S8_supportsTools_false", (i, b) => sseText("plain"), {}, async (env) => {
    await env.store.nativeTransaction((n: any) => { n.prepare("UPDATE ai_models SET supports_tools = 0").run(); });
});
// S9: two parallel tool calls in one round
{
    const env = await makeAi("e3-S9", (r, i) => {
        if (i === 0) {
            const mk = (idx: number, id: string, name: string) => ({ index: idx, id, function: { name, arguments: "{}" } });
            return `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [mk(0, "a", "lookup_apps"), mk(1, "b", "lookup_documents")] } }] })}\n\n` + "data: [DONE]\n\n";
        }
        return sseText("ok");
    });
    const r = await chat(env.service, { providerId: env.provider.id, modelId: "m1", message: "q", tools: T });
    const second = env.calls[1].body.messages;
    out.S9_parallel_calls = { upstreamCalls: env.calls.length, round2Roles: second.map((m: any) => m.role), toolCallIdsInAssistant: second.find((m: any) => m.tool_calls)?.tool_calls.map((t: any) => t.id), toolMsgIds: second.filter((m: any) => m.role === "tool").map((m: any) => m.tool_call_id) };
    console.log("S9", JSON.stringify(out.S9_parallel_calls));
    await env.cleanup();
}
await saveRaw("e3_tool_loop", out);
