import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import {
    Illustration,
    ILLUSTRATION_NAMES,
    isIllustrationName,
} from "./Illustration.tsx";

Deno.test("Illustration: renders all 8 scenarios and legacy alias in botanical etching style without AppState", () => {
    for (const name of [...ILLUSTRATION_NAMES, "auth-or-error"] as const) {
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
        assertEquals(html.includes("ill-overprint"), true);
        assertEquals(html.includes("ill-hatching"), true);
        assertEquals(html.includes("ill-calligraphy"), true);
    }
});

Deno.test("Illustration: includes interactive hooks for not-found, no-results, and empty-documents", () => {
    const notFoundHtml = ReactDOMServer.renderToString(
        <Illustration name="not-found" />,
    );
    assertEquals(notFoundHtml.includes("ill-compass-needle"), true);

    const noResultsHtml = ReactDOMServer.renderToString(
        <Illustration name="no-results" />,
    );
    assertEquals(noResultsHtml.includes("ill-loupe-group"), true);
    assertEquals(noResultsHtml.includes("ill-critter-group"), true);

    const docsHtml = ReactDOMServer.renderToString(
        <Illustration name="empty-documents" />,
    );
    assertEquals(docsHtml.includes("ill-literati-seal"), true);
});

Deno.test("Illustration: defaults to botanical without AppState provider", () => {
    const html = ReactDOMServer.renderToString(
        <Illustration name="empty-documents" />,
    );
    assertEquals(html.includes('data-illustration-style="botanical"'), true);
    assertEquals(html.includes('data-size="md"'), true);
});

Deno.test("Illustration: isIllustrationName validates 8 standard names and legacy alias", () => {
    for (const name of ILLUSTRATION_NAMES) {
        assertEquals(isIllustrationName(name), true);
    }
    assertEquals(isIllustrationName("auth-or-error"), true);
    assertEquals(isIllustrationName("unknown-scene"), false);
});
