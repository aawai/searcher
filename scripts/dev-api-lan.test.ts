import { assertEquals } from "@std/assert";
import { collectLanDevOrigins, resolveLanDevOriginEnv } from "./dev-api-lan.ts";

Deno.test("collectLanDevOrigins: includes loopback and sorted unique private IPv4 addresses", () => {
    const origins = collectLanDevOrigins([
        { family: "IPv4", address: "127.0.0.1" },
        { family: "IPv4", address: "192.168.1.42" },
        { family: "IPv4", address: "10.0.0.8" },
        { family: "IPv4", address: "192.168.1.42" },
        { family: "IPv4", address: "8.8.8.8" },
        { family: "IPv6", address: "fe80::1" },
        { family: "IPv6", address: "::1" },
    ]);

    assertEquals(origins, [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://10.0.0.8:5173",
        "http://192.168.1.42:5173",
    ]);
});

Deno.test("resolveLanDevOriginEnv: preserves explicit APP_ORIGIN override", () => {
    const resolved = resolveLanDevOriginEnv(
        "http://192.168.50.10:5173",
        [{ family: "IPv4", address: "192.168.1.42" }],
    );
    assertEquals(resolved, "http://192.168.50.10:5173");

    const fallback = resolveLanDevOriginEnv(
        "   ",
        [{ family: "IPv4", address: "192.168.1.42" }],
    );
    assertEquals(
        fallback,
        "http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.42:5173",
    );
});
