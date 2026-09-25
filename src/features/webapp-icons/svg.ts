/**
 * SVG Sanitizer without external heavyweight dependencies.
 * Removes script, object, embed, iframe, foreignObject, inline event handlers (on*),
 * javascript: / data: URL attributes (except safe image data URIs in href), and XML entities/DOCTYPE attacks.
 */

const DANGEROUS_TAGS = [
    "script",
    "iframe",
    "object",
    "embed",
    "foreignobject",
    "use",
    "applet",
    "meta",
    "link",
    "base",
];

export function sanitizeSvg(svgContent: string): string {
    const trimmed = svgContent.trim();
    if (!trimmed.toLowerCase().includes("<svg")) {
        throw new Error("无效的 SVG 内容：缺少 <svg> 根标签");
    }

    // 1. Remove XML declarations and DOCTYPE (protect against XXE)
    let sanitized = trimmed
        .replace(/<\?xml[\s\S]*?\?>/gi, "")
        .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    // 2. Remove dangerous tags and their content
    for (const tag of DANGEROUS_TAGS) {
        // Tag with body: <tag ...>...</tag>
        const bodyRegex = new RegExp(
            `<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`,
            "gi",
        );
        sanitized = sanitized.replace(bodyRegex, "");
        // Self-closing tag: <tag ... />
        const selfCloseRegex = new RegExp(`<${tag}[^>]*\\/?>`, "gi");
        sanitized = sanitized.replace(selfCloseRegex, "");
    }

    // 3. Remove inline event handlers (e.g. onclick, onload, onerror, onmouseover, etc.)
    sanitized = sanitized.replace(
        /\s+on[a-z]+(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))/gi,
        "",
    );

    // 4. Remove javascript: or vbscript: or data: in href/xlink:href/src
    sanitized = sanitized.replace(
        /\s+(?:xlink:)?href\s*=\s*(['"])\s*(?:javascript|vbscript|data):[\s\S]*?\1/gi,
        "",
    );
    sanitized = sanitized.replace(
        /\s+src\s*=\s*(['"])\s*(?:javascript|vbscript|data):[\s\S]*?\1/gi,
        "",
    );

    // Ensure it still contains a valid <svg> tag
    if (!sanitized.toLowerCase().includes("<svg")) {
        throw new Error("SVG 净化后无有效内容");
    }

    return sanitized.trim();
}
