/**
 * WebAppIconService:
 * Manages fetching, validation, local storage, and retrieval of Web App icons.
 * Adheres to Spec 01 §10 (apple-touch-icon -> manifest -> link rel=icon -> favicon)
 * and Spec 03 §9/§10 (SHA-256 deduplication and local file assets).
 */

import { dirname, join } from "@std/path";
import { ManifestCorruptionError } from "../wallpaper/service.ts";
import {
    extractCandidateIconsFromHtml,
    extractSiteNameFromHtml,
    fetchWithSafeLimit,
} from "./fetcher.ts";
import { validateImageBytes } from "./validator.ts";
import { validateUrlForSafeFetch } from "./ssrf.ts";
import { normalizeIcon } from "./presentation.ts";

export interface IconRecord {
    id: string;
    ownerUserId: string | null;
    contentType: string;
    size: number;
    sha256: string;
    relativePath: string;
    createdAt: number;
    presentationVersion?: 1;
}

export class WebAppIconService {
    readonly #storageDir: string;
    readonly #manifestPath: string;
    readonly #now: () => number;
    #lockTail: Promise<void> = Promise.resolve();

    constructor(
        storageDir?: string,
        now: () => number = () => Date.now(),
    ) {
        if (storageDir) {
            this.#storageDir = storageDir;
        } else {
            const dbPath = Deno.env.get("DATABASE_PATH") ??
                "./data/searcher.sqlite";
            if (dbPath === ":memory:") {
                this.#storageDir = "./data/icons";
            } else {
                this.#storageDir = join(dirname(dbPath), "icons");
            }
        }
        this.#manifestPath = join(this.#storageDir, "manifest.json");
        this.#now = now;
    }

    get storageDir(): string {
        return this.#storageDir;
    }

