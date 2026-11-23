import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import {
    Illustration,
    ILLUSTRATION_NAMES,
    isIllustrationName,
} from "./Illustration.tsx";

Deno.test("Illustration: renders all 6 scenarios in botanical style safely without AppState", () => {
    for (const name of ILLUSTRATION_NAMES) {
        const html = ReactDOMServer.renderToString(
            <Illustration name={name} size="sm" />,
        );
        assertEquals(html.includes('aria-hidden="true"'), true);
        assertEquals(html.includes(`data-illustration="${name}"`), true);
        assertEquals(
            html.includes('data-illustration-style="botanical"'),
            true,
        );
        assertEquals(html.includes('data-size="sm"'), true);
        assertEquals(html.includes("system-illustration"), true);
    }
});

Deno.test("Illustration: defaults to botanical without AppState provider", () => {
    const html = ReactDOMServer.renderToString(
        <Illustration name="empty-documents" />,
    );
    assertEquals(html.includes('data-illustration-style="botanical"'), true);
    assertEquals(html.includes('data-size="md"'), true);
});

Deno.test("Illustration: isIllustrationName validates known names", () => {
    assertEquals(isIllustrationName("empty-ask"), true);
    assertEquals(isIllustrationName("unknown-scene"), false);
});
