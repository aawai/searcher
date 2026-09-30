import { assertEquals } from "@std/assert";
import {
    isDesignSystemAllowed,
    isDomainValueException,
    isDragTransformException,
    isMasonryGeometryException,
    isPrimitiveOwningGeometry,
    isWallpaperFilterException,
} from "./exceptions.ts";

Deno.test("runtime exceptions - wallpaper filter", () => {
    // Wallpaper CSS variables on any element
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "--wallpaper-image",
            "url('/bg.png')",
        ),
        true,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "--wallpaper-blur",
            "12px",
        ),
        true,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "--wallpaper-grayscale",
            "0.5",
        ),
        true,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "--wallpaper-mask",
            "0.75",
        ),
        true,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "--search-opacity",
            "0.9",
        ),
        true,
    );

    // Dynamic filter on wallpaper owner
    assertEquals(
        isWallpaperFilterException(
            "web/src/styles/global.css",
            "filter",
            "blur(var(--wallpaper-blur,0px))",
        ),
        true,
    );

    // Outside wallpaper owner, filter is denied
    assertEquals(
        isWallpaperFilterException(
            "web/src/app/AdminPage.tsx",
            "filter",
            "blur(var(--wallpaper-blur,0px))",
        ),
        false,
    );

    // Hardcoded presentation styles are NOT wallpaper exceptions
    assertEquals(
        isWallpaperFilterException("web/src/App.tsx", "background", "#ffffff"),
        false,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/App.tsx",
            "boxShadow",
            "0 4px 6px rgba(0,0,0,0.1)",
        ),
        false,
    );
    assertEquals(
        isWallpaperFilterException("web/src/App.tsx", "color", "red"),
        false,
    );
});

Deno.test("runtime exceptions - image drag transform and denial of unrelated transforms", () => {
    // dnd-kit transform functions are accepted
    assertEquals(
        isDragTransformException(
            "web/src/app/SearchHome.tsx",
            "transform",
            "CSS.Transform.toString(transform)",
        ),
        true,
    );
    assertEquals(
        isDragTransformException(
            "web/src/components/searcher/WebAppLauncher.tsx",
            "transform",
            "CSS.Translate.toString(transform)",
        ),
        true,
    );
    assertEquals(
        isDragTransformException(
            "web/src/components/searcher/WebAppLauncher.tsx",
            "transform",
            "isDragging ? undefined : CSS.Transform.toString(transform)",
        ),
        true,
    );

    // Drag conditional opacity and zIndex on drag owners
    assertEquals(
        isDragTransformException(
            "web/src/app/SearchHome.tsx",
            "opacity",
            "isDragging ? 0.5 : undefined",
        ),
        true,
    );
    assertEquals(
        isDragTransformException(
            "web/src/app/SearchHome.tsx",
            "zIndex",
            "isDragging ? 50 : undefined",
        ),
        true,
    );
    assertEquals(
        isDragTransformException(
            "web/src/components/searcher/WebAppLauncher.tsx",
            "transition",
            "transform 200ms ease, opacity 200ms ease",
        ),
        true,
    );

    // Consumer-visible denial: transform: 'translate3d(0,0,0)' unrelated outside drag owner
    assertEquals(
        isDragTransformException(
            "web/src/app/AdminPage.tsx",
            "transform",
            "'translate3d(0,0,0)'",
        ),
        false,
    );
    assertEquals(
        isDragTransformException(
            "web/src/components/ui/banner.tsx",
            "transform",
            "'translate3d(0, 0, 0)'",
        ),
        false,
    );
    assertEquals(
        isDragTransformException("web/src/app/AdminPage.tsx", "opacity", "0.8"),
        false,
    );
    assertEquals(
        isDragTransformException("web/src/app/AdminPage.tsx", "zIndex", "100"),
        false,
    );
});

Deno.test("runtime exceptions - masonry layout geometry and denial of arbitrary geometry", () => {
    // Real masonry layout geometry in SearchHome and WebAppLauncher
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "left",
            "`${columnLayout.left}px`",
        ),
        true,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "top",
            "`${columnLayout.top}px`",
        ),
        true,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "width",
            "`${columnLayout.width}px`",
        ),
        true,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/components/searcher/WebAppLauncher.tsx",
            "gridColumn",
            "`${placement.col + 1} / span ${placement.colSpan}`",
        ),
        true,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "position",
            "'absolute'",
        ),
        true,
    );

    // Consumer-visible denial: width: `${arbitrary}px` outside masonry owner is DENIED
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/AdminPage.tsx",
            "width",
            "`${arbitrary}px`",
        ),
        false,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/components/Header.tsx",
            "width",
            "`${computedWidth}px`",
        ),
        false,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/AdminPage.tsx",
            "position",
            "'absolute'",
        ),
        false,
    );

    // Raw static spacing/sizes are NOT masonry layout geometry even in layout files
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "padding",
            "24px",
        ),
        false,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "margin",
            "12px",
        ),
        false,
    );
    assertEquals(
        isMasonryGeometryException(
            "web/src/app/SearchHome.tsx",
            "fontSize",
            "16px",
        ),
        false,
    );
});

