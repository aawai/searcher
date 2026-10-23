/** Website identity colour, independent of path, display name, or theme.
 * Its pale canvas and fixed dark ink keep every hue above WCAG AA. */
export function iconFallback(
    url: string,
): { background: string; color: string } {
    let domain: string;
    try {
        domain = new URL(url).hostname.toLowerCase();
    } catch {
        domain = url.toLowerCase();
    }
    let hash = 2166136261;
    for (const char of domain) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    return {
        background: `hsl(${(hash >>> 0) % 360} 45% 90%)`,
        color: "#1d1d1f",
    };
}
