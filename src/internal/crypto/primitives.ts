const encoder = new TextEncoder();

/** 共享 Web Crypto 运算；envelope、校验与缓存由调用方负责。 */
export async function derivePasswordBits(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
    length = 256,
): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    return crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        key,
        length,
    );
}

/** 保留既有 SHA-256 派生规则，不是针对低熵口令的 KDF。 */
export async function importHashedKey(
    secret: string,
    algorithm: "AES-GCM" | "HMAC",
    usages: KeyUsage[],
): Promise<CryptoKey> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(secret),
    );
    return crypto.subtle.importKey(
        "raw",
        digest,
        algorithm === "HMAC" ? { name: "HMAC", hash: "SHA-256" } : algorithm,
        false,
        usages,
    );
}
