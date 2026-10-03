import { assertEquals } from "@std/assert";
import {
    DEFAULT_WALLPAPER_COMPOSITION,
    normalizeWallpaperCompositions,
    parseWallpaperSource,
    wallpaperComposition,
} from "./wallpaper.ts";

Deno.test("wallpaper shared: parseWallpaperSource validates uploaded, remote, and gradient", () => {
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

    // 3. Whitelisted CSS Gradients
    const linearGrad = "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
    assertEquals(parseWallpaperSource(linearGrad), {
        type: "gradient",
        value: linearGrad,
    });

    const radialGrad =
        "radial-gradient(circle at 50% 50%, rgb(59, 130, 246) 0%, transparent 70%)";
    assertEquals(parseWallpaperSource(radialGrad), {
        type: "gradient",
        value: radialGrad,
    });

    const conicGrad = "conic-gradient(from 45deg, #ff0000, #00ff00, #0000ff)";
    assertEquals(parseWallpaperSource(conicGrad), {
        type: "gradient",
        value: conicGrad,
    });

    // Valid gradients with 2+ stops
    assertEquals(parseWallpaperSource("linear-gradient(red, blue)"), {
        type: "gradient",
        value: "linear-gradient(red, blue)",
    });
    assertEquals(parseWallpaperSource("linear-gradient(to right, red, blue)"), {
        type: "gradient",
        value: "linear-gradient(to right, red, blue)",
    });

    // Strict syntax rejection: empty, non-color garbage, insufficient stops, junk suffix
    assertEquals(parseWallpaperSource("linear-gradient()"), null);
    assertEquals(parseWallpaperSource("linear-gradient(garbage)"), null);
    assertEquals(parseWallpaperSource("linear-gradient(red)"), null);
    assertEquals(parseWallpaperSource("linear-gradient(red, blue) junk"), null);
    assertEquals(parseWallpaperSource("linear-gradient(135deg, red)"), null);
    assertEquals(parseWallpaperSource("linear-gradient(red,,blue)"), null);
    assertEquals(parseWallpaperSource("linear-gradient(red, blue,)"), null);
    assertEquals(parseWallpaperSource("linear-gradient(red, notacolor)"), null);
    assertEquals(
        parseWallpaperSource(
            "linear-gradient(135deg, red 10px 20px 30px, blue)",
        ),
        null,
    );
    assertEquals(
        parseWallpaperSource("linear-gradient(to top bottom, red, blue)"),
        null,
    );
    assertEquals(
        parseWallpaperSource("linear-gradient(rgb(1), blue)"),
        null,
    );
    assertEquals(
        parseWallpaperSource("radial-gradient(at garbage, red, blue)"),
        null,
    );
    assertEquals(
        parseWallpaperSource("radial-gradient(at center, red, blue)"),
        {
            type: "gradient",
            value: "radial-gradient(at center, red, blue)",
        },
    );

    // Dangerous / arbitrary CSS gradients rejected
    assertEquals(
        parseWallpaperSource("linear-gradient(url('https://evil.com/leak'))"),
        null,
    );
    assertEquals(
        parseWallpaperSource("linear-gradient(var(--custom-evil))"),
        null,
    );
    assertEquals(
        parseWallpaperSource(
            "linear-gradient(45deg, red); body { color: red; }",
        ),
        null,
    );
    assertEquals(
        parseWallpaperSource("linear-gradient(45deg, red) /* comment */"),
        null,
    );
    assertEquals(
        parseWallpaperSource("linear-gradient(javascript:alert(1))"),
        null,
    );
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

Deno.test("wallpaper shared: wallpaperComposition resolves composition with default fallback", () => {
    const compositions = {
        "/api/wallpaper/a": { focalX: 0.3, focalY: 0.7 },
    };

    // Found composition
    assertEquals(wallpaperComposition("/api/wallpaper/a", compositions), {
        focalX: 0.3,
        focalY: 0.7,
    });

    // Missing composition falls back to center (0.5, 0.5)
    assertEquals(wallpaperComposition("/api/wallpaper/b", compositions), {
        focalX: 0.5,
        focalY: 0.5,
    });

    // Null or undefined source falls back to center (0.5, 0.5)
    assertEquals(wallpaperComposition(null, compositions), {
        focalX: 0.5,
        focalY: 0.5,
    });
    assertEquals(wallpaperComposition(undefined, compositions), {
        focalX: 0.5,
        focalY: 0.5,
    });

    // Null or undefined compositions map falls back to center (0.5, 0.5)
    assertEquals(wallpaperComposition("/api/wallpaper/a", null), {
        focalX: 0.5,
        focalY: 0.5,
    });

    assertEquals(DEFAULT_WALLPAPER_COMPOSITION, { focalX: 0.5, focalY: 0.5 });
});
