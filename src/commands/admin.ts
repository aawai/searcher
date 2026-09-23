import { parseArgs } from "@std/cli/parse-args";
import { eq } from "drizzle-orm";
import { openDatabase } from "../db/database.ts";
import { preferences, sessions, users } from "../db/schema.ts";
import { AuthService } from "../features/auth/service.ts";

let pipedRemainder = "";
const decoder = new TextDecoder("utf-8");

function readHiddenInput(prompt: string): string {
    const encoder = new TextEncoder();
    Deno.stdout.writeSync(encoder.encode(prompt));

    let isTerminal = false;
    try {
        isTerminal = Deno.stdin.isTerminal();
    } catch {
        isTerminal = false;
    }

    if (!isTerminal) {
        // Non-interactive / piped input (e.g. CI, scripts, pipe): read single byte or buffered chunks until newline or EOF
        const buf = new Uint8Array(1);
        while (true) {
            const nlIdx = pipedRemainder.indexOf("\n");
            if (nlIdx !== -1) {
                let line = pipedRemainder.slice(0, nlIdx);
                pipedRemainder = pipedRemainder.slice(nlIdx + 1);
                if (line.endsWith("\r")) {
                    line = line.slice(0, -1);
                }
                return line;
            }

            const n = Deno.stdin.readSync(buf);
            if (n === null || n === 0) {
                let line = pipedRemainder;
                pipedRemainder = "";
                if (line.endsWith("\r")) {
                    line = line.slice(0, -1);
                }
                return line;
            }
            pipedRemainder += decoder.decode(buf.subarray(0, n), {
                stream: true,
            });
        }
    }

    let rawEnabled = false;
    try {
        Deno.stdin.setRaw(true);
        rawEnabled = true;
    } catch {
        rawEnabled = false;
    }

    const buf = new Uint8Array(32);
    let result = "";

    try {
        outer: while (true) {
            const n = Deno.stdin.readSync(buf);
            if (n === null || n === 0) break;
            const decoded = decoder.decode(buf.subarray(0, n), {
                stream: true,
            });

            for (const char of decoded) {
                if (char === "\r" || char === "\n") {
                    break outer;
                } else if (char === "\u0003") { // Ctrl+C
                    Deno.stdout.writeSync(encoder.encode("\n"));
                    Deno.exit(130);
                } else if (char === "\u0004") { // Ctrl+D (EOF)
                    break outer;
                } else if (char === "\u007f" || char === "\b") { // Backspace
                    if (result.length > 0) {
                        result = Array.from(result).slice(0, -1).join("");
                    }
                } else if (char >= " " || char === "\t") {
                    result += char;
                }
            }
        }
    } finally {
        if (rawEnabled) {
            try {
                Deno.stdin.setRaw(false);
            } catch {
                // Ignore
            }
        }
        Deno.stdout.writeSync(encoder.encode("\n"));
    }

    return result;
}
function normalizeUsername(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(trimmed)) {
        throw new Error("用户名格式不正确：需为 3–32 位的字母、数字或下划线");
    }
    return trimmed;
}

function validatePassword(password: string): void {
    if (password.length < 12 || password.length > 128) {
        throw new Error("密码长度须为 12–128 个字符");
    }
}

