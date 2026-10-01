import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { DatabaseStore } from "../../db/database.ts";
import {
    AttachmentValidationError,
    processAndStoreAttachments,
    validateAttachments,
} from "./attachments.ts";
import { aiBlobs } from "../../db/ai-schema.ts";

function createInMemoryStore(): DatabaseStore {
    const native = new DatabaseSync(":memory:");
    const store = new DatabaseStore(native);
    store.migrate([
        `CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            disabled INTEGER NOT NULL DEFAULT 0,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            auth_version INTEGER NOT NULL DEFAULT 1,
            soft_deleted_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE ai_blobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversation_id TEXT,
            mime_type TEXT NOT NULL,
            data TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );`,
    ]);
    return store;
}

Deno.test("Attachments: validateAttachments passes valid attachments", () => {
    validateAttachments([
        {
            id: "1",
            name: "test.txt",
            type: "text",
            mimeType: "text/plain",
            data: "hello world",
        },
        {
            id: "2",
            name: "test.png",
            type: "image",
            mimeType: "image/png",
            data:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        },
    ]);
});

Deno.test("Attachments: validateAttachments rejects more than 4 attachments", () => {
    const atts = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `test${i}.txt`,
        type: "text" as const,
        mimeType: "text/plain",
        data: "content",
    }));

    assertThrows(
        () => validateAttachments(atts),
        AttachmentValidationError,
        "最多允许上传 4 个附件",
    );
});

Deno.test("Attachments: validateAttachments rejects image with invalid magic bytes", () => {
    assertThrows(
        () =>
            validateAttachments([
                {
                    id: "1",
                    name: "fake.png",
                    type: "image",
                    mimeType: "image/png",
                    data: "data:image/png;base64,VGhpcyBpcyBub3QgYSBwbmc=",
                },
            ]),
        AttachmentValidationError,
        "非有效图片数据",
    );
});

Deno.test("Attachments: validateAttachments rejects mismatched declared vs detected MIME type", () => {
    assertThrows(
        () =>
            validateAttachments([
                {
                    id: "1",
                    name: "test.jpg",
                    type: "image",
                    mimeType: "image/jpeg",
                    // Valid 1x1 PNG bytes declared as JPEG
                    data:
                        "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                },
            ]),
        AttachmentValidationError,
        "与声明格式 (image/jpeg) 不符",
    );
});

Deno.test("Attachments: validateAttachments rejects unsupported MIME type", () => {
    assertThrows(
        () =>
            validateAttachments([
                {
                    id: "1",
                    name: "danger.exe",
                    type: "text" as const,
                    mimeType: "application/x-msdownload",
                    data: "binary",
                },
            ]),
        AttachmentValidationError,
        "不支持的附件文件类型",
    );
});

Deno.test("Attachments: validateAttachments rejects text larger than 1 MiB", () => {
    const hugeText = "a".repeat(1024 * 1024 + 10);
    assertThrows(
        () =>
            validateAttachments([
                {
                    id: "1",
                    name: "huge.txt",
                    type: "text" as const,
                    mimeType: "text/plain",
                    data: hugeText,
                },
            ]),
        AttachmentValidationError,
        "文本附件 huge.txt 大小超过 1 MiB 上限",
    );
});

Deno.test("Attachments: processAndStoreAttachments persists image blobs", async () => {
    const store = createInMemoryStore();
    try {
        await store.run(async (db) => {
            await db.run(
                `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at) VALUES ('u1', 'test', 'Test', 'h', 0, 0)`,
            );
        });

        const parts = await processAndStoreAttachments("u1", "c1", [
            {
                id: "img1",
                name: "pic.png",
                type: "image",
                mimeType: "image/png",
                data:
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            },
            {
                id: "doc1",
                name: "doc.md",
                type: "text",
                mimeType: "text/markdown",
                data: "# Notes",
            },
        ], store);

        assertEquals(parts.length, 2);
        assertEquals(parts[0].type, "attachment");
        assertExists(parts[0].url);
        assertEquals(parts[1].data, "# Notes");

        // Verify stored in aiBlobs
        await store.run(async (db) => {
            const rows = await db.select().from(aiBlobs);
            assertEquals(rows.length, 1);
            assertEquals(rows[0].userId, "u1");
            assertEquals(rows[0].conversationId, "c1");
            assertEquals(rows[0].mimeType, "image/png");
        });
    } finally {
        await store.close();
    }
});