Deno.test("runtime exceptions - domain values and denial of arbitrary dynamic colors", () => {
    // Floating note domain coordinates and tilt (in FloatingNotes.tsx)
    assertEquals(
        isDomainValueException(
            "web/src/components/searcher/FloatingNotes.tsx",
            "left",
            "`${point.x}px`",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/components/searcher/FloatingNotes.tsx",
            "top",
            "`${point.y}px`",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/components/searcher/FloatingNotes.tsx",
            "zIndex",
            "isDragging ? 2000 : point.z",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/components/searcher/FloatingNotes.tsx",
            "--note-tilt",
            "getNoteTilt(note.id)",
        ),
        true,
    );

    // Theme color swatch preview in SettingsPage / AiSettings
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "background",
            "getAccentLight(id)",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "background",
            "swatch.color",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "--item-accent",
            "accent.hex",
        ),
        true,
    );

    // Sheet dynamic mobile height CSS variable in ContentSheet
    assertEquals(
        isDomainValueException(
            "web/src/components/searcher/ContentSheet.tsx",
            "--sheet-mobile-height",
            "sheetHeight + 'px'",
        ),
        true,
    );

    // Consumer-visible denial: background: product.color outside actual swatch owner is DENIED
    assertEquals(
        isDomainValueException(
            "web/src/app/ProductCard.tsx",
            "background",
            "product.color",
        ),
        false,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/AdminPage.tsx",
            "background",
            "user.themeColor",
        ),
        false,
    );
    assertEquals(
        isDomainValueException(
            "web/src/components/CustomButton.tsx",
            "backgroundColor",
            "button.color",
        ),
        false,
    );
    assertEquals(
        isDomainValueException(
            "web/src/app/SettingsPage.tsx",
            "background",
            "'#ffffff'",
        ),
        false,
    );
});

Deno.test("documented rules - primitives owning geometry", () => {
    // Slider / switch primitives owning structural geometry
    assertEquals(
        isPrimitiveOwningGeometry(
            "web/src/components/ui/slider.tsx",
            "width",
            "100%",
        ),
        true,
    );
    assertEquals(
        isPrimitiveOwningGeometry(
            "web/src/components/ui/slider.tsx",
            "height",
            "2px",
        ),
        true,
    );
    assertEquals(
        isPrimitiveOwningGeometry(
            "web/src/components/ui/switch.tsx",
            "transform",
            "translateX(20px)",
        ),
        true,
    );

    // But primitives must NOT have raw arbitrary visual styles
    assertEquals(
        isPrimitiveOwningGeometry(
            "web/src/components/ui/slider.tsx",
            "boxShadow",
            "0 4px 6px black",
        ),
        false,
    );
    assertEquals(
        isPrimitiveOwningGeometry(
            "web/src/components/ui/slider.tsx",
            "background",
            "#ff0000",
        ),
        false,
    );

    // Business pages are NOT primitives
    assertEquals(
        isPrimitiveOwningGeometry("web/src/app/AdminPage.tsx", "width", "100%"),
        false,
    );
});

Deno.test("documented rules - design system token definitions", () => {
    // tokens.css defining CSS custom variables
    assertEquals(
        isDesignSystemAllowed(
            "web/src/design-system/tokens.css",
            "--radius",
            "12px",
        ),
        true,
    );
    assertEquals(
        isDesignSystemAllowed(
            "web/src/design-system/tokens.css",
            "--font-body-size",
            "14px",
        ),
        true,
    );

    // global.css base reset
    assertEquals(
        isDesignSystemAllowed(
            "web/src/styles/global.css",
            "box-sizing",
            "border-box",
        ),
        true,
    );
    assertEquals(
        isDesignSystemAllowed("web/src/styles/global.css", "margin", "0"),
        true,
    );
    assertEquals(
        isDesignSystemAllowed("web/src/styles/global.css", "padding", "0"),
        true,
    );

    // Business CSS files cannot claim design system definition exemption
    assertEquals(
        isDesignSystemAllowed(
            "web/src/components/searcher/launcher.css",
            "font-size",
            "22px",
        ),
        false,
    );
    assertEquals(
        isDesignSystemAllowed(
            "web/src/features/home-layouts/home-layouts.css",
            "box-shadow",
            "0 4px 16px rgba(0,0,0,0.1)",
        ),
        false,
    );
});