async function handleCreateAdmin(
    dbPath: string,
    usernameArg: string,
    origin: string,
) {
    const username = normalizeUsername(usernameArg);
    const store = openDatabase(dbPath);

    try {
        const existing = await store.run(async (db) => {
            const rows = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.username, username))
                .limit(1)
                .all();
            return rows[0] ?? null;
        });

        if (existing) {
            console.error(
                `错误：用户 '${username}' 已存在，不可重复创建或静默晋升`,
            );
            Deno.exit(1);
        }

        const pass1 = readHiddenInput("请输入管理员密码 (12-128 字符): ");
        validatePassword(pass1);

        const pass2 = readHiddenInput("请再次输入管理员密码确认: ");
        if (pass1 !== pass2) {
            console.error("错误：两次输入的密码不一致");
            Deno.exit(1);
        }

        const authService = new AuthService({ store, origin });
        const passwordHash = await authService.hashPassword(pass1);
        const currentTime = Date.now();
        const userId = crypto.randomUUID();

        await store.run(async (db) => {
            await db.transaction(async (tx) => {
                await tx.insert(users).values({
                    id: userId,
                    username,
                    displayName: username,
                    passwordHash,
                    role: "admin",
                    disabled: false,
                    authVersion: 1,
                    createdAt: currentTime,
                    updatedAt: currentTime,
                });

                await tx.insert(preferences).values({
                    userId,
                    defaultEngine: "bing",
                    theme: "system",
                });
            });
        });

        console.log(`管理员账户 '${username}' 创建成功`);
    } finally {
        await store.close();
    }
}

async function handleResetAdmin(
    dbPath: string,
    usernameArg: string,
    origin: string,
) {
    const username = normalizeUsername(usernameArg);
    const store = openDatabase(dbPath);

    try {
        const target = await store.run(async (db) => {
            const rows = await db
                .select({
                    id: users.id,
                    role: users.role,
                    authVersion: users.authVersion,
                })
                .from(users)
                .where(eq(users.username, username))
                .limit(1)
                .all();
            return rows[0] ?? null;
        });

        if (!target) {
            console.error(`错误：用户 '${username}' 不存在`);
            Deno.exit(1);
        }

        const pass1 = readHiddenInput("请输入新密码 (12-128 字符): ");
        validatePassword(pass1);

        const pass2 = readHiddenInput("请再次输入新密码确认: ");
        if (pass1 !== pass2) {
            console.error("错误：两次输入的密码不一致");
            Deno.exit(1);
        }

        const authService = new AuthService({ store, origin });
        const passwordHash = await authService.hashPassword(pass1);
        const currentTime = Date.now();

        await store.run(async (db) => {
            await db.transaction(async (tx) => {
                const [current] = await tx
                    .select({ authVersion: users.authVersion })
                    .from(users)
                    .where(eq(users.id, target.id))
                    .limit(1)
                    .all();

                if (!current) {
                    throw new Error("USER_NOT_FOUND");
                }

                // Optimistic concurrency check: verify authVersion has not changed while entering password
                if (current.authVersion !== target.authVersion) {
                    throw new Error(
                        "CONCURRENT_MODIFICATION: 用户凭据已被其他操作更新，请重试",
                    );
                }

                await tx
                    .update(users)
                    .set({
                        passwordHash,
                        authVersion: current.authVersion + 1,
                        updatedAt: currentTime,
                    })
                    .where(eq(users.id, target.id));

                await tx.delete(sessions).where(eq(sessions.userId, target.id));
            });
        });

        console.log(`用户 '${username}' 密码已重置，已撤销该用户全部会话`);
    } finally {
        await store.close();
    }
}

async function main() {
    const args = parseArgs(Deno.args, {
        string: ["db", "origin"],
        default: {
            db: Deno.env.get("DATABASE_PATH") ?? "./data/searcher.sqlite",
            origin: Deno.env.get("APP_ORIGIN") ?? "http://localhost:34567",
        },
    });

    const command = args._[0]?.toString();
    const targetUsername = args._[1]?.toString();

    if (
        !command || !targetUsername ||
        (command !== "create" && command !== "reset")
    ) {
        console.error("用法:");
        console.error("  deno task admin:create -- <username>");
        console.error("  deno task admin:reset -- <username>");
        Deno.exit(1);
    }

    try {
        if (command === "create") {
            await handleCreateAdmin(args.db, targetUsername, args.origin);
        } else if (command === "reset") {
            await handleResetAdmin(args.db, targetUsername, args.origin);
        }
    } catch (err) {
        console.error(
            `执行失败: ${err instanceof Error ? err.message : String(err)}`,
        );
        Deno.exit(1);
    }
}

if (import.meta.main) {
    await main();
}
