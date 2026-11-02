// E2: context growth with real AiService.streamChat (HEAD) against an in-process mock provider.
//  (a) history growth over turns: upstream request bytes + server prep latency; (b) tool-result size for lookup_documents
//  with various body sizes (full body returned, no cap); (c) whether prior tool results are replayed on the next turn.
import { DocumentsService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/documents/service.ts";
import { chat, makeAi, sseText, sseTool } from "./ailib.ts";
import { saveRaw, summarize } from "./lib.ts";

const result: any = {};

// (a) history growth: 60 turns, each user message 400 chars, reply 800 chars.
{
    const reply = "a".repeat(800);
    const env = await makeAi("e2a", () => sseText(reply));
    let convId: string | undefined;
    const rows: any[] = [];
    for (let t = 1; t <= 60; t++) {
        const { events, totalMs, ttfbMs } = await chat(env.service, {
            conversationId: convId, providerId: env.provider.id, modelId: "m1", message: `q${t} ` + "b".repeat(396),
        });
        convId ??= events.find((e) => e.event === "meta")!.data.conversationId;
        const up = env.calls[env.calls.length - 1];
        rows.push({ turn: t, upstreamBytes: up.bytes, upstreamMessages: up.body.messages.length, totalMs, ttfbMs });
    }
    result.historyGrowth = rows;
    await env.cleanup();
}

// (a2) prep latency vs total messages stored (single conversation with N prior turns inserted directly); linear-chain.
{
    const rows: any[] = [];
    for (const turns of [10, 100, 500, 2000]) {
        const env = await makeAi(`e2a2-${turns}`, () => sseText("ok"));
        const first = await chat(env.service, { providerId: env.provider.id, modelId: "m1", message: "seed" });
        const convId = first.events.find((e) => e.event === "meta")!.data.conversationId;
        // bulk insert a linear chain of `turns` user/assistant pairs (small bodies) under the conversation
        await env.store.nativeTransaction((n) => {
            const last = n.prepare("SELECT active_leaf_message_id AS a FROM ai_conversations WHERE id=?").get(convId) as any;
            let parent = last.a as string;
            const ins = n.prepare("INSERT INTO ai_messages (id, conversation_id, parent_message_id, role, content, status, created_at) VALUES (?,?,?,?,?,'complete',?)");
            for (let i = 0; i < turns; i++) {
                const u = crypto.randomUUID(), a = crypto.randomUUID();
                ins.run(u, convId, parent, "user", "u".repeat(200), 10 + i * 2);
                ins.run(a, convId, u, "assistant", "a".repeat(400), 11 + i * 2);
                parent = a;
            }
            n.prepare("UPDATE ai_conversations SET active_leaf_message_id=? WHERE id=?").run(parent, convId);
        });
        const lat: number[] = [], ttfb: number[] = [];
        let bytes = 0, msgs = 0;
        for (let k = 0; k < 5; k++) {
            const r = await chat(env.service, { conversationId: convId, providerId: env.provider.id, modelId: "m1", message: "next" });
            lat.push(r.totalMs); ttfb.push(r.ttfbMs);
            const up = env.calls[env.calls.length - 1]; bytes = up.bytes; msgs = up.body.messages.length;
        }
        rows.push({ priorTurns: turns, storedMessages: turns * 2 + 2, upstreamBytes: bytes, upstreamMessages: msgs, ttfbMs: ttfb, totalMs: lat });
        await env.cleanup();
    }
    result.prepLatencyVsHistory = rows;
}

// (b)+(c) tool result size and replay
{
    const rows: any[] = [];
    for (const bodyChars of [2_000, 20_000, 200_000, 1_000_000]) {
        let step = 0;
        const env = await makeAi(`e2b-${bodyChars}`, (_req, i) => step++ === 0 ? sseTool("c1", "lookup_documents", JSON.stringify({ query: "zebraword" }), "") : sseText("final answer"));
        const docs = new DocumentsService(env.store);
        for (let d = 0; d < 5; d++) await docs.create("u1", { title: `doc ${d}`, body: ("zebraword " + "lorem ipsum dolor sit amet ".repeat(Math.ceil(bodyChars / 27))).slice(0, bodyChars) });
        const r = await chat(env.service, { providerId: env.provider.id, modelId: "m1", message: "find zebraword", tools: { documents: true, apps: false, webSearch: false } });
        const round2 = env.calls[1];
        const toolMsg = round2.body.messages.find((m: any) => m.role === "tool");
        const uiResult = r.events.find((e) => e.event === "tool-result")!.data.result;
        const convId = r.events.find((e) => e.event === "meta")!.data.conversationId;
        // follow-up turn: is the tool result replayed?
        const calls0 = env.calls.length;
        await chat(env.service, { conversationId: convId, providerId: env.provider.id, modelId: "m1", message: "thanks", tools: { documents: true, apps: false, webSearch: false } });
        const follow = env.calls[calls0];
        rows.push({
            bodyChars, docsReturned: uiResult.length, toolMessageChars: toolMsg.content.length,
            round2UpstreamBytes: round2.bytes, followUpUpstreamBytes: follow.bytes,
            followUpHasToolRole: follow.body.messages.some((m: any) => m.role === "tool"),
            followUpRoles: follow.body.messages.map((m: any) => m.role),
            sseToolResultEventChars: JSON.stringify(uiResult).length,
        });
        await env.cleanup();
    }
    result.toolResultSize = rows;
}
for (const k of Object.keys(result)) console.log(k, JSON.stringify(result[k]).slice(0, 600));
await saveRaw("e2_context", result);
