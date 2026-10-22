import { assertEquals } from "@std/assert";
import { scanTsxCode } from "./tsx-scanner.ts";

Deno.test("tsx-scanner - detects raw box-shadow in style and className", () => {
    const code = `
        export function BadBoxShadow() {
            return (
                <div style={{ boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)" }}>
                    <span className="shadow-[0_10px_20px_rgba(0,0,0,0.2)]">Card</span>
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const boxViolations = violations.filter((v) => v.rule === "raw-box-shadow");
    assertEquals(boxViolations.length, 2);
    assertEquals(boxViolations[0].property, "boxShadow");
    assertEquals(boxViolations[1].property, "className");
});

Deno.test("tsx-scanner - detects raw font-size in style and className", () => {
    const code = `
        export function BadFontSize() {
            return (
                <div>
                    <h1 style={{ fontSize: "20px" }}>Title</h1>
                    <p style={{ fontSize: 14 }}>Body</p>
                    <span className="text-[13px] text-muted">Muted</span>
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const fontViolations = violations.filter((v) => v.rule === "raw-font-size");
    assertEquals(fontViolations.length, 3);
});

Deno.test("tsx-scanner - detects raw border-radius in style and className", () => {
    const code = `
        export function BadRadius() {
            return (
                <div>
                    <div style={{ borderRadius: "8px" }} />
                    <div style={{ borderRadius: 12 }} />
                    <button className="rounded-[10px]">Button</button>
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const radiusViolations = violations.filter((v) =>
        v.rule === "raw-border-radius"
    );
    assertEquals(radiusViolations.length, 3);
});

Deno.test("tsx-scanner - detects raw spacing literals in style and className", () => {
    const code = `
        export function BadSpacing() {
            return (
                <div style={{ padding: "16px", margin: "0 auto 24px", gap: 12 }}>
                    <p className="p-[14px] mt-[18px]">Text</p>
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const spacingViolations = violations.filter((v) =>
        v.rule === "raw-spacing-literal"
    );
    assertEquals(spacingViolations.length, 5); // padding, margin, gap, p-[14px], mt-[18px]
});

Deno.test("tsx-scanner - detects forbidden TSX inline visual styles", () => {
    const code = `
        export function BadInlineStyles() {
            return (
                <div style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                    Text
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const visualViolations = violations.filter((v) =>
        v.rule === "inline-visual-style"
    );
    assertEquals(visualViolations.length, 3); // background, color, border
});

Deno.test("tsx-scanner - detects arbitrary Tailwind classes", () => {
    const code = `
        export function BadTailwind() {
            return (
                <div className="bg-[#1e293b] text-[#ffffff] border-[#e2e8f0]">
                    Bad
                </div>
            );
        }
    `;
    const violations = scanTsxCode("test/Sample.tsx", code);
    const twViolations = violations.filter((v) =>
        v.rule === "arbitrary-tailwind"
    );
    assertEquals(twViolations.length, 3);
});

Deno.test("tsx-scanner - allows valid tokens, semantic classes, and runtime exceptions on designated owners", () => {
    // SearchHome owns drag transform
    const searchHomeCode = `
        export function SearchHomeComponent({ transform, isDragging }: Record<string, unknown>) {
            return (
                <div
                    className="p-4 rounded-lg shadow-none text-sm text-foreground bg-surface"
                    style={{
                        transform: CSS.Transform.toString(transform),
                        zIndex: isDragging ? 50 : undefined,
                        opacity: isDragging ? 0.5 : 1,
                        borderRadius: "var(--radius)",
                        fontSize: "var(--font-body-size)",
                    }}
                >
                    Valid
                </div>
            );
        }
    `;
    const shViolations = scanTsxCode(
        "web/src/app/SearchHome.tsx",
        searchHomeCode,
    );
    assertEquals(shViolations.length, 0);

    // SettingsPage owns swatch preview
    const settingsCode = `
        export function SettingsComponent({ swatchId }: Record<string, unknown>) {
            return (
                <div
                    style={{
                        background: getAccentLight(swatchId),
                        "--item-accent": "#1d4ed8",
                    }}
                />
            );
        }
    `;
    const setViolations = scanTsxCode(
        "web/src/app/SettingsPage.tsx",
        settingsCode,
    );
    assertEquals(setViolations.length, 0);

    // Unrelated component using swatch or column layout geometry is DENIED
    const unrelatedCode = `
        export function UnrelatedComponent({ swatchId, columnLayout }: Record<string, unknown>) {
            return (
                <div
                    style={{
                        background: getAccentLight(swatchId),
                        left: columnLayout.left + "px",
                    }}
                />
            );
        }
    `;
    const unrelViolations = scanTsxCode(
        "web/src/components/Unrelated.tsx",
        unrelatedCode,
    );
    assertEquals(unrelViolations.length, 2);
});

Deno.test("tsx-scanner - NotesWorkspace does not exempt static visuals or other coordinates", () => {
    const code = `
        export function InvalidNotes() {
            return <div style={{
                width: 240,
                height: 320,
                left: placement.x,
                position: "absolute",
                transform: "translate3d(0, 0, 0)",
                visibility: "hidden",
                color: "#ff0000",
                gap: 12,
                padding: 16,
                borderRadius: 10,
            }}>
                <div style={{ width: placement?.width ?? "240px" }} />
            </div>;
        }
    `;
    assertEquals(
        scanTsxCode("web/src/features/workspace/NotesWorkspace.tsx", code)
            .map((violation) => [violation.property, violation.rule]),
        [
            ["width", "inline-visual-style"],
            ["height", "inline-visual-style"],
            ["left", "inline-visual-style"],
            ["position", "inline-visual-style"],
            ["transform", "inline-visual-style"],
            ["visibility", "inline-visual-style"],
            ["color", "inline-visual-style"],
            ["gap", "raw-spacing-literal"],
            ["padding", "raw-spacing-literal"],
            ["borderRadius", "raw-border-radius"],
            ["width", "inline-visual-style"],
        ],
    );
});

Deno.test("tsx-scanner - rejects static numeric z-index but allows tokens and runtime order", () => {
    const code = `
        export function LayerExamples({ layout, active }: Record<string, unknown>) {
            return <>
                <div style={{ zIndex: 12 }} />
                <div style={{ zIndex: -1 }} />
                <div style={{ zIndex: "50" }} />
                <div style={{ zIndex: "var(--elevation-modal)" }} />
                <div style={{ zIndex: layout.zIndex }} />
                <div style={{ zIndex: active ? layout.front : layout.back }} />
                <div className="z-10 -z-20 hover:z-30 z-auto z-[var(--elevation-modal)]" />
            </>;
        }
    `;
    const violations = scanTsxCode("web/src/features/LayerExamples.tsx", code);
    assertEquals(
        violations.map((violation) => [violation.rule, violation.value]),
        [
            ["raw-z-index", "zIndex: 12"],
            ["raw-z-index", "zIndex: -1"],
            ["raw-z-index", 'zIndex: "50"'],
            ["raw-z-index", "z-10"],
            ["raw-z-index", "-z-20"],
            ["raw-z-index", "hover:z-30"],
        ],
    );
});

Deno.test("tsx-scanner - prevents nonstandard control icon sizes, including conditional branches", () => {
    const code = `
        const view = <>
            <Search size={13} />
            <Icon size={18} />
            <ArrowUpRight size={22} />
            <Check size={compact ? 12 : 18} />
            <X size="15" />
        </>;
    `;
    assertEquals(
        scanTsxCode("web/src/app/SettingsPage.tsx", code).map((violation) => [
            violation.rule,
            violation.property,
            violation.value,
        ]),
        [
            ["nonstandard-icon-size", "size", "13"],
            ["nonstandard-icon-size", "size", "18"],
            ["nonstandard-icon-size", "size", "22"],
            ["nonstandard-icon-size", "size", "12"],
            ["nonstandard-icon-size", "size", "18"],
            ["nonstandard-icon-size", "size", "15"],
        ],
    );
});

Deno.test("tsx-scanner - keeps standard glyphs and native control geometry valid", () => {
    const controls = `
        const view = <>
            <Search size={14} /><Search size={16} /><Search size={20} />
            <Search size="1em" className="icon-md" />
            <Brand size="1em" className="launcher-folder-empty-icon" />
            <input size={30} />
        </>;
    `;
    assertEquals(scanTsxCode("web/src/app/SettingsPage.tsx", controls), []);
});

Deno.test("tsx-scanner - rejects CSS variables in SVG geometry attributes", () => {
    const code = `
        const view = <>
            <Search size="var(--icon-md)" />
            <svg width="var(--icon-md)" height={"var(--icon-lg)"} />
        </>;
    `;
    assertEquals(
        scanTsxCode("web/src/app/SettingsPage.tsx", code).map((violation) => [
            violation.rule,
            violation.property,
            violation.value,
        ]),
        [
            ["svg-attribute-css-variable", "size", "var(--icon-md)"],
            ["svg-attribute-css-variable", "width", "var(--icon-md)"],
            ["svg-attribute-css-variable", "height", "var(--icon-lg)"],
        ],
    );
});
