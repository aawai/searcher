import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { resolveIllustrationStyle } from "@shared/contracts.ts";
import {
    Illustration,
    ILLUSTRATION_NAMES,
    isIllustrationName,
} from "./Illustration.tsx";

Deno.test("Illustration: renders all 6 scenarios across glass and botanical styles safely without AppState", () => {
    for (const style of ["glass", "botanical"] as const) {
        for (const name of ILLUSTRATION_NAMES) {
            const html = ReactDOMServer.renderToString(
                <Illustration name={name} styleOverride={style} size="sm" />,
            );
            assertEquals(html.includes('aria-hidden="true"'), true);
            assertEquals(html.includes(`data-illustration="${name}"`), true);
            assertEquals(
                html.includes(`data-illustration-style="${style}"`),
                true,
            );
            assertEquals(html.includes('data-size="sm"'), true);
            assertEquals(html.includes("system-illustration"), true);
        }
    }
});

Deno.test("Illustration: defaults to glass without AppState provider", () => {
    const html = ReactDOMServer.renderToString(
        <Illustration name="empty-documents" />,
    );
    assertEquals(html.includes('data-illustration-style="glass"'), true);
    assertEquals(html.includes('data-size="md"'), true);
});

Deno.test("Illustration: resolveIllustrationStyle links auto mode with botanicalScene", () => {
    assertEquals(resolveIllustrationStyle("auto", null), "glass");
    assertEquals(resolveIllustrationStyle("auto", "ginkgo"), "botanical");
    assertEquals(resolveIllustrationStyle("glass", "ginkgo"), "glass");
    assertEquals(resolveIllustrationStyle("botanical", null), "botanical");
});

Deno.test("Illustration: isIllustrationName validates known names", () => {
    assertEquals(isIllustrationName("empty-ask"), true);
    assertEquals(isIllustrationName("unknown-scene"), false);
});
