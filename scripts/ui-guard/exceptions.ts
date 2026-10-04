/**
 * Explicit narrowly scoped runtime exceptions and documented rules.
 *
 * Rules distinguish between:
 * 1. Runtime geometry / dynamic domain values (wallpaper filters, drag transforms,
 *    masonry layout coordinates, domain-specific colors/points) scoped to their
 *    exact file and domain owners.
 * 2. Primitives owning structural geometry in `components/ui/`.
 * 3. Design-system token definitions in `tokens.css` and base resets in `global.css`.
 * 4. Forbidden static visual presentation (raw box-shadow, font-size, border-radius,
 *    semantic spacing literals, arbitrary inline colors/borders).
 */

const WALLPAPER_VARS: Record<string, true> = {
    "--wallpaper-image": true,
    "--wallpaper-blur": true,
    "--wallpaper-grayscale": true,
    "--wallpaper-mask": true,
    "--search-opacity": true,
};

const MASONRY_GEOMETRY_PROPS: Record<string, true> = {
    left: true,
    top: true,
    width: true,
    height: true,
    minHeight: true,
    gridColumn: true,
    gridRow: true,
    position: true,
};

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

function isLayoutOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("SearchHome.tsx") ||
        p.endsWith("WebAppLauncher.tsx") ||
        p.endsWith("FloatingNotes.tsx") ||
        p.includes("/fixtures/layout/")
    );
}

function isDragOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("SearchHome.tsx") ||
        p.endsWith("WebAppLauncher.tsx") ||
        p.endsWith("FloatingNotes.tsx") ||
        p.endsWith("DesignLab.tsx") ||
        p.includes("/fixtures/drag/")
    );
}

function isWallpaperOwner(file: string): boolean {
    const p = normalizePath(file);
    return (
        p.endsWith("App.tsx") ||
        p.endsWith("DesignLab.tsx") ||
        p.endsWith("global.css") ||
        p.includes("/fixtures/wallpaper/")
    );
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
 * Explicit CSS custom variables used for dynamic desktop wallpaper filters,
 * or dynamic filter expressions driven by wallpaper state, scoped to wallpaper owners.
 */
export function isWallpaperFilterException(
    file: string,
    prop: string,
    value: string,
): boolean {
    if (WALLPAPER_VARS[prop]) {
        return true;
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

/**
 * Masonry layout geometry exception:
 * Dynamic positioning (left, top, width, height, gridColumn, gridRow, minHeight)
 * computed at runtime from layout calculations. Scoped strictly to layout owners.
 */
export function isMasonryGeometryException(
    file: string,
    prop: string,
    value: string,
): boolean {
    if (!MASONRY_GEOMETRY_PROPS[prop]) {
        return false;
    }

    // Must be in a recognized layout owner
    if (!isLayoutOwner(file)) {
        return false;
    }

    const norm = value.trim();

    // Position absolute when used for masonry / coordinate positioning in layout owners
    if (prop === "position") {
        return norm === "'absolute'" || norm === '"absolute"';
    }

    // Explicit layout calculation formulas
    const isLayoutFormula = norm.includes("columnLayout") ||
        norm.includes("placement") ||
        norm.includes("pos.") ||
        norm.includes("point.");

    return isLayoutFormula;
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

    // Desktop frames are computed in the sole Canvas safe-rect coordinate system.
    if (p === "web/src/features/desktop/DesktopCanvas.tsx") {
        return /^(left|top|width|height)$/.test(prop) &&
            /^rect\.(x|y|width|height)$/.test(norm);
    }
    if (p === "web/src/features/desktop/DesktopWindow.tsx") {
        return (prop === "zIndex" && norm === "win.zOrder") ||
            (/^(width|height|transform)$/.test(prop) &&
                norm.includes("win.frame."));
    }
    if (p === "web/src/features/desktop/WindowChrome.tsx") {
        return /^(width|height|transform)$/.test(prop) &&
            norm.includes("snapPreviewFrame.");
    }

    // Floating note domain coordinates and tilt (scoped to FloatingNotes)
    if (p.endsWith("FloatingNotes.tsx") || p.includes("/fixtures/notes/")) {
        if (prop === "--note-tilt") {
            return true;
        }
        if ((prop === "left" || prop === "top") && norm.includes("point.")) {
            return true;
        }
        if (prop === "zIndex" && norm.includes("point.z")) {
            return true;
        }
    }

    // Sheet dynamic mobile height CSS variable (scoped to ContentSheet)
    if (p.endsWith("ContentSheet.tsx") || p.includes("/fixtures/sheet/")) {
        if (prop === "--sheet-mobile-height") {
            return true;
        }
    }

    // Dynamic accent color preview swatches (scoped strictly to swatch owners)
    if (isSwatchOwner(file)) {
        if (prop === "--item-accent") {
            return true;
        }
        if (prop === "background" || prop === "backgroundColor") {
            return (
                norm.includes("getAccentLight(") ||
                norm.includes("swatch.color") ||
                norm.includes("swatch.hex") ||
                norm.includes("accent.hex")
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
