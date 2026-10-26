import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { CryptoVault, vault } from "./vault.ts";

Deno.test({
    name: "CryptoVault: passwords.hash 与 passwords.verify 正确验证与防碰撞",
    async fn() {
        const customVault = new CryptoVault({
            masterKey: "test-master-secret-key-123456",
        });
        const plain = "mySecretPassword#2026";

        const hash1 = await customVault.passwords.hash(plain);
        const hash2 = await customVault.passwords.hash(plain);

        // 随机盐导致不同哈希
        assertNotEquals(hash1, hash2);

        // 正确验证
        assertEquals(await customVault.passwords.verify(plain, hash1), true);
        assertEquals(await customVault.passwords.verify(plain, hash2), true);

        // 错误密码拒绝
        assertEquals(
            await customVault.passwords.verify("wrongPassword", hash1),
            false,
        );

        // 非法格式哈希安全拒绝（包括奇数长度 hex、非 hex 字符与截断字段）
        assertEquals(
            await customVault.passwords.verify(plain, "invalid-hash-format"),
            false,
        );
        assertEquals(
            await customVault.passwords.verify(
                plain,
                "pbkdf2:v1:1000:00112233445566778899aabbccddeeff:0",
            ),
            false,
        );
        assertEquals(
            await customVault.passwords.verify(
                plain,
                "pbkdf2:v1:1000:0:00112233445566778899aabbccddeeff",
            ),
            false,
        );
        assertEquals(
            await customVault.passwords.verify(
                plain,
                "pbkdf2:v1:1000:not-hex-chars:00112233445566778899aabbccddeeff",
            ),
            false,
        );
    },
});
Deno.test({
    name:
        "CryptoVault: fields.encrypt 与 fields.decrypt 保证加解密正确性与 UTF-8 支持",
    async fn() {
        const customVault = new CryptoVault({
            masterKey: "test-master-secret-key-123456",
        });
        const secretText =
            "用户敏感信息：身份证 110101199003072345 📱+86-13800138000 🚀";

        const { cipher: cipher1 } = await customVault.fields.encrypt(
            secretText,
        );
        const { cipher: cipher2 } = await customVault.fields.encrypt(
            secretText,
        );

        // 随机 IV 导致密文不同
        assertNotEquals(cipher1, cipher2);

        // 解密还原
        const decrypted1 = await customVault.fields.decrypt(cipher1);
        const decrypted2 = await customVault.fields.decrypt(cipher2);
        assertEquals(decrypted1, secretText);
        assertEquals(decrypted2, secretText);
    },
});

Deno.test({
    name: "CryptoVault: fields.decrypt 拒绝篡改密文与非法格式",
    async fn() {
        const customVault = new CryptoVault({
            masterKey: "test-master-secret-key-123456",
        });
        const secretText = "confidential-data";

        const { cipher } = await customVault.fields.encrypt(secretText);
        const parts = cipher.split(":");
        // Flip one bit: replacing the last byte with a constant can leave it
        // unchanged (e.g. when it already ends in ff).
        const changedByte = (Number.parseInt(parts[2].slice(-2), 16) ^ 1)
            .toString(16).padStart(2, "0");
        const tamperedCipher = `${parts[0]}:${parts[1]}:${
            parts[2].slice(0, -2)
        }${changedByte}`;

        await assertRejects(
            () => customVault.fields.decrypt(tamperedCipher),
            Error,
            "Decryption failed",
        );

        await assertRejects(
            () => customVault.fields.decrypt("invalid:cipher"),
            Error,
            "Invalid cipher envelope",
        );
    },
});

Deno.test({
    name:
        "CryptoVault: fields.blindIndex 提供确定性索引供可搜索加密查询与独立密钥缓存隔离",
    async fn() {
        const customVault = new CryptoVault({
            masterKey: "test-master-secret-key-123456",
        });
        const email = "alice@example.com";

        const index1 = await customVault.fields.blindIndex(email);
        const index2 = await customVault.fields.blindIndex(email);
        const indexOther = await customVault.fields.blindIndex(
            "bob@example.com",
        );

        // 相同输入产生相同索引
        assertEquals(index1, index2);
        // 不同输入产生不同索引
        assertNotEquals(index1, indexOther);

        // encrypt 传入 withIndex: true 时同时返回盲索引
        const result = await customVault.fields.encrypt(email, {
            withIndex: true,
        });
        assertEquals(result.index, index1);
        assertEquals(await customVault.fields.decrypt(result.cipher), email);
    },
});

