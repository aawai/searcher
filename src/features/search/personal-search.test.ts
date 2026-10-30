import { assert, assertEquals } from "@std/assert";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import type { Envelope, UserDto } from "@shared/contracts.ts";
import {
    PERSONAL_SEARCH_DEFAULT_LIMIT,
    type PersonalSearchDto,
} from "@shared/personal-search.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { BookmarksService } from "../bookmarks/service.ts";
import { DocumentsService } from "../documents/service.ts";

const origin = "http://localhost:8000";

async function setup() {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin });
    const app = createApp({ store, auth, origin });
    const users: { id: string; cookie: string }[] = [];
    for (const username of ["personal_owner", "personal_other"]) {
        const response = await app.request("/api/auth/register", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
                username,
                displayName: username,
                password: "Password123456!",
            }),
        });
        assertEquals(response.status, 200);
        const token = response.headers.get("set-cookie")?.match(
            new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
        )?.[1];
        assert(token);
        const body = await response.json() as Envelope<{ user: UserDto }>;
        users.push({
            id: body.data!.user.id,
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
        });
    }
    let clock = 1_000;
    const now = () => ++clock;
    return {
        store,
        owner: users[0],
        other: users[1],
        documents: new DocumentsService(store, now),
        apps: new BookmarksService(store, now),
        async search(query: string, who: { cookie: string } | null = users[0]) {
            return await app.request(
                `/api/search/personal?${new URLSearchParams(query)}`,
                {
                    headers: {
                        origin,
                        ...(who ? { cookie: who.cookie } : {}),
                    },
                },
            );
        },
    };
}

async function groups(response: Response): Promise<PersonalSearchDto> {
    assertEquals(response.status, 200);
    return (await response.json() as Envelope<PersonalSearchDto>).data!;
}