    async #withLock<T>(fn: () => Promise<T>): Promise<T> {
        const prev = this.#lockTail;
        const { promise, resolve } = Promise.withResolvers<void>();
        this.#lockTail = promise;
        await prev;
        try {
            return await fn();
        } finally {
            resolve();
        }
    }

    async #readManifest(): Promise<Map<string, IconRecord>> {
        await Deno.mkdir(this.#storageDir, { recursive: true });

        let content: string;
        try {
            content = await Deno.readTextFile(this.#manifestPath);
        } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                await this.#atomicWriteManifest([]);
                return new Map<string, IconRecord>();
            }
            throw e;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new ManifestCorruptionError("图标清单文件损坏，拒绝静默覆盖");
        }

        if (!Array.isArray(parsed)) {
            throw new ManifestCorruptionError("图标清单格式非法：预期为数组");
        }

        const map = new Map<string, IconRecord>();
        for (const item of parsed) {
            if (
                item && typeof item === "object" && typeof item.id === "string"
            ) {
                map.set(item.id, item as IconRecord);
            }
        }

        return map;
    }

    async #atomicWriteManifest(records: IconRecord[]): Promise<void> {
        const tmpPath = `${this.#manifestPath}.${crypto.randomUUID()}.tmp`;
        const payload = JSON.stringify(records, null, 2);
        try {
            await Deno.writeTextFile(tmpPath, payload);
            await Deno.rename(tmpPath, this.#manifestPath);
        } catch (err) {
            await Deno.remove(tmpPath).catch(() => {});
            throw err;
        }
    }

    /**
     * Compute SHA-256 hex string for given bytes.
     */
    async #computeSha256(bytes: Uint8Array): Promise<string> {
        const input = bytes.buffer instanceof ArrayBuffer
            ? bytes as Uint8Array<ArrayBuffer>
            : new Uint8Array(bytes);
        const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", input),
        );
        let hash = "";
        for (const byte of digest) hash += byte.toString(16).padStart(2, "0");
        return hash;
    }

    /**
     * Saves raw or validated icon bytes to disk.
     * Deduplicates identical file content by SHA-256.
     */
    async saveIcon(
        userId: string | null,
        rawBytes: Uint8Array,
    ): Promise<IconRecord & { url: string }> {
        const validation = validateImageBytes(rawBytes);
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        const finalBytes = await normalizeIcon(
            validation.sanitizedBytes ?? rawBytes,
            validation.contentType,
        );
        const sha256 = await this.#computeSha256(finalBytes);

        return await this.#withLock(async () => {
            const manifest = await this.#readManifest();

            // Check if existing asset with same sha256 exists
            for (const existing of manifest.values()) {
                if (existing.sha256 === sha256) {
                    return {
                        ...existing,
                        url: `/api/webapp-icons/${existing.id}`,
                    };
                }
            }

            const id = crypto.randomUUID();
            const ext = "png";

            const fileName = `${id}.${ext}`;
            const relativePath = fileName;
            const fullPath = join(this.#storageDir, fileName);

            // Write image file
            await Deno.writeFile(fullPath, finalBytes);

            const record: IconRecord = {
                id,
                ownerUserId: userId,
                contentType: "image/png",
                size: finalBytes.length,
                sha256,
                relativePath,
                createdAt: this.#now(),
                presentationVersion: 1,
            };

            manifest.set(id, record);
            await this.#atomicWriteManifest(Array.from(manifest.values()));

            return {
                ...record,
                url: `/api/webapp-icons/${id}`,
            };
        });
    }

    /**
     * Gets icon binary by id.
     */
    async getIcon(
        id: string,
    ): Promise<{ record: IconRecord; bytes: Uint8Array } | null> {
        return await this.#withLock(async () => {
            const manifest = await this.#readManifest();
            const record = manifest.get(id);
            if (!record) return null;

            const fullPath = join(this.#storageDir, record.relativePath);
            try {
                let bytes: Uint8Array = await Deno.readFile(fullPath);
                if (record.presentationVersion !== 1) {
                    bytes = await normalizeIcon(bytes, record.contentType);
                    await Deno.writeFile(fullPath, bytes);
                    record.contentType = "image/png";
                    record.size = bytes.length;
                    record.sha256 = await this.#computeSha256(bytes);
                    record.presentationVersion = 1;
                    await this.#atomicWriteManifest([...manifest.values()]);
                }
                return { record, bytes };
            } catch {
                return null;
            }
        });
    }

    /**
     * Automatically fetches website icon following priority:
     * apple-touch-icon -> manifest icons -> link rel=icon -> favicon.ico
     */
    async fetchAndSaveFromWebsite(
        userId: string | null,
        targetUrl: string,
    ): Promise<IconRecord & { url: string; siteName: string | null }> {
        const validatedUrl = await validateUrlForSafeFetch(targetUrl);

        // Never follow redirects or buffer unbounded remote HTML.
        let html = "";
        try {
            const { bytes } = await fetchWithSafeLimit(
                validatedUrl.toString(),
                {
                    timeoutMs: 6000,
                    maxBytes: 512 * 1024,
                    accept: "text/html,application/xhtml+xml",
                },
            );
            html = new TextDecoder().decode(bytes);
        } catch {
            // Fall back to /favicon.ico directly if HTML cannot be read.
        }

        const siteName = extractSiteNameFromHtml(html);
        const candidates = extractCandidateIconsFromHtml(
            html,
            validatedUrl.toString(),
        );

        let lastError: Error | null = null;
        for (const candidate of candidates) {
            try {
                if (candidate.type === "manifest") {
                    // Try parsing webmanifest
                    try {
                        const { bytes: manifestBytes } =
                            await fetchWithSafeLimit(candidate.url, {
                                timeoutMs: 5000,
                                maxBytes: 128 * 1024,
                                accept:
                                    "application/manifest+json,application/json",
                            });
                        const manifestJson: unknown = JSON.parse(
                            new TextDecoder().decode(manifestBytes),
                        );
                        if (
                            manifestJson && typeof manifestJson === "object" &&
                            "icons" in manifestJson &&
                            Array.isArray(manifestJson.icons)
                        ) {
                            const icons = manifestJson.icons.filter(
                                (
                                    icon,
                                ): icon is { src: string; sizes?: unknown } =>
                                    Boolean(icon) && typeof icon === "object" &&
                                    "src" in icon &&
                                    typeof icon.src === "string",
                            ).sort((a, b) =>
                                (Number.parseInt(String(b.sizes ?? "")) || 0) -
                                (Number.parseInt(String(a.sizes ?? "")) || 0)
                            );
                            for (const icon of icons) {
                                try {
                                    const iconAbs = new URL(
                                        icon.src,
                                        candidate.url,
                                    ).toString();
                                    const { bytes } = await fetchWithSafeLimit(
                                        iconAbs,
                                    );
                                    return {
                                        ...await this.saveIcon(userId, bytes),
                                        siteName,
                                    };
                                } catch {
                                    // A broken large candidate must not hide another manifest icon.
                                }
                            }
                        }
                    } catch {
                        continue;
                    }
                } else {
                    const { bytes } = await fetchWithSafeLimit(candidate.url);
                    return { ...await this.saveIcon(userId, bytes), siteName };
                }
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                continue;
            }
        }

        throw lastError ?? new Error("未能抓取到有效的站点图标");
    }

    /**
     * Fetches an icon directly from an image URL and saves locally.
     */
    async fetchAndSaveFromUrl(
        userId: string | null,
        imageUrl: string,
    ): Promise<IconRecord & { url: string }> {
        const { bytes } = await fetchWithSafeLimit(imageUrl);
        return await this.saveIcon(userId, bytes);
    }
}
