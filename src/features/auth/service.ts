import { bufferToHex } from "@internal/tool/encoding.ts";
import { CryptoVault } from "@internal/crypto/vault.ts";
import type { UserDto } from "@shared/contracts.ts";
import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { sessions, users } from "../../db/schema.ts";

export const SESSION_COOKIE_NAME = "searcher_session";
export const SESSION_NORMAL_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const SESSION_REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_MAX_AGE_SECONDS = SESSION_NORMAL_MAX_AGE_SECONDS;
export interface AuthServiceOptions {
    store: DatabaseStore;
    origin: string;
    now?: () => number;
    vault?: CryptoVault;
}

export class AuthService {
    readonly #store: DatabaseStore;
    readonly #origin: string;
    readonly #now: () => number;
    readonly #vault: CryptoVault;
    #dummyHashPromise: Promise<string>;

    constructor(options: AuthServiceOptions) {
        this.#store = options.store;
        this.#origin = options.origin;
        this.#now = options.now ?? (() => Date.now());
        this.#vault = options.vault ??
            new CryptoVault({ passwordIterations: 600_000 });

        // Generate dummy PBKDF2 hash asynchronously at initialization
        this.#dummyHashPromise = this.#vault.passwords.hash(
            "dummy_searcher_password_timing_protection",
        );
    }

    async getDummyHash(): Promise<string> {
        return await this.#dummyHashPromise;
    }

    isSecureCookie(): boolean {
        try {
            const parsed = new URL(this.#origin);
            return parsed.protocol === "https:";
        } catch {
            return false;
        }
    }

    async hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return bufferToHex(digest);
    }

    generateSessionToken(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        // base64url encoding
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    async createSession(
        userId: string,
        authVersion: number,
        options: {
            rememberMe?: boolean;
            userAgent?: string;
            ip?: string;
        } = {},
    ): Promise<{
        token: string;
        tokenHash: string;
        expiresAt: number;
        maxAgeSeconds: number;
    }> {
        const token = this.generateSessionToken();
        const tokenHash = await this.hashToken(token);
        const createdAt = this.#now();
        const maxAgeSeconds = options.rememberMe
            ? SESSION_REMEMBER_MAX_AGE_SECONDS
            : SESSION_NORMAL_MAX_AGE_SECONDS;
        const expiresAt = createdAt + maxAgeSeconds * 1000;

        await this.#store.run(async (db) => {
            await db.insert(sessions).values({
                tokenHash,
                userId,
                authVersion,
                lastActiveAt: createdAt,
                userAgent: options.userAgent ?? null,
                ip: options.ip ?? null,
                expiresAt,
                createdAt,
            });
        });

        return { token, tokenHash, expiresAt, maxAgeSeconds };
    }

    async authenticateSessionToken(
        token: string,
        options: { updateActivity?: boolean } = {},
    ): Promise<UserDto | null> {
        const tokenHash = await this.hashToken(token);
        const currentTime = this.#now();

        return await this.#store.run(async (db) => {
            const rows = await db
                .select({
                    user: users,
                    session: sessions,
                })
                .from(sessions)
                .innerJoin(users, eq(sessions.userId, users.id))
                .where(eq(sessions.tokenHash, tokenHash))
                .limit(1)
                .all();

            if (rows.length === 0) {
                return null;
            }

            const { user, session } = rows[0];

            if (session.expiresAt <= currentTime) {
                // Expired session: clean up
                await db.delete(sessions).where(
                    eq(sessions.tokenHash, tokenHash),
                );
                return null;
            }

            if (user.disabled || user.softDeletedAt !== null) {
                return null;
            }

            if (session.authVersion !== user.authVersion) {
                // Outdated session: clean up
                await db.delete(sessions).where(
                    eq(sessions.tokenHash, tokenHash),
                );
                return null;
            }

            if (options.updateActivity) {
                await db.update(sessions).set({
                    lastActiveAt: currentTime,
                }).where(eq(sessions.tokenHash, tokenHash));
            }

            return {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
            };
        });
    }

    async revokeSession(token: string): Promise<void> {
        const tokenHash = await this.hashToken(token);
        await this.#store.run(async (db) => {
            await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
        });
    }

    async revokeAllUserSessions(userId: string): Promise<void> {
        await this.#store.run(async (db) => {
            await db.delete(sessions).where(eq(sessions.userId, userId));
        });
    }

    async revokeOtherUserSessions(
        userId: string,
        currentToken: string,
    ): Promise<void> {
        const currentTokenHash = await this.hashToken(currentToken);
        await this.#store.run(async (db) => {
            const allUserSessions = await db
                .select({ tokenHash: sessions.tokenHash })
                .from(sessions)
                .where(eq(sessions.userId, userId))
                .all();

            for (const s of allUserSessions) {
                if (s.tokenHash !== currentTokenHash) {
                    await db.delete(sessions).where(
                        eq(sessions.tokenHash, s.tokenHash),
                    );
                }
            }
        });
    }

    async listUserSessions(
        userId: string,
        currentToken?: string,
    ): Promise<
        Array<{
            id: string;
            isCurrent: boolean;
            userAgent: string | null;
            ip: string | null;
            createdAt: number;
            lastActiveAt: number | null;
            expiresAt: number;
        }>
    > {
        const currentTokenHash = currentToken
            ? await this.hashToken(currentToken)
            : null;
        const currentTime = this.#now();

        return await this.#store.run(async (db) => {
            const rows = await db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, userId))
                .all();

            return rows
                .filter((s) => s.expiresAt > currentTime)
                .map((s) => ({
                    id: s.tokenHash.slice(0, 16),
                    isCurrent: currentTokenHash !== null &&
                        s.tokenHash === currentTokenHash,
                    userAgent: s.userAgent,
                    ip: s.ip,
                    createdAt: s.createdAt,
                    lastActiveAt: s.lastActiveAt,
                    expiresAt: s.expiresAt,
                }));
        });
    }

    async revokeUserSessionById(
        userId: string,
        sessionPrefix: string,
    ): Promise<boolean> {
        return await this.#store.run(async (db) => {
            const userSessions = await db
                .select({ tokenHash: sessions.tokenHash })
                .from(sessions)
                .where(eq(sessions.userId, userId))
                .all();

            const target = userSessions.find((s) =>
                s.tokenHash.startsWith(sessionPrefix)
            );
            if (!target) return false;

            await db.delete(sessions).where(
                eq(sessions.tokenHash, target.tokenHash),
            );
            return true;
        });
    }

    async hashPassword(password: string): Promise<string> {
        return await this.#vault.passwords.hash(password);
    }

    async verifyPassword(candidate: string, hash: string): Promise<boolean> {
        return await this.#vault.passwords.verify(candidate, hash);
    }

    buildSessionCookieHeader(
        token: string,
        maxAgeSeconds: number = SESSION_NORMAL_MAX_AGE_SECONDS,
    ): string {
        const isSecure = this.isSecureCookie();
        let cookie =
            `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
        if (isSecure) {
            cookie += "; Secure";
        }
        return cookie;
    }

    buildClearSessionCookieHeader(): string {
        const isSecure = this.isSecureCookie();
        let cookie =
            `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
        if (isSecure) {
            cookie += "; Secure";
        }
        return cookie;
    }
}
