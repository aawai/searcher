/**
 * SSRF and IP validation utility.
 * Protects against internal network scanning and local services via URL fetch.
 */

export function isPrivateOrRestrictedIp(ip: string): boolean {
    const trimmed = ip.trim();

    // Check IPv4
    const ipv4Parts = trimmed.split(".");
    if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
        const nums = ipv4Parts.map(Number);
        if (nums.some((n) => n < 0 || n > 255)) return true;

        const [a, b, _c, _d] = nums;

        // 0.0.0.0/8 (Current network)
        if (a === 0) return true;
        // 10.0.0.0/8 (Private-Use)
        if (a === 10) return true;
        // 127.0.0.0/8 (Loopback)
        if (a === 127) return true;
        // 169.254.0.0/16 (Link-Local)
        if (a === 169 && b === 254) return true;
        // 172.16.0.0/12 (Private-Use: 172.16.0.0 – 172.31.255.255)
        if (a === 172 && b >= 16 && b <= 31) return true;
        // 192.168.0.0/16 (Private-Use)
        if (a === 192 && b === 168) return true;
        // 100.64.0.0/10 (Shared Address Space)
        if (a === 100 && b >= 64 && b <= 127) return true;
        // 192.0.0.0/24 (IETF Protocol Assignments)
        if (a === 192 && b === 0 && nums[2] === 0) return true;
        // 192.0.2.0/24 (TEST-NET-1)
        if (a === 192 && b === 0 && nums[2] === 2) return true;
        // 198.51.100.0/24 (TEST-NET-2)
        if (a === 198 && b === 51 && nums[2] === 100) return true;
        // 203.0.113.0/24 (TEST-NET-3)
        if (a === 203 && b === 0 && nums[2] === 113) return true;
        // 224.0.0.0/4 (Multicast: 224 - 239)
        if (a >= 224 && a <= 239) return true;
        // 240.0.0.0/4 (Reserved / Future Use: 240 - 255)
        if (a >= 240) return true;

        return false;
    }

    // Check IPv6
    const cleanIpv6 = trimmed.toLowerCase();
    if (
        cleanIpv6 === "::" || cleanIpv6 === "::1" ||
        cleanIpv6 === "0:0:0:0:0:0:0:1"
    ) {
        return true;
    }
    // Link-local: fe80::/10
    if (
        cleanIpv6.startsWith("fe8") || cleanIpv6.startsWith("fe9") ||
        cleanIpv6.startsWith("fea") || cleanIpv6.startsWith("feb")
    ) {
        return true;
    }
    // Unique local address: fc00::/7 (fc00:: - fdff::)
    if (cleanIpv6.startsWith("fc") || cleanIpv6.startsWith("fd")) {
        return true;
    }
    // IPv4-mapped IPv6: ::ffff:127.0.0.1
    if (cleanIpv6.startsWith("::ffff:")) {
        const v4Part = cleanIpv6.slice(7);
        return isPrivateOrRestrictedIp(v4Part);
    }

    return false;
}

const LOCAL_HOSTNAME_PATTERNS = [
    /^localhost$/i,
    /\.localhost$/i,
    /^local$/i,
    /\.local$/i,
    /^internal$/i,
    /\.internal$/i,
    /^lan$/i,
    /\.lan$/i,
];

/**
 * Validates a URL for safe server-side fetch.
 * Checks resolved A/AAAA addresses; redirects are disabled by the fetcher.
 * DNS rebinding between this check and the connection is not eliminated.
 */
export async function validateUrlForSafeFetch(
    rawUrl: string,
    options?: { allowDnsLookup?: boolean },
): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error("无效的 URL 格式");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("仅支持 HTTP / HTTPS 协议");
    }

    if (parsed.username || parsed.password) {
        throw new Error("URL 禁止携带用户名密码");
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check local hostname
    if (LOCAL_HOSTNAME_PATTERNS.some((pat) => pat.test(hostname))) {
        throw new Error("禁止访问本地或内部网络");
    }

    // Direct IP check
    if (isPrivateOrRestrictedIp(hostname)) {
        throw new Error("禁止访问私有或保留 IP 范围");
    }

    // Check both address families before fetching; a failed lookup is not an allow decision.
    if (
        options?.allowDnsLookup !== false &&
        typeof Deno !== "undefined" && typeof Deno.resolveDns === "function"
    ) {
        const [ipv4, ipv6] = await Promise.all([
            Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
            Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
        ]);
        const addresses = [...ipv4, ...ipv6];
        if (addresses.length === 0 || addresses.some(isPrivateOrRestrictedIp)) {
            throw new Error("域名未解析到可访问的公开 IP");
        }
    }

    return parsed;
}
