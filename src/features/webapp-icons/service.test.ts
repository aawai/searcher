import { assertEquals } from "@std/assert";
import { WebAppIconService } from "./service.ts";

Deno.test("WebAppIconService saves icon with SHA-256 deduplication and serves it", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "icon-test-" });
    try {
        const service = new WebAppIconService(tempDir);
        const pngBytes = new Uint8Array([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
            0x00,
            0x00,
            0x00,
            0x0d,
        ]);

        const record1 = await service.saveIcon("user-1", pngBytes);
        assertEquals(record1.contentType, "image/png");
        assertEquals(record1.url, `/api/webapp-icons/${record1.id}`);

        // Fetch it back
        const fetched = await service.getIcon(record1.id);
        assertEquals(fetched !== null, true);
        assertEquals(fetched?.bytes, pngBytes);

        // Deduplication: saving same bytes returns same SHA-256 asset
        const record2 = await service.saveIcon("user-2", pngBytes);
        assertEquals(record2.sha256, record1.sha256);
    } finally {
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
});