Deno.test({
    name: "CryptoVault: HMAC 盲索引密钥与 AES 密钥在环境变量动态切换时互不污染",
    async fn() {
        const originalAppKey = Deno.env.get("APP_KEY");
        try {
            Deno.env.set("APP_KEY", "key-A");
            await vault.fields.encrypt("test-data");

            Deno.env.set("APP_KEY", "key-B");
            const indexB = await vault.fields.blindIndex("alice@example.com");

            Deno.env.set("APP_KEY", "key-A");
            const indexA = await vault.fields.blindIndex("alice@example.com");

            // 确认切回 key-A 后不会复用 key-B 的 HMAC 缓存
            assertNotEquals(indexA, indexB);
            const freshVaultA = new CryptoVault({ masterKey: "key-A" });
            assertEquals(
                indexA,
                await freshVaultA.fields.blindIndex("alice@example.com"),
            );
        } finally {
            if (originalAppKey !== undefined) {
                Deno.env.set("APP_KEY", originalAppKey);
            } else {
                Deno.env.delete("APP_KEY");
            }
        }
    },
});

Deno.test({
    name:
        "CryptoVault: 默认从 APP_KEY 环境变量解析 masterKey 并支持开箱即用单例",
    async fn() {
        const originalAppKey = Deno.env.get("APP_KEY");
        try {
            Deno.env.set("APP_KEY", "env-provided-app-key-987654");

            const plain = "auto-env-secret";
            const { cipher } = await vault.fields.encrypt(plain);
            const decrypted = await vault.fields.decrypt(cipher);
            assertEquals(decrypted, plain);
        } finally {
            if (originalAppKey !== undefined) {
                Deno.env.set("APP_KEY", originalAppKey);
            } else {
                Deno.env.delete("APP_KEY");
            }
        }
    },
});

Deno.test({
    name:
        "CryptoVault: 缺少 APP_KEY/APP_SECRET 且未显式指定 masterKey 时抛错（拒绝回退到 JWT_SECRET）",
    async fn() {
        const originalAppKey = Deno.env.get("APP_KEY");
        const originalAppSecret = Deno.env.get("APP_SECRET");
        const originalJwtSecret = Deno.env.get("JWT_SECRET");
        try {
            Deno.env.delete("APP_KEY");
            Deno.env.delete("APP_SECRET");
            Deno.env.set("JWT_SECRET", "should-not-be-used-as-master-key");

            const unconfiguredVault = new CryptoVault();

            await assertRejects(
                () => unconfiguredVault.fields.encrypt("data"),
                Error,
                "CryptoVault: masterKey is required. Provide it in constructor options or set APP_KEY / APP_SECRET environment variable.",
            );
        } finally {
            if (originalAppKey !== undefined) {
                Deno.env.set("APP_KEY", originalAppKey);
            } else {
                Deno.env.delete("APP_KEY");
            }
            if (originalAppSecret !== undefined) {
                Deno.env.set("APP_SECRET", originalAppSecret);
            } else {
                Deno.env.delete("APP_SECRET");
            }
            if (originalJwtSecret !== undefined) {
                Deno.env.set("JWT_SECRET", originalJwtSecret);
            } else {
                Deno.env.delete("JWT_SECRET");
            }
        }
    },
});

Deno.test("CryptoVault: 拒绝非规范迭代次数及超限密码记录", async () => {
    const customVault = new CryptoVault({ passwordIterations: 1000 });
    const hash = await customVault.passwords.hash("password");
    assertEquals(
        await customVault.passwords.verify(
            "password",
            hash.replace(":1000:", ":1000junk:"),
        ),
        false,
    );
    for (const iterations of [0, -1, 1.5, NaN, Infinity, 1_000_001]) {
        await assertRejects(
            () =>
                new CryptoVault({ passwordIterations: iterations }).passwords
                    .hash("password"),
            RangeError,
        );
    }
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("password"),
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    // 使用数学上有效的哈希，确保拒绝来自策略限制，而非密码不匹配。
    for (
        const [iterations, saltLength, bits] of [[1_000_001, 16, 256], [
            1000,
            17,
            256,
        ], [1000, 16, 512]]
    ) {
        const salt = new Uint8Array(saltLength);
        const derived = await crypto.subtle.deriveBits(
            { name: "PBKDF2", hash: "SHA-256", salt, iterations },
            key,
            bits,
        );
        const hex = Array.from(
            new Uint8Array(derived),
            (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        assertEquals(
            await customVault.passwords.verify(
                "password",
                `pbkdf2:v1:${iterations}:${"00".repeat(saltLength)}:${hex}`,
            ),
            false,
        );
    }
});
