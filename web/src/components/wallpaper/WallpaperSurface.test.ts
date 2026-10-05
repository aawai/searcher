import { assertEquals, assertMatch, assertNotMatch } from "@std/assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WALLPAPER_PRESENTATION } from "@shared/wallpaper-presentation.ts";
import { formatWallpaperCss, WallpaperSurface } from "./WallpaperSurface.tsx";

Deno.test("WallpaperSurface: formatWallpaperCss escapes URLs and rejects unsupported sources", () => {
    // Empty / null / whitespace
    assertEquals(formatWallpaperCss(""), "none");
    assertEquals(formatWallpaperCss(null), "none");
    assertEquals(formatWallpaperCss("   "), "none");

    // Uploaded / HTTPS / Data URLs with proper url() wrapping and quotes
    assertEquals(
        formatWallpaperCss(
            "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
        ),
        'url("/api/wallpaper/12345678-1234-1234-1234-123456789abc")',
    );
    assertEquals(
        formatWallpaperCss("https://images.unsplash.com/photo-test"),
        'url("https://images.unsplash.com/photo-test")',
    );
    assertEquals(
        formatWallpaperCss("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="),
        'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")',
    );

    // Rejection of unsupported or unsafe sources
    assertEquals(
        formatWallpaperCss("http://insecure.example.com/bg.jpg"),
        "none",
    );
    assertEquals(
        formatWallpaperCss("https://user:pass@example.com/bg.jpg"),
        "none",
    );
    assertEquals(formatWallpaperCss("blob:https://example.com/uuid"), "none");
    assertEquals(
        formatWallpaperCss("data:text/html;base64,PHNjcmlwdD4="),
        "none",
    );
    assertEquals(
        formatWallpaperCss("linear-gradient(red, url('evil.js'))"),
        "none",
    );
});

Deno.test("WallpaperSurface: photo compensation does not leak into gradients or invalid sources", () => {
    const presentation = {
        ...DEFAULT_WALLPAPER_PRESENTATION,
        motion: "ambient" as const,
        motionLevel: "pronounced" as const,
    };
    const image = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
        presentation,
    }));
    const gradient = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "linear-gradient(135deg, #555, #aaa)",
        presentation,
        embedded: true,
    }));
    const rejected = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "http://unsafe.example/image.jpg",
        presentation,
    }));
    assertMatch(image, /data-substrate="image"/);
    assertMatch(image, /--wallpaper-ambient-mix-a:12%/);
    assertMatch(gradient, /data-substrate="gradient"/);
    assertMatch(gradient, /--wallpaper-ambient-mix-a:8.5%/);
    assertMatch(rejected, /data-substrate="canvas"/);
    assertNotMatch(rejected, /wallpaper-surface__image/);
});

Deno.test("WallpaperSurface: focal editing freezes motion without mutating stored intent", () => {
    const presentation = {
        ...DEFAULT_WALLPAPER_PRESENTATION,
        motion: "drift" as const,
        motionLevel: "pronounced" as const,
    };
    const markup = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "https://example.com/photo.jpg",
        presentation,
        motionOverride: "off",
        embedded: true,
    }));
    assertMatch(markup, /data-motion="off"/);
    assertMatch(markup, /--wallpaper-drift-x:0%/);
    assertEquals(presentation.motion, "drift");
});

Deno.test("WallpaperSurface: mono canvas does not retain an accent-colored root", () => {
    const markup = renderToStaticMarkup(createElement(WallpaperSurface, {
        presentation: {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "mono",
            motion: "ambient",
        },
    }));
    assertMatch(markup, /data-tone="mono"/);
    assertMatch(
        markup,
        /--wallpaper-ambient-color:var\(--wallpaper-neutral-light\)/,
    );
    assertNotMatch(markup, /--wallpaper-ambient-color:var\(--accent\)/);
});
