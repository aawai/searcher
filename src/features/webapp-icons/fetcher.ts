/**
 * Web App Icon Fetcher with priority matching Spec 01 §10:
 * apple-touch-icon -> manifest icons -> link rel=icon -> favicon.ico
 */

import { validateUrlForSafeFetch } from "./ssrf.ts";

export interface CandidateIcon {
    type: "apple-touch-icon" | "manifest" | "icon" | "favicon";
    url: string;
    sizes?: string;
    contentType?: string;
}

function maxIconDimension(sizes?: string): number {
    if (!sizes) return 0;
    let best = 0;
    for (const part of sizes.trim().split(/\s+/)) {
        const match = /^(\d+)x(\d+)$/i.exec(part);
        if (!match) continue;
        const edge = Math.max(Number(match[1]), Number(match[2]));
        if (Number.isFinite(edge) && edge > best) best = edge;
    }
    return best;
}

function isSvgCandidate(icon: CandidateIcon): boolean {
    if (icon.contentType?.toLowerCase().includes("svg")) return true;
    try {
        return new URL(icon.url).pathname.toLowerCase().endsWith(".svg");
    } catch {
        return false;
    }
}
export function extractSiteNameFromHtml(html: string): string | null {
    const match = /<title\b[^>]*>([^<]*)<\/title>/i.exec(html);
    if (!match) return null;
    const title = match[1].replace(
        /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
        (_, entity: string) => {
            const named: Record<string, string> = {
                amp: "&",
                quot: '"',
                apos: "'",
                lt: "<",
                gt: ">",
            };
            if (entity.startsWith("#")) {
                const number = entity[1]?.toLowerCase() === "x"
                    ? Number.parseInt(entity.slice(2), 16)
                    : Number.parseInt(entity.slice(1), 10);
                return number > 0 && number <= 0x10ffff &&
                        !(number >= 0xd800 && number <= 0xdfff)
                    ? String.fromCodePoint(number)
                    : "";
            }
            return named[entity.toLowerCase()] ?? "";
        },
    ).replace(/\s+/g, " ").trim();
    return title ? title.slice(0, 100) : null;
}

export function extractCandidateIconsFromHtml(
    html: string,
    baseUrl: string,
): CandidateIcon[] {
    const candidates: CandidateIcon[] = [];
    const base = new URL(baseUrl);

    // Look for <link> tags in HTML
    const linkRegex = /<link\b([^>]*?)>/gi;
    let match: RegExpExecArray | null;

    const appleIcons: CandidateIcon[] = [];
    const manifestLinks: string[] = [];
    const linkIcons: CandidateIcon[] = [];

    while ((match = linkRegex.exec(html)) !== null) {
        const tag = match[1];
        const relMatch = /rel\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/i.exec(
            tag,
        );
        const hrefMatch = /href\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/i.exec(
            tag,
        );
        const sizesMatch = /sizes\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/i
            .exec(tag);
        const typeMatch = /type\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))/i
            .exec(tag);

        if (!relMatch || !hrefMatch) continue;
        const rel = (relMatch[1] || relMatch[2] || relMatch[3] || "")
            .toLowerCase().trim();
        const href = (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "")
            .trim();
        const sizes = sizesMatch
            ? (sizesMatch[1] || sizesMatch[2] || sizesMatch[3] || "").trim()
            : undefined;
        const contentType = typeMatch
            ? (typeMatch[1] || typeMatch[2] || typeMatch[3] || "").trim()
            : undefined;

        if (!href) continue;

        let absoluteUrl: string;
        try {
            absoluteUrl = new URL(href, base).toString();
        } catch {
            continue;
        }

        if (rel.includes("apple-touch-icon")) {
            appleIcons.push({
                type: "apple-touch-icon",
                url: absoluteUrl,
                sizes,
                contentType,
            });
        } else if (rel === "manifest") {
            manifestLinks.push(absoluteUrl);
        } else if (rel.includes("icon")) {
            linkIcons.push({
                type: "icon",
                url: absoluteUrl,
                sizes,
                contentType,
            });
        }
    }

    // 1. apple-touch-icon
    const distanceFrom180 = (icon: CandidateIcon) =>
        Math.abs((maxIconDimension(icon.sizes) || 180) - 180);
    appleIcons.sort((a, b) => distanceFrom180(a) - distanceFrom180(b));
    candidates.push(...appleIcons);

    // 2. manifest icons (placeholder URL marker for manifest resolution)
    for (const mUrl of manifestLinks) {
        candidates.push({ type: "manifest", url: mUrl });
    }

    // 3. link rel="icon" (SVG first, then larger sizes)
    linkIcons.sort((a, b) => {
        const aSvg = isSvgCandidate(a) ? 1 : 0;
        const bSvg = isSvgCandidate(b) ? 1 : 0;
        if (aSvg !== bSvg) return bSvg - aSvg;
        return maxIconDimension(b.sizes) - maxIconDimension(a.sizes);
    });
    candidates.push(...linkIcons);

    // 4. Default /favicon.ico fallback
    candidates.push({
        type: "favicon",
        url: new URL("/favicon.ico", base).toString(),
    });

    return candidates;
}

export interface FetchIconOptions {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    allowDnsLookup?: boolean;
    accept?: string;
    fetchFn?: typeof fetch;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchWithSafeLimit(
    url: string,
    options: FetchIconOptions = {},
): Promise<{ bytes: Uint8Array; contentType: string; finalUrl: string }> {
    const {
        timeoutMs = 8000,
        maxBytes = 2 * 1024 * 1024,
        maxRedirects = 3,
        allowDnsLookup = true,
        accept =
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        fetchFn = fetch,
    } = options;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let currentUrl = url;
    try {
        for (let redirects = 0;; redirects++) {
            await validateUrlForSafeFetch(currentUrl, { allowDnsLookup });

            const response = await fetchFn(currentUrl, {
                signal: controller.signal,
                redirect: maxRedirects > 0 ? "manual" : "error",
                headers: {
                    "User-Agent":
                        "Searcher-Icon-Bot/1.0 (+https://searcher.local)",
                    "Accept": accept,
                },
            });

            if (REDIRECT_STATUSES.has(response.status)) {
                await response.body?.cancel();
                if (redirects >= maxRedirects) {
                    throw new Error("重定向次数超过限制");
                }
                const location = response.headers.get("location");
                if (!location) {
                    throw new Error("重定向响应缺少 Location");
                }
                currentUrl = new URL(location, currentUrl).toString();
                continue;
            }

            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(
                    `获取资源失败，HTTP 状态码: ${response.status}`,
                );
            }
            const contentLength = Number(
                response.headers.get("content-length") || 0,
            );
            if (contentLength > maxBytes) {
                await response.body?.cancel();
                throw new Error(`图片文件超出允许大小限制 (${maxBytes} 字节)`);
            }
            if (!response.body) throw new Error("资源响应缺少内容");

            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    length += value.byteLength;
                    if (length > maxBytes) {
                        throw new Error(
                            `图片文件超出允许大小限制 (${maxBytes} 字节)`,
                        );
                    }
                    chunks.push(value);
                }
            } catch (error) {
                await reader.cancel().catch(() => {});
                throw error;
            } finally {
                reader.releaseLock();
            }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
            }
            return {
                bytes,
                contentType: response.headers.get("content-type") ||
                    "application/octet-stream",
                finalUrl: currentUrl,
            };
        }
    } finally {
        clearTimeout(timeout);
    }
}
