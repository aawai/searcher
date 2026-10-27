import { assertEquals, assertThrows } from "@std/assert";
import { loadVisualRegistry, parseVisualRegistry } from "./registry.ts";
import { FIXTURE_MARKDOWN, FIXTURE_REGISTRY } from "./test-registry.ts";
import { scanTsxCode } from "./tsx-scanner.ts";
import { scanCssCode } from "./css-scanner.ts";

Deno.test("tailwind-scale - audit probe rejects unregistered text-xl and gap-7", async () => {
    const registry = await loadVisualRegistry();
    const violations = scanTsxCode(
        "web/src/app/AuditProbe.tsx",
        '<div className="text-xl gap-7"/>',
        registry,
    );
    assertEquals(
        violations.map((v) => [v.rule, v.property, v.value]),
        [
            ["unregistered-tailwind-visual", "className", "text-xl"],
            ["unregistered-tailwind-visual", "className", "gap-7"],
        ],
    );
});

Deno.test("tailwind-scale - registry table fails closed on missing, duplicate, or raw-value entries", () => {
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace(
                    "**Tailwind 视觉工具类登记。**",
                    "**未登记工具类。**",
                ),
            ),
        Error,
        "marker",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace("`gap-2`", "gap-2"),
            ),
        Error,
        "code span",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace("`var(--space-2)`", "`8px`"),
            ),
        Error,
        "Invalid Tailwind visual registry row",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace(
                    "`var(--radius)`",
                    "`var(--radius-unregistered)`",
                ),
            ),
        Error,
        "Invalid Tailwind visual registry row",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace(
                    "| `gap-3`           | 间距 | `var(--space-3)`           | 行       |",
                    "| `gap-2`           | 间距 | `var(--space-2)`           | 重复     |",
                ),
            ),
        Error,
        "Invalid Tailwind visual registry row",
    );
    assertThrows(
        () =>
            parseVisualRegistry(
                FIXTURE_MARKDOWN.replace(
                    "| `font-normal`     | 字重 | `var(--font-body-weight)`  | 正文     |",
                    "| `text-sm`         | 字号 | `var(--font-body-size)`    | 禁止映射 |",
                ),
            ),
        Error,
        "Invalid Tailwind visual registry row",
    );
});

Deno.test("tailwind token bindings reject missing, duplicate, or mismatched owners", () => {
    const registry = {
        ...FIXTURE_REGISTRY,
        tailwindVisuals: FIXTURE_REGISTRY.tailwindVisuals.filter(
            (entry) => entry.utility === "gap-3",
        ),
    };
    const theme = `@theme inline {
        --breakpoint-sm: 640px;
        --breakpoint-md: 768px;
        --breakpoint-lg: 1024px;
    }`;
    const file = "web/src/design-system/tokens.css";
    const options = { verifyTokenBindings: true };
    const valid = `${theme} @utility gap-3 { gap: var(--space-3); }`;
    assertEquals(scanCssCode(file, valid, registry, options), []);
    for (
        const css of [
            theme,
            `${theme} @utility gap-3 { gap: var(--space-1); }`,
            `${valid} @utility gap-3 { gap: var(--space-3); }`,
        ]
    ) {
        assertEquals(
            scanCssCode(file, css, registry, options)
                .filter((v) => v.rule === "unregistered-tailwind-visual")
                .map((v) => v.property),
            ["@utility gap-3"],
        );
    }
    assertEquals(
        scanCssCode(file, valid.replace("640px", "641px"), registry, options)
            .filter((v) => v.rule === "unregistered-breakpoint")
            .map((v) => v.property),
        ["--breakpoint-sm"],
    );
});

