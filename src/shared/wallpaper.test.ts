import { assertEquals } from "@std/assert";
import {
    normalizeWallpaperCompositions,
    parseWallpaperSource,
} from "./wallpaper.ts";

Deno.test("wallpaper shared: parseWallpaperSource validates uploaded and remote sources", () => {
    // 1. Uploaded wallpaper
    const validUuid = "c8810d0b-1bda-4445-9059-67e6617b7388";
    const uploaded = parseWallpaperSource(`/api/wallpaper/${validUuid}`);
    assertEquals(uploaded, {
        type: "uploaded",
        value: `/api/wallpaper/${validUuid}`,
    });

    // Uppercase UUID should be normalized to lowercase
    const upperUuid = "C8810D0B-1BDA-4445-9059-67E6617B7388";
    assertEquals(parseWallpaperSource(`/api/wallpaper/${upperUuid}`), {
        type: "uploaded",
        value: `/api/wallpaper/${validUuid}`,
    });

    // Invalid uploaded sources
    assertEquals(parseWallpaperSource("/api/wallpaper/not-a-uuid"), null);
    assertEquals(parseWallpaperSource("/api/wallpaper/"), null);
    assertEquals(parseWallpaperSource("/api/wallpaper/123"), null);

    // 2. Remote HTTPS URL
    const validHttps = "https://images.unsplash.com/photo-12345?w=1920";
    assertEquals(parseWallpaperSource(validHttps), {
        type: "remote",
        value: validHttps,
    });

    // HTTP rejected
    assertEquals(parseWallpaperSource("http://example.com/image.jpg"), null);

    // Credentials rejected
    assertEquals(
        parseWallpaperSource("https://user:pass@example.com/image.jpg"),
        null,
    );

    // Malformed URLs rejected
    assertEquals(parseWallpaperSource("https://"), null);
    assertEquals(parseWallpaperSource("not-a-url"), null);

    // 3. CSS gradients are no longer a wallpaper source
    assertEquals(parseWallpaperSource("linear-gradient(red, blue)"), null);
    // 4. Data URL (guest only in local storage, rejected by shared/server parser)
    assertEquals(
        parseWallpaperSource("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="),
        null,
    );

    // 5. Empty / null / invalid strings
    assertEquals(parseWallpaperSource(""), null);
    assertEquals(parseWallpaperSource("   "), null);
});

Deno.test("wallpaper shared: normalizeWallpaperCompositions parses and clamps focal points", () => {
    assertEquals(normalizeWallpaperCompositions(null), {});
    assertEquals(normalizeWallpaperCompositions(undefined), {});
    assertEquals(normalizeWallpaperCompositions("invalid"), {});
    assertEquals(normalizeWallpaperCompositions([]), {});

    const raw = {
        "/api/wallpaper/1": { focalX: 0.2, focalY: 0.8 },
        "https://example.com/a.jpg": { focalX: -0.5, focalY: 1.5 },
        "invalid-item": null,
        "missing-props": {},
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==": {
            focalX: 0.1,
            focalY: 0.9,
        },
    };

    const normalized = normalizeWallpaperCompositions(raw);
    assertEquals(normalized["/api/wallpaper/1"], { focalX: 0.2, focalY: 0.8 });
    assertEquals(normalized["https://example.com/a.jpg"], {
        focalX: 0,
        focalY: 1,
    });
    assertEquals(
        normalized["data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="],
        { focalX: 0.1, focalY: 0.9 },
    );
    assertEquals(normalized["missing-props"], { focalX: 0.5, focalY: 0.5 });
    assertEquals(normalized["invalid-item"], undefined);
});
