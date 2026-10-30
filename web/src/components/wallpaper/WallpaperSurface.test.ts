import { assertEquals, assertMatch, assertNotMatch } from "@std/assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

Deno.test("WallpaperSurface: substrate classifies image and rejected sources", () => {
    const image = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
    }));
    const rejected = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "http://unsafe.example/image.jpg",
    }));
    const gradient = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "linear-gradient(135deg, #555, #aaa)",
        embedded: true,
    }));
    assertMatch(image, /data-substrate="image"/);
    assertMatch(rejected, /data-substrate="canvas"/);
    assertMatch(gradient, /data-substrate="canvas"/);
    assertNotMatch(rejected, /wallpaper-surface__image/);
    assertNotMatch(gradient, /wallpaper-surface__image/);
});
