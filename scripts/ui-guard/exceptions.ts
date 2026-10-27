/**
 * Explicit narrowly scoped runtime exceptions and documented rules.
 *
 * Rules distinguish between:
 * 1. Runtime geometry / dynamic domain values (wallpaper filters, drag transforms,
 *    domain-specific colors/points) scoped to their exact file and domain owners.
 * 2. Primitives owning structural geometry in `components/ui/`.
 * 3. Design-system token definitions in `tokens.css` and base resets in `global.css`.
 * 4. Forbidden static visual presentation (raw box-shadow, font-size, border-radius,
 *    semantic spacing literals, arbitrary inline colors/borders).
 */

import { RUNTIME_CSS_VARIABLE_REGISTRY } from "./ownership.ts";
import { hasRawColor } from "./raw-color.ts";

const ALLOWED_PRIMITIVE_PROPS: Record<string, true> = {
    width: true,
    height: true,
    minWidth: true,
    minHeight: true,
    maxWidth: true,
    maxHeight: true,
    transform: true,
    display: true,
    position: true,
    top: true,
    right: true,
    bottom: true,
    left: true,
    zIndex: true,
    overflow: true,
};

function normalizePath(file: string): string {
    return file.replaceAll("\\", "/");
}

function isDragOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("SearchHome.tsx") ||
        p.endsWith("WebAppLauncher.tsx") ||
        p.endsWith("HomeNotes.tsx") ||
        p.includes("/fixtures/drag/")
    );
}

function isWallpaperOwner(file: string): boolean {
    const p = normalizePath(file);
    return p.endsWith("/components/wallpaper/WallpaperSurface.tsx") ||
        p.endsWith("global.css");
}

function isSwatchOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("SettingsPage.tsx") ||
        p.endsWith("AiSettings.tsx") ||
        p.endsWith("DesignLab.tsx") ||
        p.includes("/fixtures/swatch/")
    );
}

/**
 * Wallpaper filter exception:
 * Explicit CSS custom variables used for dynamic wallpaper filters,
 * or dynamic filter expressions driven by wallpaper state, scoped to wallpaper owners.
 */
