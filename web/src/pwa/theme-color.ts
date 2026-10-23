/**
 * The installed app's title bar follows the resolved theme's page background.
 * `index.html` and the manifest carry the same values for the first paint.
 */
export function syncThemeColor(root: HTMLElement): void {
    const color = getComputedStyle(root).getPropertyValue("--background")
        .trim();
    if (!color) return;
    for (
        const meta of document.querySelectorAll<HTMLMetaElement>(
            'meta[name="theme-color"]',
        )
    ) meta.content = color;
}
