export function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("URL不能为空");
    }

    let urlToParse = trimmed;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(urlToParse)) {
        urlToParse = `https://${urlToParse}`;
    }

    let parsed: URL;
    try {
        parsed = new URL(urlToParse);
    } catch {
        throw new Error("无效的URL格式");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("仅支持 http 或 https 协议");
    }

    if (parsed.username || parsed.password) {
        throw new Error("URL不能包含用户名或密码");
    }

    if (parsed.href.length > 2048) {
        throw new Error("URL长度不能超过2048个字符");
    }

    return parsed.href;
}
