import { assertEquals } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import {
    AuthService,
    SESSION_COOKIE_NAME,
} from "../../features/auth/service.ts";
import { createApp } from "../../app.ts";

const ORIGIN = "http://localhost:8000";

async function setupTestContext() {
    const tempDir = await Deno.makeTempDir({ prefix: "body_policy_test_" });
    await Deno.writeTextFile(
        `${tempDir}/index.html`,
        "<!doctype html><html><body>ok</body></html>",
    );

    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin: ORIGIN });

    const app = createApp({ store, auth, origin: ORIGIN }, {
        frontendPath: tempDir,
    });

    // Register a test user and obtain auth session cookie
    const registerRes = await app.request(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: {
            origin: ORIGIN,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            username: "tester",
            displayName: "Tester",
            password: "Password123456!",
        }),
    });
    assertEquals(registerRes.status, 200);
    const setCookie = registerRes.headers.get("set-cookie") ?? "";
    const cookieMatch = setCookie.match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
    );
    const sessionToken = cookieMatch ? cookieMatch[1] : "";
    const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}`;

    return {
        app,
        store,
        tempDir,
        cookieHeader,
        cleanup: async () => {
            await store.close();
            await Deno.remove(tempDir, { recursive: true });
        },
    };
}

function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }
            controller.close();
        },
    });
}

// 1. Contract: AI > 64 KiB must be accepted by bodyLimit and security (not 413)
Deno.test("Contract: POST /api/ai/chat/stream with body > 64 KiB (e.g. 100 KiB) is allowed", async () => {
    const ctx = await setupTestContext();
    try {
        const largeText = "A".repeat(100 * 1024); // 100 KiB
        const payload = JSON.stringify({
            message: largeText,
            conversationId: "test-conv",
        });

        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
                "content-length": String(
                    new TextEncoder().encode(payload).length,
                ),
            },
            body: payload,
        });

        assertEquals(res.status, 400);
        assertEquals((await res.json()).message, "未配置可用模型");
    } finally {
        await ctx.cleanup();
    }
});

// 2. Contract: Normal mutating endpoint exceeding 64 KiB is rejected with 413 and unified message
Deno.test("Contract: Normal endpoint > 64 KiB rejected with 413 and unified message", async () => {
    const ctx = await setupTestContext();
    try {
        const largePayload = JSON.stringify({
            theme: "dark",
            extra: "B".repeat(65 * 1024),
        });

        const res = await ctx.app.request(`${ORIGIN}/api/preferences`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
                "content-length": String(
                    new TextEncoder().encode(largePayload).length,
                ),
            },
            body: largePayload,
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "请求体超过 64 KiB 上限",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

// 3. Contract: POST /api/ai/chat/stream exceeding 32 MiB is rejected with 413 and specific AI message
Deno.test("Contract: POST /api/ai/chat/stream exceeding 32 MiB rejected with 413 and AI message", async () => {
    const ctx = await setupTestContext();
    try {
        const oversizedLen = 32 * 1024 * 1024 + 1;
        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
                "content-length": String(oversizedLen),
            },
            body: new Uint8Array(10), // Short body, but Content-Length declared > 32 MiB
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "AI 请求体超过 32 MiB 上限",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

// 4. Contract: With vs Without Content-Length
Deno.test("Contract: Without Content-Length (streamed), normal endpoint > 64 KiB rejected with 413", async () => {
    const ctx = await setupTestContext();
    try {
        const chunk = new Uint8Array(35 * 1024); // 2 chunks = 70 KiB > 64 KiB
        const stream = makeStream([chunk, chunk]);

        const res = await ctx.app.request(`${ORIGIN}/api/preferences`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
            },
            body: stream,
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "请求体超过 64 KiB 上限",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

// 5. Contract: Origin and Content-Type validation
Deno.test("Contract: Wrong Origin rejected with 403", async () => {
    const ctx = await setupTestContext();
    try {
        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: "http://attacker.example",
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
            },
            body: JSON.stringify({ theme: "dark" }),
        });

        assertEquals(res.status, 403);
        const data = await res.json();
        assertEquals(data.message, "Origin 校验失败，禁止跨站请求");
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: AI chat still requires JSON Content-Type", async () => {
    const ctx = await setupTestContext();
    try {
        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "text/plain",
                cookie: ctx.cookieHeader,
            },
            body: "theme=dark",
        });

        assertEquals(res.status, 415);
        const data = await res.json();
        assertEquals(
            data.message,
            "不支持的 Content-Type，仅接受 application/json",
        );
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: Wrong Content-Type on Upload endpoint rejected with 415", async () => {
    const ctx = await setupTestContext();
    try {
        const res = await ctx.app.request(`${ORIGIN}/api/webapp-icons/upload`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
            },
            body: JSON.stringify({ icon: "invalid" }),
        });

        assertEquals(res.status, 415);
        const data = await res.json();
        assertEquals(
            data.message,
            "不支持的 Content-Type，仅接受 multipart/form-data",
        );
    } finally {
        await ctx.cleanup();
    }
});

// 6. Contract: Upload endpoints original limits and business rules
Deno.test("Contract: WebApp Icons upload: > 2 MiB + 64 KiB rejected at bodyLimit level", async () => {
    const ctx = await setupTestContext();
    try {
        const maxLimit = 2 * 1024 * 1024 + 64 * 1024;
        const res = await ctx.app.request(`${ORIGIN}/api/webapp-icons/upload`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "multipart/form-data; boundary=----boundary",
                cookie: ctx.cookieHeader,
                "content-length": String(maxLimit + 1),
            },
            body: new Uint8Array(10),
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "上传文件大小超过限制",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: WebApp Icons upload: within bodyLimit but icon file > 2 MiB rejected with business message", async () => {
    const ctx = await setupTestContext();
    try {
        const form = new FormData();
        const bigFile = new File(
            [new Uint8Array(2 * 1024 * 1024 + 10)],
            "icon.png",
            {
                type: "image/png",
            },
        );
        form.append("icon", bigFile);

        const res = await ctx.app.request(`${ORIGIN}/api/webapp-icons/upload`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                cookie: ctx.cookieHeader,
            },
            body: form,
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "图标文件大小不能超过 2 MiB",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: Wallpaper upload: > 50 MiB rejected at bodyLimit level", async () => {
    const ctx = await setupTestContext();
    try {
        const res = await ctx.app.request(`${ORIGIN}/api/wallpaper`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "multipart/form-data; boundary=----boundary",
                cookie: ctx.cookieHeader,
                "content-length": String(50 * 1024 * 1024 + 1),
            },
            body: new Uint8Array(10),
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "上传文件大小超过限制",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: Wallpaper upload: within 50 MiB but wallpaper file > 5 MiB rejected with business message", async () => {
    const ctx = await setupTestContext();
    try {
        const form = new FormData();
        const bigFile = new File(
            [new Uint8Array(5 * 1024 * 1024 + 10)],
            "wallpaper.png",
            {
                type: "image/png",
            },
        );
        form.append("image", bigFile);

        const res = await ctx.app.request(`${ORIGIN}/api/wallpaper`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                cookie: ctx.cookieHeader,
            },
            body: form,
        });

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "壁纸文件大小不能超过 5 MiB",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: Admin backup upload: > 50 MiB rejected at bodyLimit level", async () => {
    const ctx = await setupTestContext();
    try {
        const res = await ctx.app.request(
            `${ORIGIN}/api/admin/backup/validate`,
            {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    "content-type":
                        "multipart/form-data; boundary=----boundary",
                    cookie: ctx.cookieHeader,
                    "content-length": String(50 * 1024 * 1024 + 1),
                },
                body: new Uint8Array(10),
            },
        );

        assertEquals(res.status, 413);
        const data = await res.json();
        assertEquals(data, {
            code: 413,
            message: "上传文件大小超过限制",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: Without Content-Length (streamed), AI chat stream > 64 KiB is allowed", async () => {
    const ctx = await setupTestContext();
    try {
        const chunk = new TextEncoder().encode("A".repeat(50 * 1024)); // 2 chunks = 100 KiB > 64 KiB
        const stream = makeStream([
            new TextEncoder().encode('{"message":"'),
            chunk,
            chunk,
            new TextEncoder().encode('","conversationId":"test"}'),
        ]);

        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
            },
            body: stream,
        });

        assertEquals(res.status, 400);
        assertEquals((await res.json()).message, "未配置可用模型");
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Contract: streamed AI body above 32 MiB is rejected without Content-Length", async () => {
    const ctx = await setupTestContext();
    try {
        const chunk = new Uint8Array(1024 * 1024);
        const res = await ctx.app.request(`${ORIGIN}/api/ai/chat/stream`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie: ctx.cookieHeader,
            },
            body: makeStream([
                ...Array.from({ length: 32 }, () => chunk),
                new Uint8Array(1),
            ]),
        });
        assertEquals(res.status, 413);
        assertEquals(await res.json(), {
            code: 413,
            message: "AI 请求体超过 32 MiB 上限",
            status: false,
        });
    } finally {
        await ctx.cleanup();
    }
});
