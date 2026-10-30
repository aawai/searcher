import { assertEquals } from "@std/assert";
import { validateImageBytes } from "./validator.ts";

Deno.test("validateImageBytes accepts PNG, JPEG, WebP, AVIF, ICO and safe SVG, rejects HTML", () => {
    // 1. PNG
    const png = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0x00,
        0x00,
        0x00,
        0x0d,
    ]);
    const resPng = validateImageBytes(png);
    assertEquals(resPng.valid, true);
    if (resPng.valid) assertEquals(resPng.contentType, "image/png");

    // 2. JPEG
    const jpeg = new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe0,
        0x00,
        0x10,
        0x4a,
        0x46,
        0x49,
        0x46,
        0x00,
        0x01,
    ]);
    const resJpeg = validateImageBytes(jpeg);
    assertEquals(resJpeg.valid, true);
    if (resJpeg.valid) assertEquals(resJpeg.contentType, "image/jpeg");

    // 3. SVG
    const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="5"/></svg>',
    );
    const resSvg = validateImageBytes(svg);
    assertEquals(resSvg.valid, true);
    if (resSvg.valid) assertEquals(resSvg.contentType, "image/svg+xml");

    // 4. ICO
    const ico = new Uint8Array([
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x10,
        0x10,
        0x00,
        0x00,
        0x01,
        0x00,
    ]);
    const resIco = validateImageBytes(ico);
    assertEquals(resIco.valid, true);
    if (resIco.valid) assertEquals(resIco.contentType, "image/x-icon");

    // WebP: RIFF container with WEBP form type
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBP");
    const resWebp = validateImageBytes(webp);
    assertEquals(resWebp.valid, true);
    if (resWebp.valid) assertEquals(resWebp.contentType, "image/webp");

    // AVIF: ISOBMFF ftyp box with avif major brand
    const avif = new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x1c,
        ...new TextEncoder().encode("ftypavif"),
        0x00,
        0x00,
        0x00,
        0x00,
    ]);
    const resAvif = validateImageBytes(avif);
    assertEquals(resAvif.valid, true);
    if (resAvif.valid) assertEquals(resAvif.contentType, "image/avif");

    // 5. Corrupt / HTML rejected
    const html = new TextEncoder().encode(
        "<!DOCTYPE html><html><body>Login</body></html>",
    );
    const resHtml = validateImageBytes(html);
    assertEquals(resHtml.valid, false);
});
