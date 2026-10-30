import { assertEquals } from "@std/assert";
import { scanTsxCode as scanTsxWithRegistry } from "./tsx-scanner.ts";
import { FIXTURE_REGISTRY } from "./test-registry.ts";

function scanTsxCode(file: string, code: string) {
    return scanTsxWithRegistry(file, code, FIXTURE_REGISTRY);
}

Deno.test("tsx-scanner - numeric width queries belong only to the shared module", () => {
    const code = `matchMedia("(max-width: 767px)");
        const query = "(width < 640px)";
        matchMedia(MEDIA_QUERIES.belowMedium);`;
    assertEquals(
        scanTsxCode("web/src/app/Shell.tsx", code).map((v) => v.rule),
        ["scattered-media-query", "scattered-media-query"],
    );
    assertEquals(
        scanTsxCode("web/src/design-system/breakpoints.ts", code),
        [],
    );
});

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
                    className="p-4 rounded shadow-none font-medium text-foreground bg-surface"
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
        export function SettingsComponent({ swatchId, hex }: Record<string, unknown>) {
            return (
                <div
                    style={{
                        background: getAccentLight(swatchId),
                        "--item-accent": hex,
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

Deno.test("tsx-scanner - DocumentsWorkspace does not exempt static visuals or other coordinates", () => {
    const code = `
        export function InvalidDocuments() {
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
        scanTsxCode("web/src/features/workspace/DocumentsWorkspace.tsx", code)
            .filter((violation) => violation.rule !== "raw-color")
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

Deno.test("tsx-scanner - inline font-size and radius accept registered Tokens only", () => {
    const code = `
        export function Sample() {
            return (
                <div>
                    <p style={{ fontSize: "var(--font-body-size)" }}>ok</p>
                    <p style={{ fontSize: "var(--font-made-up-size)" }}>bad</p>
                    <i style={{ borderRadius: "var(--radius)" }}>ok</i>
                    <i style={{ borderRadius: "var(--radius-card)" }}>bad</i>
                </div>
            );
        }
    `;
    assertEquals(
        scanTsxCode("web/src/features/Sample.tsx", code).map((v) => [
            v.rule,
            v.value,
        ]),
        [
            [
                "unregistered-font-token",
                'fontSize: "var(--font-made-up-size)"',
            ],
            [
                "unregistered-radius-token",
                'borderRadius: "var(--radius-card)"',
            ],
        ],
    );
});

Deno.test("tsx-scanner - accent fills as Tailwind utilities are rejected, tints and text are not", () => {
    const code = `
        export function Sample() {
            return (
                <div>
                    <i className="bg-primary" />
                    <i className="data-[checked]:bg-accent/50" />
                    <i className="fill-accent" />
                    <i className="bg-accent-soft text-primary border-accent ring-primary" />
                </div>
            );
        }
    `;
    assertEquals(
        scanTsxCode("web/src/features/Sample.tsx", code).map((v) => [
            v.rule,
            v.value,
        ]),
        [
            ["unregistered-accent-fill", "bg-primary"],
            ["unregistered-accent-fill", "data-[checked]:bg-accent/50"],
            ["unregistered-accent-fill", "fill-accent"],
        ],
    );
});

Deno.test("tsx-scanner - equivalent class and style branches retain static violations", () => {
    const code = `
<div className="text-[19px]" />;
<div className={cn("text-[19px]")} />;
<div className={clsx(flag && ["text-[19px]"], {"text-[19px]": flag})} />;
<div style={{fontSize:19}} />;
<div style={flag ? {fontSize:19} : undefined} />;
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line]),
        [
            ["raw-font-size", 2],
            ["raw-font-size", 3],
            ["raw-font-size", 4],
            ["raw-font-size", 4],
            ["raw-font-size", 5],
            ["raw-font-size", 6],
        ],
    );
});

Deno.test("tsx-scanner - resolves scoped constants, spreads and distinct source locations", () => {
    const code = `
const bad = "text-[19px]";
const base = {fontSize: 19, borderRadius: 7};
const good = {fontSize: "var(--font-body-size)"};
<div className={cn(bad, bad)} style={{...base, ...good}} />;
<div style={{...good, ...base}} />;
function Nested(bad: string) {
    return <div className={cn(bad)} />;
}
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line, v.column]),
        [
            ["raw-font-size", 2, 14],
            ["raw-border-radius", 3, 43],
            ["raw-font-size", 3, 25],
        ],
    );
});

Deno.test("tsx-scanner - templates do not invent classes across runtime holes", () => {
    const code = [
        "<div className={`text-[19px] ${runtime} rounded-[7px]`} />;",
        "<div className={`text-[${size}px] text-[19px]${suffix}`} />;",
        '<div className={cn({safe: "text-[19px]"}, ["focus:ring-2", "flex"])} />;',
        '<div className={unknown("text-[19px]")} />;',
    ].join("\\n");
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line]),
        [["raw-font-size", 1], ["raw-border-radius", 1]],
    );
});

Deno.test("tsx-scanner - conditional spreads preserve fallback properties and ignore overwritten values", () => {
    const code = `
<div style={{fontSize:19, ...(flag ? {fontSize:"var(--font-body-size)"} : {})}} />;
<div style={{fontSize:19, ...(flag && {fontSize:"var(--font-body-size)"})}} />;
<div style={{fontSize:19, ...unknown}} />;
<div style={{...unknown, fontSize:19}} />;
<div style={flag ? {fontSize:19} : {fontSize:21}} />;
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line]),
        [
            ["raw-font-size", 2],
            ["raw-font-size", 3],
            ["raw-font-size", 5],
            ["raw-font-size", 6],
            ["raw-font-size", 6],
        ],
    );
});

