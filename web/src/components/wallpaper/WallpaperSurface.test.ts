import { assertEquals } from "@std/assert";
import { formatWallpaperCss } from "./WallpaperSurface.tsx";

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
