import { assertEquals, assertThrows } from "@std/assert";
import { sanitizeSvg } from "./svg.ts";

Deno.test("sanitizeSvg strips script tags, event handlers, and javascript: links", () => {
    const malicious = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <script>alert('xss')</script>
            <circle cx="50" cy="50" r="40" fill="red" onclick="alert(1)" onload="evil()" />
            <a href="javascript:alert(2)"><text x="10" y="20">Click me</text></a>
            <foreignObject width="100" height="50">
                <iframe src="https://evil.com"></iframe>
            </foreignObject>
        </svg>
    `;

    const clean = sanitizeSvg(malicious);
    assertEquals(clean.includes("<script"), false);
    assertEquals(clean.includes("onclick"), false);
    assertEquals(clean.includes("onload"), false);
    assertEquals(clean.includes("javascript:"), false);
    assertEquals(clean.includes("<foreignObject"), false);
    assertEquals(clean.includes("<iframe"), false);
    assertEquals(clean.includes("<circle"), true);
    assertEquals(clean.includes('fill="red"'), true);
});

Deno.test("sanitizeSvg rejects non-SVG text or empty input", () => {
    assertThrows(() => sanitizeSvg("not an svg"));
    assertThrows(() => sanitizeSvg("<html><body>test</body></html>"));
});
