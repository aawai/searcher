import { bufferToHex } from "@internal/tool/encoding.ts";
import { CryptoVault } from "@internal/crypto/vault.ts";
import type { UserDto } from "@shared/contracts.ts";
import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { sessions, users } from "../../db/schema.ts";

export const SESSION_COOKIE_NAME = "searcher_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

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

    async createSession(userId: string, authVersion: number): Promise<{
        token: string;
        tokenHash: string;
        expiresAt: number;
    }> {
        const token = this.generateSessionToken();
        const tokenHash = await this.hashToken(token);
        const createdAt = this.#now();
        const expiresAt = createdAt + SESSION_MAX_AGE_SECONDS * 1000;

        await this.#store.run(async (db) => {
            await db.insert(sessions).values({
                tokenHash,
                userId,
                authVersion,
                expiresAt,
                createdAt,
            });
        });

        return { token, tokenHash, expiresAt };
    }

    async authenticateSessionToken(token: string): Promise<UserDto | null> {
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

            if (user.disabled) {
                return null;
            }

            if (session.authVersion !== user.authVersion) {
                // Outdated session: clean up
                await db.delete(sessions).where(
                    eq(sessions.tokenHash, tokenHash),
                );
                return null;
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

    async hashPassword(password: string): Promise<string> {
        return await this.#vault.passwords.hash(password);
    }

    async verifyPassword(candidate: string, hash: string): Promise<boolean> {
        return await this.#vault.passwords.verify(candidate, hash);
    }

    buildSessionCookieHeader(token: string): string {
        const isSecure = this.isSecureCookie();
        let cookie =
            `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
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