Deno.test("tailwind-scale - rejects unregistered visual scale utilities across typography, spacing, radius, shadow, sizing, and palette", async () => {
    const registry = await loadVisualRegistry();
    const code = `
        export function BadScaleSample() {
            return (
                <div className="text-xs text-sm text-base text-lg text-xl text-2xl text-sm/5 leading-tight leading-6 tracking-wide font-bold font-light font-serif">
                    <div className="gap-0.5 gap-1.5 gap-5 gap-7 p-2 p-8 px-4 py-2 mt-3 pt-1 -mt-2 space-x-2 space-y-4" />
                    <div className="rounded-md rounded-xl rounded-2xl rounded-3xl rounded-t-lg rounded-[var(--radius-unregistered)]" />
                    <div className="shadow shadow-sm shadow-md shadow-lg shadow-xl shadow-inner drop-shadow inset-shadow-sm z-[var(--not-elevation)]" />
                    <div className="max-w-sm max-w-md w-10 h-8 size-4 max-h-[calc(100dvh-2rem)] [&>svg]:size-[var(--icon-sm)] icon-xl" />
                    <div className="bg-red-500 text-slate-400 border-blue-300" />
                    <div className="text-[var(--font-unregistered)] text-[length:var(--font-unregistered)]" />
                </div>
            );
        }
    `;
    const violations = scanTsxCode(
        "web/src/app/BadScaleSample.tsx",
        code,
        registry,
    );
    const expected = [
        "text-xs",
        "text-sm",
        "text-base",
        "text-lg",
        "text-xl",
        "text-2xl",
        "text-sm/5",
        "leading-tight",
        "leading-6",
        "tracking-wide",
        "font-bold",
        "font-light",
        "font-serif",
        "gap-0.5",
        "gap-1.5",
        "gap-5",
        "gap-7",
        "p-2",
        "p-8",
        "px-4",
        "py-2",
        "mt-3",
        "pt-1",
        "-mt-2",
        "space-x-2",
        "space-y-4",
        "rounded-md",
        "rounded-xl",
        "rounded-2xl",
        "rounded-3xl",
        "rounded-t-lg",
        "rounded-[var(--radius-unregistered)]",
        "shadow",
        "shadow-sm",
        "shadow-md",
        "shadow-lg",
        "shadow-xl",
        "shadow-inner",
        "drop-shadow",
        "inset-shadow-sm",
        "z-[var(--not-elevation)]",
        "max-w-sm",
        "max-w-md",
        "w-10",
        "h-8",
        "size-4",
        "max-h-[calc(100dvh-2rem)]",
        "[&>svg]:size-[var(--icon-sm)]",
        "icon-xl",
        "bg-red-500",
        "text-slate-400",
        "border-blue-300",
        "text-[var(--font-unregistered)]",
        "text-[length:var(--font-unregistered)]",
    ];
    assertEquals(
        violations.map((v) => [v.rule, v.value]),
        expected.map((cls) => ["unregistered-tailwind-visual", cls]),
    );
});

Deno.test("tailwind-scale - enforces registered breakpoint variants and diagnoses unknown responsive prefixes across static expressions", async () => {
    const registry = await loadVisualRegistry();
    const code = `
        import { cn } from "../lib/utils.ts";
        const branchClass = flag ? "xl:grid-cols-3" : "sm:grid-cols-2";
        export function ResponsiveProbe() {
            return (
                <div
                    className={cn(
                        "grid grid-cols-1 sm:grid-cols-2 md:flex-row lg:grid-cols-3 sm:gap-2",
                        branchClass,
                        flag && ["2xl:flex", "hover:text-xl", "focus-visible:rounded-2xl"],
                        {
                            "max-sm:hidden": cond,
                            "min-[900px]:flex": cond,
                            "@sm:flex": cond,
                            "!gap-7": cond,
                        },
                    )}
                />
            );
        }
    `;
    const violations = scanTsxCode(
        "web/src/app/ResponsiveProbe.tsx",
        code,
        registry,
    );
    assertEquals(
        violations.map((v) => [v.rule, v.value]),
        [
            ["unregistered-tailwind-visual", "xl:grid-cols-3"],
            ["unregistered-tailwind-visual", "2xl:flex"],
            ["unregistered-tailwind-visual", "hover:text-xl"],
            ["unregistered-tailwind-visual", "focus-visible:rounded-2xl"],
            ["unregistered-tailwind-visual", "max-sm:hidden"],
            ["unregistered-tailwind-visual", "min-[900px]:flex"],
            ["unregistered-tailwind-visual", "@sm:flex"],
            ["unregistered-tailwind-visual", "!gap-7"],
        ],
    );

    // Removing 640 from registry breakpoints makes sm:* unregistered
    const withoutSmRegistry = parseVisualRegistry(
        FIXTURE_MARKDOWN.replace("| `640` | 小 | 表单 | 表单 | `sm` |\n", ""),
    );
    const smViolations = scanTsxCode(
        "web/src/app/ResponsiveProbe.tsx",
        '<div className="sm:grid-cols-2 md:grid-cols-2" />',
        withoutSmRegistry,
    );
    assertEquals(
        smViolations.map((v) => [v.rule, v.value]),
        [["unregistered-tailwind-visual", "sm:grid-cols-2"]],
    );
});

