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

    // Built-in botanical scenes render via canvas, not CSS url()
    assertEquals(formatWallpaperCss("scene:botanical:auto"), "none");
    assertEquals(formatWallpaperCss("scene:botanical:ginkgo"), "none");

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
    const scene = renderToStaticMarkup(createElement(WallpaperSurface, {
        botanicalScene: "ginkgo",
    }));
    const combined = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
        botanicalScene: "plum",
    }));
    const disabledScene = renderToStaticMarkup(createElement(WallpaperSurface, {
        botanicalScene: "ginkgo",
        disableScene: true,
    }));
    assertMatch(image, /data-substrate="image"/);
    assertMatch(rejected, /data-substrate="canvas"/);
    assertMatch(gradient, /data-substrate="canvas"/);
    assertMatch(scene, /data-substrate="canvas"/);
    assertMatch(scene, /data-wallpaper-scene="ginkgo"/);
    assertNotMatch(scene, /wallpaper-surface__image/);
    assertMatch(combined, /data-substrate="image"/);
    assertMatch(combined, /data-wallpaper-scene="plum"/);
    assertMatch(combined, /wallpaper-surface__image/);
    assertNotMatch(disabledScene, /data-wallpaper-scene/);
    assertNotMatch(rejected, /wallpaper-surface__image/);
    assertNotMatch(gradient, /wallpaper-surface__image/);
    assertNotMatch(image, /wallpaper-surface__mask/);
    assertNotMatch(image, /--wallpaper-mask/);

    const derivedSurface = renderToStaticMarkup(
        createElement(WallpaperSurface, {
            source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
            derived: true,
        }),
    );
    assertMatch(derivedSurface, /wallpaper-surface__mask/);

    const ambientSurface = renderToStaticMarkup(
        createElement(WallpaperSurface, {
            source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
            mode: "ambient",
        }),
    );
    assertMatch(ambientSurface, /data-substrate="image"/);
    assertMatch(ambientSurface, /data-wallpaper-mode="ambient"/);
    assertMatch(ambientSurface, /wallpaper-surface__image/);

    const canvasSurface = renderToStaticMarkup(createElement(WallpaperSurface, {
        source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
        mode: "canvas",
        backdropPolarity: "light",
        botanicalScene: "plum",
    }));
    assertMatch(canvasSurface, /data-wallpaper-mode="canvas"/);
    assertMatch(canvasSurface, /data-substrate="canvas"/);
    assertMatch(canvasSurface, /data-wallpaper-scene="plum"/);
    assertNotMatch(canvasSurface, /wallpaper-surface__image/);
    assertNotMatch(canvasSurface, /data-native-dark/);

    const imagePolaritySurface = renderToStaticMarkup(
        createElement(WallpaperSurface, {
            source: "/api/wallpaper/12345678-1234-1234-1234-123456789abc",
            mode: "image",
            backdropPolarity: "light",
        }),
    );
    assertMatch(imagePolaritySurface, /data-substrate="image"/);
    assertNotMatch(imagePolaritySurface, /data-native-dark/);
});