Deno.test("tsx-scanner - runtime calls, mutable bindings and cycles are never evaluated", () => {
    const code = `
const cycle = cycle;
let mutable = "text-[19px]";
const recurse = [recurse];
<div className={cn(cycle, mutable, recurse, (() => {throw new Error("executed")})())} />;
<div style={getStyle()} />;
`;
    assertEquals(scanTsxCode("web/src/app/AuditProbe.tsx", code), []);
});

Deno.test("tsx-scanner - class composition respects truthiness, object keys and local helper shadowing", () => {
    const code = `
<div className={cn(false && "text-[19px]", {"text-[21px]": false}, {...["text-[23px]"]})} />;
<div className={cn({"text-[25px]": true, ...{"text-[25px]": false}})} />;
<div className={true ? "text-[27px]" : "text-[29px]"} />;
function Nested(cn: Function) { return <div className={cn("text-[31px]")} />; }
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((v) => v.value),
        ["text-[27px]"],
    );
});

Deno.test("tsx-scanner - mutated const objects are unknown rather than frozen snapshots", () => {
    const code = `
const style = {fontSize: 19};
style.fontSize = 20;
const classes = ["text-[19px]"];
classes.push("flex");
<div style={style} className={cn(classes)} />;
`;
    assertEquals(scanTsxCode("web/src/app/AuditProbe.tsx", code), []);
});

Deno.test("tsx-scanner - runtime geometry exceptions stay exact after extraction", () => {
    const cases = [
        [
            "web/src/features/dock/WorkspaceDock.tsx",
            "const style = {transition}; <div style={style} />;",
            [],
        ],
        [
            "web/src/features/app-library/LibraryPopup.tsx",
            "<div style={flag ? {top, maxHeight: `calc(100dvh - ${top}px - var(--space-4))`} : undefined} />;",
            [],
        ],
        [
            "web/src/design-lab/HomeGridLab.tsx",
            "<div style={flag ? {top: blockTop} : undefined} />;",
            [],
        ],
        [
            "web/src/design-lab/WindowLab.tsx",
            "<div style={rect ? {left: rect.x, top: rect.y, width: rect.width, height: rect.height} : undefined} />;",
            [],
        ],
        [
            "web/src/features/windowing/WindowFrame.tsx",
            "<div style={rect ? {left: rect.x, top: rect.y, width: rect.width, height: rect.height} : undefined} />;",
            [],
        ],
        [
            "web/src/features/windowing/WindowFrame.tsx",
            "<div style={{left: 42, top: rect.x, width: rect.height, height: 640}} />;",
            [
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
            ],
        ],
        [
            "web/src/app/Unrelated.tsx",
            "<div style={{left: rect.x, top: rect.y, width: rect.width, height: rect.height}} />;",
            [
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
            ],
        ],
        [
            "web/src/design-lab/WindowLab.tsx",
            "<div style={{left: 42, top: rect.x, width: rect.height, height: 640}} />;",
            [
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
                "inline-visual-style",
            ],
        ],
        [
            "web/src/app/Unrelated.tsx",
            "const style = {transition}; <div style={style} />;",
            ["inline-visual-style"],
        ],
        [
            "web/src/features/dock/WorkspaceDock.tsx",
            "<div style={flag ? {top: 42, fontSize:19} : undefined} />;",
            ["inline-visual-style", "raw-font-size"],
        ],
    ] as const;
    for (const [file, code, rules] of cases) {
        assertEquals(scanTsxCode(file, code).map((v) => v.rule), [...rules]);
    }
});

Deno.test("tsx-scanner - imported composers, wrappers and array spreads retain their semantics", () => {
    const code = `
import {cn as join} from "../lib/utils.ts";
import cx from "clsx";
const bad = ["text-[19px]"] as const;
<div className={(join([...bad], cx(flag ? "rounded-[7px]" : "flex")) satisfies string)} />;
<div className={cn([..."text-[21px]"])} />;
const style = {fontSize:19};
const alias = style;
alias.fontSize = 20;
<div style={style} />;
<div className={cn("focus:ring-2 flex p-4", flag && "bg-[var(--surface)]")} />;
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line]),
        [["raw-font-size", 4], ["raw-border-radius", 5]],
    );
});

Deno.test("tsx-scanner - deeply nested and cyclic objects stop without hiding later inputs", () => {
    const nested = "cn(".repeat(90) + '"text-[19px]"' + ")".repeat(90);
    const code = `
const a = { ...b };
const b = { ...a };
<div style={a} className={${nested}} />;
<div className={cn("text-[21px]")} />;
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line]),
        [["raw-font-size", 5]],
    );
});

Deno.test("tsx-scanner - immutable style value aliases preserve tokens and source locations", () => {
    const code = `
const fontSize = "var(--font-body-size)";
const radius = 7;
<div style={{fontSize, borderRadius: (radius as number)}} />;
`;
    assertEquals(
        scanTsxCode("web/src/app/AuditProbe.tsx", code).map((
            v,
        ) => [v.rule, v.line, v.column]),
        [["raw-border-radius", 3, 16]],
    );
});