export function isWallpaperFilterException(
    file: string,
    prop: string,
    value: string,
): boolean {
    if (hasRawColor(value.trim().replaceAll(/^['"`]|['"`]$/g, ""), prop)) {
        return false;
    }

    if (RUNTIME_CSS_VARIABLE_REGISTRY[prop]) {
        return normalizePath(file).endsWith(
            "/components/wallpaper/WallpaperSurface.tsx",
        );
    }

    if (!isWallpaperOwner(file)) {
        return false;
    }

    if (
        (prop === "filter" || prop === "backdropFilter") &&
        value.includes("wallpaper")
    ) {
        return true;
    }

    return false;
}

/**
 * Image drag transform exception:
 * dnd-kit transform functions (CSS.Transform.toString, CSS.Translate.toString),
 * transition for drag movements, or conditional zIndex/opacity tied to isDragging.
 * Must be within recognized drag owners or use recognized dnd-kit transform calls.
 */
export function isDragTransformException(
    file: string,
    prop: string,
    value: string,
): boolean {
    const normValue = value.trim();
    if (
        normalizePath(file) === "web/src/features/dock/WorkspaceDock.tsx" &&
        prop === "transition" && normValue === "transition"
    ) return true;

    // dnd-kit transform functions are explicit contracts
    if (prop === "transform") {
        const isDndTransform = normValue.includes("CSS.Transform.toString") ||
            normValue.includes("CSS.Translate.toString");
        if (isDndTransform) {
            return true;
        }

        // Within drag owners, conditional drag transforms or pos translations
        if (isDragOwner(file)) {
            if (
                normValue.includes("isDragging") ||
                normValue.includes("isOverlayActive") ||
                (normValue.includes("pos") && normValue.includes("translate3d"))
            ) {
                return true;
            }
        }

        // Generic transform strings in unrelated files are NOT exceptions
        return false;
    }

    if (prop === "opacity" && normValue.includes("isDragging")) {
        return isDragOwner(file);
    }

    if (prop === "zIndex" && normValue.includes("isDragging")) {
        return isDragOwner(file);
    }

    if (prop === "transition" && isDragOwner(file)) {
        return (
            normValue.includes("transform") ||
            normValue.includes("isDragging")
        );
    }

    return false;
}

const RUNTIME_LAYOUT_PROPS: Record<string, true> = {
    left: true,
    top: true,
    width: true,
    height: true,
    minHeight: true,
    gridColumn: true,
    gridRow: true,
    position: true,
};

function isRuntimeLayoutOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("SearchHome.tsx") ||
        p.endsWith("WebAppLauncher.tsx") ||
        p.endsWith("HomeNotes.tsx") ||
        p.endsWith("design-lab/HomeGridLab.tsx") ||
        p.endsWith("design-lab/AccentLab.tsx") ||
        p.includes("/fixtures/layout/")
    );
}

/**
 * Runtime layout geometry exception:
 * Launcher grid placement and home-paper coordinates computed at runtime,
 * scoped to their layout owners and to explicit layout expressions.
 */
export function isRuntimeLayoutGeometryException(
    file: string,
    prop: string,
    value: string,
): boolean {
    const path = normalizePath(file);
    const normValue = value.trim();
    // These were previously hidden behind conditional/const style objects.
    // Match measured geometry exactly, never a whole owner or visual property.
    if (path === "web/src/design-lab/HomeGridLab.tsx") {
        if (prop === "top" && normValue === "blockTop") return true;
    }
    if (path === "web/src/features/app-library/LibraryPopup.tsx") {
        if (prop === "top" && normValue === "top") return true;
        if (
            prop === "maxHeight" &&
            normValue === "`calc(100dvh - ${top}px - var(--space-4))`"
        ) return true;
    }
    if (path === "web/src/features/dock/WorkspaceDock.tsx") {
        if (
            prop === "left" &&
            normValue ===
                "`calc(${ballDragState.currentX}px - var(--dock-ball-size) / 2)`"
        ) return true;
        if (
            prop === "top" && (
                normValue ===
                    "`calc(${ballDragState.currentY}px - var(--dock-ball-size) / 2)`" ||
                normValue ===
                    "`calc(var(--dock-ball-inset-top) + (100dvh - var(--dock-ball-inset-top) - var(--dock-ball-inset-bottom)) * ${topRatio})`"
            )
        ) return true;
    }
    if (!RUNTIME_LAYOUT_PROPS[prop] || !isRuntimeLayoutOwner(file)) {
        return false;
    }
    const norm = value.trim();
    if (prop === "position") {
        return norm === "'absolute'" || norm === '"absolute"';
    }
    return norm.includes("columnLayout") ||
        norm.includes("placement") ||
        norm.includes("pos.") ||
        norm.includes("point.") ||
        norm.includes("target.") ||
        norm.includes("rect.") ||
        norm === "moreTop";
}

/**
 * Domain-specific values exception:
 * Coordinates for floating notes, dynamic accent swatch previews, sheet heights.
 * Scoped strictly to respective domain owners.
 */
export function isDomainValueException(
    file: string,
    prop: string,
    value: string,
): boolean {
    const norm = value.trim();
    const p = normalizePath(file);

    // Home note cell coordinates (scoped to HomeNotes)
    if (p.endsWith("HomeNotes.tsx") || p.includes("/fixtures/papers/")) {
        if ((prop === "left" || prop === "top") && norm.includes("point.")) {
            return true;
        }
    }

    // Sheet dynamic mobile height CSS variable (scoped to ContentSheet)
    if (p.endsWith("ContentSheet.tsx") || p.includes("/fixtures/sheet/")) {
        if (prop === "--sheet-mobile-height") {
            return !hasRawColor(
                norm.replaceAll(/^['"`]|['"`]$/g, ""),
                prop,
            );
        }
    }
    // Workspace surfaces consume measured Host / VisualViewport geometry only.
    if (p === "web/src/features/workspace/WorkspaceSurface.tsx") {
        return (prop === "--workspace-visible-height" &&
            norm === "`${viewport.height}px`") ||
            (prop === "--workspace-visible-bottom" &&
                norm === "`${viewport.bottom}px`") ||
            (prop === "--workspace-chrome-bottom" &&
                norm === "`${chromeBottom}px`");
    }

    // Dynamic accent color preview swatches (scoped strictly to swatch owners and runtime expressions)
    if (isSwatchOwner(file)) {
        if (hasRawColor(norm.replaceAll(/^['"`]|['"`]$/g, ""), prop)) {
            return false;
        }
        if (prop === "--item-accent") {
            return (
                norm === "hex" ||
                norm === "accent.hex" ||
                norm === "swatch.hex" ||
                norm === "swatch.color"
            );
        }
        if (prop === "background" || prop === "backgroundColor") {
            return (
                /^getAccentLight\(\s*[a-zA-Z_$][\w$.]*\s*\)$/.test(norm) ||
                norm === "swatch.color" ||
                norm === "swatch.hex" ||
                norm === "accent.hex"
            );
        }
    }

    return false;
}

/**
 * Documented rule: UI primitives in `web/src/components/ui/*.tsx`
 * are permitted to own component-internal structural geometry (sizing, indicators, track heights),
 * but are NOT permitted arbitrary visual styling (raw shadows, arbitrary non-token colors, etc.).
 */
export function isPrimitiveOwningGeometry(
    file: string,
    prop: string,
    _value: string,
): boolean {
    const normFile = normalizePath(file);
    if (!normFile.includes("web/src/components/ui/")) {
        return false;
    }

    if (!ALLOWED_PRIMITIVE_PROPS[prop]) {
        return false;
    }

    if (
        prop === "boxShadow" ||
        prop === "background" ||
        prop === "backgroundColor" ||
        prop === "color" ||
        prop === "borderColor"
    ) {
        return false;
    }

    return true;
}

/**
 * Documented rule: Design system tokens in `tokens.css` and base resets in `global.css`.
 */
export function isDesignSystemAllowed(
    file: string,
    prop: string,
    value: string,
): boolean {
    const normFile = normalizePath(file);
    // AppShell insets are measured taskbar geometry, not visual spacing choices.
    if (
        normFile === "web/src/components/searcher/semantic.css" &&
        /^margin-(top|right|bottom|left)$/.test(prop)
    ) {
        const edge = prop.slice("margin-".length);
        return value.replaceAll(/\s+/g, "") ===
                `var(--dock-inset-${edge},0px)` ||
            value.trim() === `var(--dock-inset-${edge})`;
    }
    if (
        normFile === "web/src/components/searcher/semantic.css" &&
        prop === "inset-block-end"
    ) {
        return value.replaceAll(/\s+/g, "") ===
            "calc(var(--space-8)+var(--dock-inset-bottom,0px))";
    }
    if (
        normFile === "web/src/features/home-layouts/home-notes.css" &&
        prop === "inset-block-end"
    ) {
        return value.replaceAll(/\s+/g, "") ===
            "calc(var(--space-2)+var(--dock-inset-bottom,0px))";
    }
    if (
        normFile === "web/src/features/home-layouts/home-layouts.css" &&
        prop === "padding-block-end"
    ) {
        return value.replaceAll(/\s+/g, "") ===
            "calc(max(var(--space-7),var(--dock-inset-bottom,0px)-var(--space-6))+env(safe-area-inset-bottom,0px))";
    }
    if (normFile === "web/src/features/workspace/workspace.css") {
        const compact = value.replaceAll(/\s+/g, "");
        if (prop === "inset-block-start") {
            return compact ===
                "max(var(--workspace-top-inset),var(--workspace-chrome-bottom),var(--dock-inset-top,0px))";
        }
        if (prop === "inset-block-end") {
            return compact ===
                "max(var(--workspace-inset),var(--dock-inset-bottom,0px))";
        }
        if (prop === "right") {
            return compact ===
                "max(var(--workspace-inset),var(--dock-inset-right,0px))";
        }
        if (prop === "width") {
            return compact ===
                    "min(var(--workspace-target-width),calc(100vw-2*var(--workspace-inset)-var(--dock-inset-right,0px)))" ||
                compact ===
                    "min(var(--workspace-target-width),calc(100vw-2*var(--workspace-inset)-var(--dock-inset-left,0px)))";
        }
        if (prop === "inset") {
            return compact ===
                "auto0max(var(--workspace-visible-bottom,0px),var(--dock-inset-bottom,0px))";
        }
        if (prop === "height") {
            return compact ===
                    "min(88dvh,var(--workspace-mobile-height),calc(var(--workspace-visible-height,100dvh)-var(--dock-inset-bottom,0px)-var(--space-4)))" ||
                compact ===
                    "min(88dvh,var(--workspace-mobile-height),calc(var(--workspace-visible-height,100dvh)-var(--dock-inset-bottom,0px)-var(--space-1)))";
        }
        if (prop === "max-height") {
            return compact ===
                    "calc(var(--workspace-visible-height,100dvh)-var(--dock-inset-bottom,0px)-var(--space-4))" ||
                compact ===
                    "calc(var(--workspace-visible-height,100dvh)-var(--dock-inset-bottom,0px)-var(--space-1))";
        }
    }
    // Physical paper margins are document settings, not application visual spacing.
    if (normFile === "web/src/features/documents/document-pagination.css") {
        return prop === "padding" && value.replaceAll(/\s+/g, " ").trim() ===
                    "var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left)" ||
            ((prop === "margin" || prop === "padding") &&
                value.trim() === "0 !important");
    }

    if (normFile.endsWith("web/src/design-system/tokens.css")) {
        return prop.startsWith("--") || prop === "color-scheme";
    }

    if (normFile.endsWith("web/src/styles/global.css")) {
        const normVal = value.trim();
        return (
            prop === "box-sizing" ||
            ((prop === "margin" || prop === "padding") &&
                (normVal === "0" || normVal === "0px"))
        );
    }

    return false;
}
