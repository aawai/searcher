import { timingSafeEqual } from "node:crypto";
import { bufferToHex, hexToBuffer } from "../tool/encoding.ts";
import { derivePasswordBits, importHashedKey } from "./primitives.ts";

export interface ProtectedField {
    readonly cipher: string;
    readonly index?: string;
}

export interface CryptoVaultOptions {
    /** 高熵主密钥：使用至少 32 随机字节的 hex/base64 文本，不使用人工口令。缺省读取 APP_KEY / APP_SECRET。 */
    masterKey?: string;
    /** PBKDF2 迭代次数，默认 100,000；必须为 1–1,000,000 的整数。 */
    passwordIterations?: number;
}

const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 1_000_000;
const PASSWORD_ENVELOPE =
    /^pbkdf2:v1:([1-9][0-9]{0,6}):([0-9a-fA-F]{32}):([0-9a-fA-F]{64})$/;
const PBKDF2_SALT_LENGTH = 16;
const AES_GCM_IV_LENGTH = 12; // 96 bits for AES-GCM

export class CryptoVault {
    readonly #options: CryptoVaultOptions;
    readonly #textEncoder = new TextEncoder();
    readonly #textDecoder = new TextDecoder();

    #cachedAesKey?: CryptoKey;
    #cachedAesMasterKey?: string;
    #cachedHmacKey?: CryptoKey;
    #cachedHmacMasterKey?: string;

    readonly passwords = {
        hash: this.#hashPassword.bind(this),
        verify: this.#verifyPassword.bind(this),
    };

    readonly fields = {
        encrypt: this.#encryptField.bind(this),
        decrypt: this.#decryptField.bind(this),
        blindIndex: this.#blindIndex.bind(this),
    };

    constructor(options: CryptoVaultOptions = {}) {
        this.#options = options;
    }

    #resolveMasterKey(): string {
        const key = this.#options.masterKey ??
            Deno.env.get("APP_KEY") ??
            Deno.env.get("APP_SECRET");

        if (!key || key.trim().length === 0) {
            throw new Error(
                "CryptoVault: masterKey is required. Provide it in constructor options or set APP_KEY / APP_SECRET environment variable.",
            );
        }
        return key;
    }

    async #getAesCryptoKey(): Promise<CryptoKey> {
        const masterKey = this.#resolveMasterKey();
        if (this.#cachedAesKey && this.#cachedAesMasterKey === masterKey) {
            return this.#cachedAesKey;
        }

        this.#cachedAesKey = await importHashedKey(masterKey, "AES-GCM", [
            "encrypt",
            "decrypt",
        ]);
        this.#cachedAesMasterKey = masterKey;
        return this.#cachedAesKey;
    }

    async #getHmacCryptoKey(): Promise<CryptoKey> {
        const masterKey = this.#resolveMasterKey();
        if (this.#cachedHmacKey && this.#cachedHmacMasterKey === masterKey) {
            return this.#cachedHmacKey;
        }

        // 前缀隔离盲索引密钥；保留既有 SHA-256 派生规则。
        this.#cachedHmacKey = await importHashedKey(
            `blind-index-salt:${masterKey}`,
            "HMAC",
            ["sign", "verify"],
        );
        this.#cachedHmacMasterKey = masterKey;
        return this.#cachedHmacKey;
    }

    async #hashPassword(plain: string): Promise<string> {
        const iterations = this.#options.passwordIterations ??
            DEFAULT_PBKDF2_ITERATIONS;
        if (
            !Number.isInteger(iterations) || iterations < 1 ||
            iterations > MAX_PBKDF2_ITERATIONS
        ) {
            throw new RangeError(
                "passwordIterations must be an integer between 1 and 1000000",
            );
        }
        const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH));

        const derivedBits = await derivePasswordBits(plain, salt, iterations);

        const saltHex = bufferToHex(salt);
        const hashHex = bufferToHex(derivedBits);
        return `pbkdf2:v1:${iterations}:${saltHex}:${hashHex}`;
    }

    async #verifyPassword(candidate: string, hash: string): Promise<boolean> {
        // 先限长，避免 split/解码为攻击者提供的字符串分配额外内存。
        if (hash.length > 115) return false;
        const match = PASSWORD_ENVELOPE.exec(hash);
        if (!match || match[0].length !== hash.length) return false;
        const iterations = Number(match[1]);
        if (iterations > MAX_PBKDF2_ITERATIONS) return false;
        const saltHex = match[2];
        const expectedHashHex = match[3];
        try {
            const salt = hexToBuffer(saltHex);
            const expectedHash = hexToBuffer(expectedHashHex);

            const derivedBits = await derivePasswordBits(
                candidate,
                salt,
                iterations,
            );

            const actualHash = new Uint8Array(derivedBits);
            return timingSafeEqual(actualHash, expectedHash);
        } catch {
            return false;
        }
    }

    async #encryptField(
        plaintext: string,
        options?: { withIndex?: boolean },
    ): Promise<ProtectedField> {
        const aesKey = await this.#getAesCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));

        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey,
            this.#textEncoder.encode(plaintext),
        );

        const cipher = `v1:${bufferToHex(iv)}:${bufferToHex(ciphertextBuffer)}`;

        if (options?.withIndex) {
            const index = await this.#blindIndex(plaintext);
            return { cipher, index };
        }

        return { cipher };
    }

    async #decryptField(cipher: string): Promise<string> {
        const parts = cipher.split(":");
        const hexRegex = /^[0-9a-fA-F]+$/;
        if (
            parts.length !== 3 || parts[0] !== "v1" ||
            !parts[1] || parts[1].length % 2 !== 0 ||
            !hexRegex.test(parts[1]) ||
            !parts[2] || parts[2].length % 2 !== 0 || !hexRegex.test(parts[2])
        ) {
            throw new Error(
                "Invalid cipher envelope: expected format 'v1:<iv>:<ciphertext>'",
            );
        }

        const iv = hexToBuffer(parts[1]);
        const ciphertextBuffer = hexToBuffer(parts[2]);
        const aesKey = await this.#getAesCryptoKey();

        try {
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                aesKey,
                ciphertextBuffer,
            );
            return this.#textDecoder.decode(decryptedBuffer);
        } catch {
            throw new Error(
                "Decryption failed: invalid or tampered ciphertext",
            );
        }
    }

    async #blindIndex(plaintext: string): Promise<string> {
        const hmacKey = await this.#getHmacCryptoKey();
        const signature = await crypto.subtle.sign(
            "HMAC",
            hmacKey,
            this.#textEncoder.encode(plaintext),
        );
        return bufferToHex(signature);
    }
}

/** 开箱即用单例 */
export const vault: CryptoVault = new CryptoVault();
