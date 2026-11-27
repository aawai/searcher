import { assertEquals } from "@std/assert";
import sharp from "sharp";
import { buildLogoPrompt, generateLogoCandidates } from "./images.ts";
import { LOGO_STYLES } from "./types.ts";

Deno.test("logo prompt renders reference and text templates without raw JSON wrappers", () => {
    for (const style of LOGO_STYLES) {
        const refPrompt = buildLogoPrompt({
            siteName: "Notion",
            siteDomain: "notion.so",
            description: "Workspace notes",
            style,
            hasReference: true,
        });
        assertEquals(
            refPrompt.includes("Redesign the attached app icon"),
            true,
        );
        assertEquals(refPrompt.includes('"Notion" (notion.so)'), true);
        assertEquals(refPrompt.includes("Workspace notes"), true);
        assertEquals(refPrompt.includes("Candidate "), false);

        const textPrompt = buildLogoPrompt({
            siteName: "Searcher",
            style,
            hasReference: false,
        });
        assertEquals(
            textPrompt.includes(
                "A single production-ready square launcher app icon",
            ),
            true,
        );
        assertEquals(textPrompt.includes('"Searcher"'), true);
        assertEquals(textPrompt.includes("()"), false);
        assertEquals(textPrompt.includes("Product concept:"), false);
    }
});

Deno.test("logo prompt omits absent and whitespace-only optional metadata", () => {
    for (const metadata of [{}, { siteDomain: " ", description: "\n\t" }]) {
        const prompt = buildLogoPrompt({
            siteName: " Searcher ",
            style: "brand_soft3d",
            hasReference: false,
            ...metadata,
        });
        assertEquals(prompt.includes('"Searcher"'), true);
        assertEquals(prompt.includes("()"), false);
        assertEquals(prompt.includes("Product concept:"), false);
    }
});

Deno.test("official Gemini API accepts native endpoint, defaults to 1 image, and sends inlineData when reference provided", async () => {
    const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuIAAAAASUVORK5CYII=";
    const refBytes = await sharp({
        create: {
            width: 8,
            height: 8,
            channels: 4,
            background: { r: 20, g: 100, b: 220, alpha: 1 },
        },
    }).png().toBuffer();

    let callCount = 0;
    let capturedParts: Array<Record<string, unknown>> = [];
    const fetchFn: typeof fetch = (input, init) => {
        callCount++;
        const headers = new Headers(init?.headers);
        if (
            String(input) !==
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent" ||
            headers.get("x-goog-api-key") !== "fixture-key" ||
            headers.has("Authorization")
        ) {
            return Promise.resolve(
                new Response("Unsupported endpoint or credentials", {
                    status: 401,
                }),
            );
        }
        const body = JSON.parse(String(init?.body));
        capturedParts = body.contents[0].parts;
        return Promise.resolve(
            Response.json({
                candidates: [{
                    content: {
                        parts: [{
                            inlineData: { mimeType: "image/png", data: png },
                        }],
                    },
                }],
            }),
        );
    };
    const result = await generateLogoCandidates({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: "fixture-key",
        modelId: "models/gemini-3.1-flash-image",
        siteName: "Searcher",
        style: "brand_soft3d",
        imageProtocol: "gemini",
        referenceImage: {
            bytes: new Uint8Array(refBytes),
            mimeType: "image/png",
        },
        fetchFn,
    });
    assertEquals(callCount, 1);
    assertEquals(result.usedReference, true);
    assertEquals(result.images.length, 1);
    assertEquals(result.images[0].style, "brand_soft3d");
    assertEquals(
        result.images[0].dataUrl.startsWith("data:image/webp;base64,"),
        true,
    );
    assertEquals(capturedParts.length, 2);
    assertEquals("inlineData" in capturedParts[0], true);
    assertEquals("text" in capturedParts[1], true);
});

Deno.test("large 1024x1024 PNG candidate is compressed to <=256px WebP", async () => {
    const largePng = await sharp({
        create: {
            width: 1024,
            height: 1024,
            channels: 4,
            background: { r: 25, g: 110, b: 230, alpha: 1 },
        },
    }).png().toBuffer();

    const fetchFn: typeof fetch = () =>
        Promise.resolve(
            Response.json({
                data: [{ b64_json: new Uint8Array(largePng).toBase64() }],
            }),
        );

    const result = await generateLogoCandidates({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        modelId: "gpt-image-1",
        siteName: "Searcher",
        style: "brand_soft3d",
        imageProtocol: "openai",
        fetchFn,
    });

    const dataUrl = result.images[0].dataUrl;
    assertEquals(dataUrl.startsWith("data:image/webp;base64,"), true);
    const outBytes = Uint8Array.fromBase64(dataUrl.split(",")[1]);
    const meta = await sharp(outBytes).metadata();
    assertEquals(meta.format, "webp");
    assertEquals(meta.width, 256);
    assertEquals(meta.height, 256);
});

Deno.test("OpenAI protocol uses /images/edits with FormData when reference provided, and customPrompt passes verbatim", async () => {
    const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuIAAAAASUVORK5CYII=";
    let calledUrl = "";
    let sawImageField = false;
    let sentPrompt = "";
    const fetchFn: typeof fetch = async (input, init) => {
        calledUrl = String(input);
        const form = init?.body as FormData;
        sawImageField = form.get("image") instanceof Blob;
        sentPrompt = String(form.get("prompt"));
        return await Promise.resolve(
            Response.json({
                data: [{ b64_json: png }],
            }),
        );
    };

    const result = await generateLogoCandidates({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        modelId: "gpt-image-1",
        siteName: "Searcher",
        style: "crisp_flat",
        customPrompt: "EXACT CUSTOM PROMPT ONLY",
        count: 3,
        imageProtocol: "openai",
        referenceImage: {
            bytes: Uint8Array.fromBase64(png),
            mimeType: "image/png",
        },
        fetchFn,
    });

    assertEquals(calledUrl, "https://api.example.com/v1/images/edits");
    assertEquals(sawImageField, true);
    assertEquals(sentPrompt, "EXACT CUSTOM PROMPT ONLY");
    assertEquals(result.promptUsed, "EXACT CUSTOM PROMPT ONLY");
    assertEquals(result.images.length, 3);
});
