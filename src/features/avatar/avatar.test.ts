import { assert, assertEquals, assertNotEquals } from "@std/assert";
import sharp from "sharp";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createApp } from "../../app.ts";

const ORIGIN = "http://localhost:8000";

async function setupApp() {
    const tempDir = await Deno.makeTempDir({ prefix: "avatar_test_" });
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

    async function registerAndCookie(username: string): Promise<string> {
        const res = await app.request(`${ORIGIN}/api/auth/register`, {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                username,
                displayName: username,
                password: "Password123456!",
            }),
        });
        assertEquals(res.status, 200);
        const setCookie = res.headers.get("set-cookie") ?? "";
        const match = setCookie.match(
            new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
        );
        return `${SESSION_COOKIE_NAME}=${match?.[1] ?? ""}`;
    }

    return {
        app,
        store,
        registerAndCookie,
        cleanup: async () => {
            await store.close();
            await Deno.remove(tempDir, { recursive: true });
        },
    };
}

/** Creates a 400x200 PNG with left half solid red and right half solid blue. */
async function makeTwoTonePng(): Promise<Uint8Array> {
    const width = 400;
    const height = 200;
    const raw = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (x < 200) {
                raw[idx] = 240;
                raw[idx + 1] = 20;
                raw[idx + 2] = 20;
                raw[idx + 3] = 255;
            } else {
                raw[idx] = 20;
                raw[idx + 1] = 40;
                raw[idx + 2] = 240;
                raw[idx + 3] = 255;
            }
        }
    }
    const buf = await sharp(raw, {
        raw: { width, height, channels: 4 },
    })
        .png()
        .toBuffer();
    return new Uint8Array(buf);
}