Deno.test("responsive names and theme values follow the registered boundaries", () => {
    const registry = parseVisualRegistry(
        FIXTURE_MARKDOWN.replace("`640`", "`600`"),
    );
    assertEquals(
        scanTsxCode(
            "web/src/app/Probe.tsx",
            '<div className="sm:grid-cols-2" />',
            registry,
        ),
        [],
    );
    const tokens = `@theme inline {
        --breakpoint-sm: 600px;
        --breakpoint-md: 768px;
        --breakpoint-lg: 1024px;
    }`;
    assertEquals(
        scanCssCode(
            "web/src/design-system/tokens.css",
            tokens,
            { ...registry, tailwindVisuals: [] },
            { verifyTokenBindings: true },
        ),
        [],
    );
});

Deno.test("tailwind-scale - allows registered Token-backed visual utilities, layout/state classes, and migrated consumers", async () => {
    const registry = await loadVisualRegistry();
    const validCode = `
        import { cn } from "../lib/utils.ts";
        export function ValidScaleSample() {
            return (
                <div
                    className={cn(
                        "flex inline-flex flex-col flex-wrap flex-1 shrink-0 items-center justify-between justify-end",
                        "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3",
                        "relative w-full min-w-0 min-h-0 overflow-x-auto overflow-y-auto",
                        "sr-only hidden block break-words text-center select-none cursor-pointer outline-none",
                        "disabled:pointer-events-none disabled:opacity-50 animate-spin fill-current",
                        "font-normal font-medium font-semibold font-sans font-mono",
                        "m-0 p-0 gap-1 gap-2 gap-3 gap-4 p-4 sm:gap-2 mx-auto",
                        "rounded-none rounded-sm rounded-control rounded-input rounded rounded-lg rounded-full",
                        "shadow-none z-auto z-[var(--elevation-modal)]",
                        "icon-sm icon-md icon-lg",
                        "bg-[var(--surface-solid)] text-[var(--foreground)] text-[var(--muted)]",
                    )}
                />
            );
        }
    `;
    assertEquals(
        scanTsxCode("web/src/app/ValidScaleSample.tsx", validCode, registry),
        [],
    );
});

Deno.test("token-valued arbitrary utilities cannot bypass registered semantic roles", () => {
    const code =
        `<div className="text-[var(--font-body-size)] rounded-[var(--radius)]" />`;
    assertEquals(
        scanTsxCode("web/src/app/Probe.tsx", code, FIXTURE_REGISTRY)
            .map(({ rule, value }) => [rule, value]),
        [
            ["unregistered-tailwind-visual", "text-[var(--font-body-size)]"],
            ["unregistered-tailwind-visual", "rounded-[var(--radius)]"],
        ],
    );
});

Deno.test("tailwind-scale - preserves existing specific rules for raw literals, arbitrary colors, and accent fills", () => {
    const code = `
        export function SpecificRuleSample() {
            return (
                <div className="shadow-[0_4px_12px_black] text-[13px] rounded-[10px] p-[14px] z-10 hover:z-30 bg-[#1e293b] bg-primary data-[checked]:bg-accent/50" />
            );
        }
    `;
    assertEquals(
        scanTsxCode(
            "web/src/app/SpecificRuleSample.tsx",
            code,
            FIXTURE_REGISTRY,
        )
            .filter((v) => v.rule !== "raw-color")
            .map((v) => [v.rule, v.value]),
        [
            ["raw-box-shadow", "shadow-[0_4px_12px_black]"],
            ["raw-font-size", "text-[13px]"],
            ["raw-border-radius", "rounded-[10px]"],
            ["raw-spacing-literal", "p-[14px]"],
            ["raw-z-index", "z-10"],
            ["raw-z-index", "hover:z-30"],
            ["arbitrary-tailwind", "bg-[#1e293b]"],
            ["unregistered-accent-fill", "bg-primary"],
            ["unregistered-accent-fill", "data-[checked]:bg-accent/50"],
        ],
    );
});
