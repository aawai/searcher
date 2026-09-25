import { CryptoVault } from "../../internal/crypto/vault.ts";

export function resolveEncryptionKey(explicitKey?: string): string {
    const key = explicitKey ??
        Deno.env.get("ENCRYPTION_KEY") ??
        Deno.env.get("APP_KEY") ??
        Deno.env.get("APP_SECRET");
    if (!key || key.trim().length === 0) {
        throw new Error(
            "AI Provider 加密密钥未配置。请设置 ENCRYPTION_KEY (或 APP_KEY / APP_SECRET) 环境变量。",
        );
    }
    return key;
}
function getCryptoVault(explicitKey?: string): CryptoVault {
    return new CryptoVault({ masterKey: resolveEncryptionKey(explicitKey) });
}

export async function encryptApiKey(
    apiKey: string,
    explicitKey?: string,
): Promise<string> {
    const vault = getCryptoVault(explicitKey);
    const { cipher } = await vault.fields.encrypt(apiKey);
    return cipher;
}

export async function decryptApiKey(
    cipher: string,
    explicitKey?: string,
): Promise<string> {
    const vault = getCryptoVault(explicitKey);
    return await vault.fields.decrypt(cipher);
}

export function maskApiKey(apiKey: string): string {
    if (!apiKey) return "";
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) {
        return "********";
    }
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}...${suffix}`;
}
