import { assertEquals } from "@std/assert";
import { scanTsxCode } from "./tsx-scanner.ts";
import { FIXTURE_REGISTRY } from "./test-registry.ts";

Deno.test("TSX raw colors follow static aliases, spreads, and conditional values", () => {
    const code = `const primary = "#ff00ff";
const common = { color: primary };
const View = () => <div
    style={{ ...common, background: flag ? "linear-gradient(red, transparent)" : "var(--surface)", borderColor: "rgb(0 0 0)" }}
/>;`;
    const violations = scanTsxCode(
        "web/src/app/ColorProbe.tsx",
        code,
        FIXTURE_REGISTRY,
    )
        .filter((violation) => violation.rule === "raw-color");
    assertEquals(violations.map(({ property, line }) => ({ property, line })), [
        { property: "color", line: 1 },
        { property: "background", line: 4 },
        { property: "borderColor", line: 4 },
    ]);
});

Deno.test("TSX color checks ignore tokens, transparency, and non-color strings", () => {
    const code = `const foreground = "var(--foreground)";
const view = <div style={{
    color: flag ? foreground : "currentColor",
    background: 'url("/images/red-#fff.svg") transparent',
    content: '"red #fff"',
}} />;`;
    const violations = scanTsxCode(
        "web/src/app/ColorProbe.tsx",
        code,
        FIXTURE_REGISTRY,
    ).filter((violation) => violation.rule === "raw-color");
    assertEquals(violations, []);
});

Deno.test("TSX swatch owners do not exempt arbitrary static colors", () => {
    const code = `const view = <div style={{ "--item-accent": "#ff00ff" }} />;`;
    const violations = scanTsxCode(
        "web/src/app/SettingsPage.tsx",
        code,
        FIXTURE_REGISTRY,
    ).filter((violation) => violation.rule === "raw-color");
    assertEquals(violations.map((violation) => violation.property), [
        "--item-accent",
    ]);
});

Deno.test("TSX arbitrary color utilities follow composed static variants", () => {
    const code = `const view = <div className={cn(
    "bg-[red]",
    enabled && "hover:text-[#abc]",
    { "focus:bg-[hsl(210_50%_50%)]": enabled },
)} />;`;
    const violations = scanTsxCode(
        "web/src/app/ColorProbe.tsx",
        code,
        FIXTURE_REGISTRY,
    ).filter((violation) => violation.rule === "raw-color");
    assertEquals(violations.map(({ value, line }) => [value, line]), [
        ["bg-[red]", 2],
        ["hover:text-[#abc]", 3],
        ["focus:bg-[hsl(210_50%_50%)]", 4],
    ]);
});

Deno.test("engine brand SVG colors are restricted to the registered owner and fill", () => {
    const code =
        `<svg><path fill="#4285F4" /><path stroke="#4285F4" /><path fill="#ff00ff" /></svg>`;
    const owner = scanTsxCode(
        "web/src/components/searcher/EngineSelector.tsx",
        code,
        FIXTURE_REGISTRY,
    ).filter((violation) => violation.rule === "raw-color");
    assertEquals(owner.map((violation) => violation.property), [
        "stroke",
        "fill",
    ]);
    const unrelated = scanTsxCode(
        "web/src/app/Other.tsx",
        code,
        FIXTURE_REGISTRY,
    ).filter((violation) => violation.rule === "raw-color");
    assertEquals(unrelated.map((violation) => violation.property), [
        "fill",
        "stroke",
        "fill",
    ]);
});
