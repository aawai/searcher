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
        assertEquals(record1.contentType, "image/webp");
        assertEquals(record1.presentationVersion, 2);

        // Fetch it back
        const fetched = await service.getIcon(record1.id);
        assertEquals(fetched !== null, true);
        assertEquals(fetched?.record.contentType, "image/webp");

        // Deduplication: saving same bytes returns same SHA-256 asset
        const record2 = await service.saveIcon("user-2", pngBytes);
        assertEquals(record2.sha256, record1.sha256);

        // Legacy v1 PNG asset auto-upgrades to v2 160x160 WebP on read
        const legacyId = "legacy-v1-icon";
        await Deno.writeFile(`${tempDir}/${legacyId}.png`, pngBytes);
        const manifestRaw = JSON.parse(
            await Deno.readTextFile(`${tempDir}/manifest.json`),
        );
        manifestRaw.push({
            id: legacyId,
            ownerUserId: "user-1",
            contentType: "image/png",
            size: pngBytes.length,
            sha256: "legacy-sha",
            relativePath: `${legacyId}.png`,
            createdAt: 1000,
            presentationVersion: 1,
        });
        await Deno.writeTextFile(
            `${tempDir}/manifest.json`,
            JSON.stringify(manifestRaw),
        );

        const upgraded = await service.getIcon(legacyId);
        assertEquals(upgraded !== null, true);
        assertEquals(upgraded?.record.contentType, "image/webp");
        assertEquals(upgraded?.record.presentationVersion, 2);
        assertEquals(upgraded?.record.relativePath, `${legacyId}.webp`);
        const meta = await sharp(upgraded!.bytes).metadata();
        assertEquals(meta.format, "webp");
        assertEquals(meta.width, 160);
    } finally {
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
});
