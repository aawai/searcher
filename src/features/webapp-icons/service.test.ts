import { assertEquals } from "@std/assert";
import { WebAppIconService } from "./service.ts";
import sharp from "sharp";

Deno.test("WebAppIconService saves icon with SHA-256 deduplication and serves it", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "icon-test-" });
    try {
        const service = new WebAppIconService(tempDir);
        const pngBytes = await sharp({
            create: {
                width: 180,
                height: 180,
                channels: 4,
                background: "#dc1e28",
            },
        }).png().toBuffer();

        const record1 = await service.saveIcon("user-1", pngBytes);
        assertEquals(record1.contentType, "image/png");
        assertEquals(record1.url, `/api/webapp-icons/${record1.id}`);

        // Fetch it back
        const fetched = await service.getIcon(record1.id);
        assertEquals(fetched !== null, true);
        assertEquals((await sharp(fetched!.bytes).metadata()).width, 256);

        // Deduplication: saving same bytes returns same SHA-256 asset
        const record2 = await service.saveIcon("user-2", pngBytes);
        assertEquals(record2.sha256, record1.sha256);
    } finally {
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
});