Deno.test("personal search requires a session", async () => {
    const t = await setup();
    try {
        assertEquals((await t.search("q=灵感", null)).status, 401);
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search returns documents and apps in separate groups", async () => {
    const t = await setup();
    try {
        const doc = await t.documents.create(t.owner.id, {
            title: "灵感",
            body: "今天的灵感来源是散步",
        });
        const app = await t.apps.createWebApp(t.owner.id, {
            name: "灵感收集",
            url: "https://inspire.example.com",
        });
        await t.apps.createWebApp(t.owner.id, {
            name: "GitHub",
            url: "https://github.com",
        });

        const result = await groups(await t.search("q=灵感"));
        assertEquals(result.query, "灵感");
        assertEquals(result.documents.map((d) => d.id), [doc.id]);
        assertEquals(result.documents[0].displayTitle, "灵感");
        assertEquals(result.apps, [{
            id: app.id,
            name: "灵感收集",
            url: app.url,
            groupId: null,
            iconAssetId: null,
            iconSource: "website",
            openMode: "global",
        }]);

        // Body-only substring (>= 3 characters) finds the document, not the apps.
        const body = await groups(await t.search("q=灵感来源"));
        assertEquals(body.documents.map((d) => d.id), [doc.id]);
        assertEquals(body.apps, []);

        // Apps match their name and their URL, case-insensitively.
        assertEquals(
            (await groups(await t.search("q=github"))).apps.map((a) => a.name),
            ["GitHub"],
        );
        assertEquals(
            (await groups(await t.search("q=INSPIRE.example"))).apps.map((a) =>
                a.name
            ),
            ["灵感收集"],
        );
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search never returns other owners, trashed documents or deleted apps", async () => {
    const t = await setup();
    try {
        const mine = await t.documents.create(t.owner.id, {
            body: "共享关键词 我的笔记",
        });
        const trashed = await t.documents.create(t.owner.id, {
            body: "共享关键词 已删除笔记",
        });
        await t.documents.softDelete(t.owner.id, trashed.id, 1);
        await t.documents.create(t.other.id, { body: "共享关键词 别人的笔记" });
        await t.apps.createWebApp(t.owner.id, {
            name: "共享应用",
            url: "https://mine.example.com",
        });
        const gone = await t.apps.createWebApp(t.owner.id, {
            name: "共享应用已删除",
            url: "https://gone.example.com",
        });
        await t.apps.softDeleteWebApp(t.owner.id, gone.id);
        await t.apps.createWebApp(t.other.id, {
            name: "共享应用别人的",
            url: "https://theirs.example.com",
        });

        const result = await groups(await t.search("q=共享"));
        assertEquals(result.documents.map((d) => d.id), [mine.id]);
        assertEquals(result.apps.map((a) => a.name), ["共享应用"]);
        const theirs = await groups(await t.search("q=共享", t.other));
        assertEquals(theirs.documents.length, 1);
        assertEquals(theirs.apps.map((a) => a.name), ["共享应用别人的"]);
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search orders apps by name prefix, name substring, then URL, then home order", async () => {
    const t = await setup();
    try {
        const make = (name: string, url: string, sortOrder: number) =>
            t.apps.createWebApp(t.owner.id, { name, url, sortOrder });
        await make("我的 Docs 站", "https://a.example.com", 0);
        await make("文档 Wiki", "https://docs.example.com", 1);
        await make("Docs Reader", "https://b.example.com", 5);
        await make("Docs Writer", "https://c.example.com", 2);

        assertEquals(
            (await groups(await t.search("q=docs"))).apps.map((a) => a.name),
            ["Docs Writer", "Docs Reader", "我的 Docs 站", "文档 Wiki"],
        );
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search includes apps inside folders and requires every term", async () => {
    const t = await setup();
    try {
        const group = await t.apps.createGroup(t.owner.id, "工作");
        const inFolder = await t.apps.createWebApp(t.owner.id, {
            name: "Linear Board",
            url: "https://linear.app",
            groupId: group.id,
        });
        await t.apps.createWebApp(t.owner.id, {
            name: "Linear Docs",
            url: "https://linear.app/docs",
        });
        const result = await groups(await t.search("q=linear board"));
        assertEquals(result.apps.map((a) => a.id), [inFolder.id]);
        assertEquals(result.apps[0].groupId, group.id);
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search caps each group at limit and validates input", async () => {
    const t = await setup();
    try {
        for (let i = 0; i < PERSONAL_SEARCH_DEFAULT_LIMIT + 1; i++) {
            await t.documents.create(t.owner.id, { body: `笔记 ${i} 清单` });
            await t.apps.createWebApp(t.owner.id, {
                name: `清单应用 ${i}`,
                url: `https://list${i}.example.com`,
                sortOrder: i,
            });
        }
        const capped = await groups(await t.search("q=清单&limit=2"));
        assertEquals(capped.documents.length, 2);
        assertEquals(capped.apps.map((a) => a.name), [
            "清单应用 0",
            "清单应用 1",
        ]);
        // Without the parameter, each group is capped at the default limit.
        const defaulted = await groups(await t.search("q=清单"));
        assertEquals(defaulted.apps.length, PERSONAL_SEARCH_DEFAULT_LIMIT);
        assertEquals(defaulted.documents.length, PERSONAL_SEARCH_DEFAULT_LIMIT);

        for (
            const bad of [
                "limit=0",
                "limit=21",
                "limit=x",
                `q=${"a".repeat(201)}`,
            ]
        ) {
            assertEquals((await t.search(`q=清单&${bad}`)).status, 400, bad);
        }
        assertEquals((await t.search("limit=3")).status, 400);
        const blank = await groups(await t.search("q=%20%20"));
        assertEquals(blank.documents, []);
        assertEquals(blank.apps, []);
    } finally {
        await t.store.close();
    }
});

Deno.test("personal search treats operators and punctuation as literal text", async () => {
    const t = await setup();
    try {
        const doc = await t.documents.create(t.owner.id, {
            body: 'cats OR dogs -x (y) "z"',
        });
        const app = await t.apps.createWebApp(t.owner.id, {
            name: "Q&A (beta) OR more",
            url: "https://qa.example.com",
        });
        for (
            const q of ["OR", "-x", "(y)", '"z"', '"', "(", "cats OR dogs"]
        ) {
            const result = await groups(
                await t.search(new URLSearchParams({ q }).toString()),
            );
            assert(
                result.documents.some((d) => d.id === doc.id),
                `document for ${q}`,
            );
        }
        for (const q of ["(beta)", "OR more", "&A ("]) {
            const result = await groups(
                await t.search(new URLSearchParams({ q }).toString()),
            );
            assertEquals(result.apps.map((a) => a.id), [app.id], q);
        }
        // Percent and underscore are not wildcards.
        for (const q of ["%", "_", "%%%", "c_ts"]) {
            const result = await groups(
                await t.search(new URLSearchParams({ q }).toString()),
            );
            assertEquals(result.documents, [], q);
            assertEquals(result.apps, [], q);
        }
    } finally {
        await t.store.close();
    }
});
