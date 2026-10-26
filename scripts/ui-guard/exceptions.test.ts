import { assertEquals } from "@std/assert";
import {
    isDesignSystemAllowed,
    isDomainValueException,
    isDragTransformException,
    isPrimitiveOwningGeometry,
    isWallpaperFilterException,
} from "./exceptions.ts";

Deno.test("wallpaper runtime variables are allowed only in WallpaperSurface", () => {
    const owner = "web/src/components/wallpaper/WallpaperSurface.tsx";
    for (
        const variable of [
            "--wallpaper-image",
            "--wallpaper-mask",
            "--wallpaper-position",
        ]
    ) {
        assertEquals(
            isWallpaperFilterException(owner, variable, "resolved"),
            true,
        );
        for (
            const file of [
                "web/src/App.tsx",
                "web/src/design-lab/DesignLab.tsx",
                "web/src/app/AdminPage.tsx",
            ]
        ) {
            assertEquals(
                isWallpaperFilterException(file, variable, "resolved"),
                false,
            );
        }
    }
    assertEquals(
        isWallpaperFilterException(owner, "--wallpaper-blur", "12px"),
        false,
    );
    assertEquals(
        isWallpaperFilterException(owner, "--wallpaper-grayscale", "0.5"),
        false,
    );
    assertEquals(
        isWallpaperFilterException(owner, "boxShadow", "0 4px 6px black"),
        false,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/styles/global.css",
            "filter",
            "var(--wallpaper-filter)",
        ),
        true,
    );
    assertEquals(
        isWallpaperFilterException(
            "web/src/app/AdminPage.tsx",
            "filter",
            "var(--wallpaper-filter)",
        ),
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

Deno.test("runtime exceptions - domain values and denial of arbitrary dynamic colors", () => {
    // Home paper domain coordinates (in HomeNotes.tsx)
    assertEquals(
        isDomainValueException(
            "web/src/features/home-layouts/HomeNotes.tsx",
            "left",
            "`${point.x}px`",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/features/home-layouts/HomeNotes.tsx",
            "top",
            "`${point.y}px`",
        ),
        true,
    );
    assertEquals(
        isDomainValueException(
            "web/src/features/home-layouts/HomeNotes.tsx",
            "--note-tilt",
            "getNoteTilt(note.id)",
        ),
        false,
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

Deno.test("viewport and physical paper exceptions reject unrelated visual values", () => {
    assertEquals(
        isDomainValueException(
            "web/src/app/SearchHome.tsx",
            "width",
            "rect.viewportRect.width",
        ),
        false,
    );
    const paper = "web/src/features/documents/document-pagination.css";
    const margins =
        "var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left)";
    assertEquals(isDesignSystemAllowed(paper, "padding", margins), true);
    assertEquals(isDesignSystemAllowed(paper, "padding", "20mm"), false);
    assertEquals(
        isDesignSystemAllowed(paper, "margin", "24px !important"),
        false,
    );
    assertEquals(
        isDesignSystemAllowed(
            "web/src/features/workspace/workspace.css",
            "padding",
            margins,
        ),
        false,
    );
});

Deno.test("taskbar inset exemption is restricted to matching PageShell geometry", () => {
    const shell = "web/src/components/searcher/semantic.css";
    assertEquals(
        isDesignSystemAllowed(
            shell,
            "margin-bottom",
            "var(--dock-inset-bottom, 0px)",
        ),
        true,
    );
    for (
        const [file, property, value] of [
            [shell, "margin-bottom", "var(--dock-inset-left)"],
            [shell, "padding-bottom", "var(--dock-inset-bottom)"],
            [shell, "margin-bottom", "var(--dock-inset-bottom, 24px)"],
            [
                "web/src/features/dock/dock.css",
                "margin-bottom",
                "var(--dock-inset-bottom)",
            ],
        ]
    ) {
        assertEquals(isDesignSystemAllowed(file, property, value), false);
    }
});
