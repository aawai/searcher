import { assert, assertEquals } from "@std/assert";

const publicDir = new URL("../../public/", import.meta.url);
const manifest = JSON.parse(
    await Deno.readTextFile(new URL("manifest.webmanifest", publicDir)),
);
const tokens = await Deno.readTextFile(
    new URL("../design-system/tokens.css", import.meta.url),
);
const indexHtml = await Deno.readTextFile(
    new URL("../../index.html", import.meta.url),
);

function background(selector: string): string {
    const start = tokens.indexOf(`${selector} {`);
    assert(start >= 0, selector);
    const block = tokens.slice(start, tokens.indexOf("}", start));
    const value = block.match(/--background:\s*([^;]+);/)?.[1];
    assert(value, `${selector} --background`);
    return value.trim();
}

function pngSize(bytes: Uint8Array): string {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return `${view.getUint32(16)}x${view.getUint32(20)}`;
}

Deno.test("manifest: launch colours match the light page background token", () => {
    const light = background(":root");
    assertEquals(manifest.theme_color, light);
    assertEquals(manifest.background_color, light);
});

Deno.test("index.html: first-paint theme-color matches each theme's background token", () => {
    const metas = [...indexHtml.matchAll(
        /<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: (light|dark)\)"/g,
    )].map(([, color, scheme]) => [scheme, color]);
    assertEquals(Object.fromEntries(metas), {
        light: background(":root"),
        dark: background('[data-theme="dark"]'),
    });
});

Deno.test("manifest: installable with existing icons of the declared sizes", async () => {
    assertEquals(manifest.start_url, "/");
    assertEquals(manifest.display, "standalone");
    const declared = manifest.icons as {
        src: string;
        sizes: string;
        type: string;
        purpose: string;
    }[];
    for (const icon of declared) {
        const bytes = await Deno.readFile(new URL(`.${icon.src}`, publicDir));
        if (icon.type === "image/png") {
            assertEquals(pngSize(bytes), icon.sizes, icon.src);
        }
    }
    // Chromium needs any-purpose 192 and 512 PNG icons to offer installation.
    for (const size of ["192x192", "512x512"]) {
        assert(
            declared.some((icon) =>
                icon.sizes === size && icon.purpose === "any" &&
                icon.type === "image/png"
            ),
            size,
        );
    }
});
