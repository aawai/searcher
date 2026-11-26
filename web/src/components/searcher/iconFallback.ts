/** Website identity colour, independent of path or display name.
 * Light and dark pairs keep every hue above WCAG AA. */
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
    const hue = (hash >>> 0) % 360;
    return {
        background: `light-dark(hsl(${hue} 45% 90%), hsl(${hue} 28% 24%))`,
        color: `light-dark(#1d1d1f, hsl(${hue} 40% 88%))`,
    };
}