Deno.test("Avatar: upload preserves original, crops selected region to 256x256 WebP, recrops, and removes", async () => {
    const ctx = await setupApp();
    try {
        const cookie = await ctx.registerAndCookie("avataruser1");
        const pngBytes = await makeTwoTonePng();

        // 1. Upload cropping the left half (red)
        const form = new FormData();
        form.append(
            "avatar",
            new File([pngBytes as unknown as BlobPart], "two-tone.png", {
                type: "image/png",
            }),
        );
        form.append("cropX", "0");
        form.append("cropY", "0");
        form.append("cropSize", "1");

        const uploadRes = await ctx.app.request(
            `${ORIGIN}/api/account/avatar`,
            {
                method: "POST",
                headers: { origin: ORIGIN, cookie },
                body: form,
            },
        );
        assertEquals(uploadRes.status, 200);
        const uploadBody = await uploadRes.json();
        assertEquals(uploadBody.status, true);
        const firstAvatarId = uploadBody.data.avatar.avatarId as string;
        assertEquals(uploadBody.data.avatar.originalWidth, 400);
        assertEquals(uploadBody.data.avatar.originalHeight, 200);
        assertEquals(uploadBody.data.avatar.displaySize, 256);
        assertEquals(
            uploadBody.data.avatarUrl,
            `/api/avatars/${firstAvatarId}`,
        );

        // 2. Verify original bytes are preserved intact
        const origRes = await ctx.app.request(
            `${ORIGIN}/api/avatars/${firstAvatarId}/original`,
            { headers: { cookie } },
        );
        assertEquals(origRes.status, 200);
        assertEquals(origRes.headers.get("content-type"), "image/png");
        const origDownloaded = new Uint8Array(await origRes.arrayBuffer());
        assertEquals(origDownloaded, pngBytes);

        // 3. Verify display image is 256x256 WebP and predominantly red
        const dispRes = await ctx.app.request(
            `${ORIGIN}/api/avatars/${firstAvatarId}`,
            { headers: { cookie } },
        );
        assertEquals(dispRes.status, 200);
        assertEquals(dispRes.headers.get("content-type"), "image/webp");
        const dispBytes = new Uint8Array(await dispRes.arrayBuffer());
        const dispSample = await sharp(dispBytes)
            .raw()
            .toBuffer({ resolveWithObject: true });
        assertEquals(dispSample.info.width, 256);
        assertEquals(dispSample.info.height, 256);
        // Center pixel should be red-dominant
        const centerIdx = (128 * 256 + 128) * dispSample.info.channels;
        assert(dispSample.data[centerIdx] > 180);
        assert(dispSample.data[centerIdx + 2] < 80);

        // 4. Verify /api/auth/me, /api/auth/session, and PATCH /api/account keep avatarUrl
        const meRes = await ctx.app.request(`${ORIGIN}/api/auth/me`, {
            headers: { cookie },
        });
        assertEquals(
            (await meRes.json()).data.user.avatarUrl,
            `/api/avatars/${firstAvatarId}`,
        );

        const sessRes = await ctx.app.request(`${ORIGIN}/api/auth/session`, {
            headers: { cookie },
        });
        assertEquals(
            (await sessRes.json()).data.user.avatarUrl,
            `/api/avatars/${firstAvatarId}`,
        );

        const patchProfileRes = await ctx.app.request(`${ORIGIN}/api/account`, {
            method: "PATCH",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
                cookie,
            },
            body: JSON.stringify({ displayName: "Updated Name" }),
        });
        assertEquals(patchProfileRes.status, 200);
        assertEquals(
            (await patchProfileRes.json()).data.user.avatarUrl,
            `/api/avatars/${firstAvatarId}`,
        );

        // 5. Recrop to the right half (blue) using stored original
        const recropRes = await ctx.app.request(
            `${ORIGIN}/api/account/avatar/crop`,
            {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie,
                },
                body: JSON.stringify({ x: 0.5, y: 0, size: 1 }),
            },
        );
        assertEquals(recropRes.status, 200);
        const recropBody = await recropRes.json();
        const secondAvatarId = recropBody.data.avatar.avatarId as string;
        assertNotEquals(secondAvatarId, firstAvatarId);

        const dispRes2 = await ctx.app.request(
            `${ORIGIN}/api/avatars/${secondAvatarId}`,
            { headers: { cookie } },
        );
        assertEquals(dispRes2.status, 200);
        const dispSample2 = await sharp(
            new Uint8Array(await dispRes2.arrayBuffer()),
        )
            .raw()
            .toBuffer({ resolveWithObject: true });
        const centerIdx2 = (128 * 256 + 128) * dispSample2.info.channels;
        assert(dispSample2.data[centerIdx2] < 80);
        assert(dispSample2.data[centerIdx2 + 2] > 180);

        // 6. Delete avatar
        const delRes = await ctx.app.request(`${ORIGIN}/api/account/avatar`, {
            method: "DELETE",
            headers: { origin: ORIGIN, cookie },
        });
        assertEquals(delRes.status, 200);
        assertEquals((await delRes.json()).data.avatarUrl, null);

        const afterDelDisp = await ctx.app.request(
            `${ORIGIN}/api/avatars/${secondAvatarId}`,
            { headers: { cookie } },
        );
        assertEquals(afterDelDisp.status, 404);
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Avatar: EXIF orientation is normalized and cross-user/invalid requests are rejected", async () => {
    const ctx = await setupApp();
    try {
        const cookieA = await ctx.registerAndCookie("avatar_owner");
        const cookieB = await ctx.registerAndCookie("avatar_other");

        // Create a 200x100 JPEG with EXIF Orientation 6 (90° CW -> oriented 100x200)
        const jpegWithExif = await sharp({
            create: {
                width: 200,
                height: 100,
                channels: 3,
                background: { r: 40, g: 180, b: 90 },
            },
        })
            .withMetadata({ orientation: 6 })
            .jpeg()
            .toBuffer();

        const form = new FormData();
        form.append(
            "avatar",
            new File(
                [new Uint8Array(jpegWithExif) as unknown as BlobPart],
                "portrait.jpg",
                {
                    type: "image/jpeg",
                },
            ),
        );
        const uploadRes = await ctx.app.request(
            `${ORIGIN}/api/account/avatar`,
            {
                method: "POST",
                headers: { origin: ORIGIN, cookie: cookieA },
                body: form,
            },
        );
        assertEquals(uploadRes.status, 200);
        const meta = (await uploadRes.json()).data.avatar;
        assertEquals(meta.originalWidth, 100);
        assertEquals(meta.originalHeight, 200);

        // Unauthenticated cannot read avatar
        const anonRes = await ctx.app.request(
            `${ORIGIN}/api/avatars/${meta.avatarId}`,
        );
        assertEquals(anonRes.status, 401);

        // Other user cannot read display or original
        const otherDisp = await ctx.app.request(
            `${ORIGIN}/api/avatars/${meta.avatarId}`,
            { headers: { cookie: cookieB } },
        );
        assertEquals(otherDisp.status, 404);

        const otherOrig = await ctx.app.request(
            `${ORIGIN}/api/avatars/${meta.avatarId}/original`,
            { headers: { cookie: cookieB } },
        );
        assertEquals(otherOrig.status, 404);

        // Reject SVG upload
        const badForm = new FormData();
        badForm.append(
            "avatar",
            new File(
                [new TextEncoder().encode(
                    "<svg xmlns='http://www.w3.org/2000/svg'/>",
                )],
                "bad.svg",
                { type: "image/svg+xml" },
            ),
        );
        const badRes = await ctx.app.request(
            `${ORIGIN}/api/account/avatar`,
            {
                method: "POST",
                headers: { origin: ORIGIN, cookie: cookieA },
                body: badForm,
            },
        );
        assertEquals(badRes.status, 400);
    } finally {
        await ctx.cleanup();
    }
});
