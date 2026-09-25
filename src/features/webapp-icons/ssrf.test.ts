import { assertEquals } from "@std/assert";
import { isPrivateOrRestrictedIp, validateUrlForSafeFetch } from "./ssrf.ts";

Deno.test("isPrivateOrRestrictedIp identifies IPv4 private/loopback/link-local/special", () => {
    assertEquals(isPrivateOrRestrictedIp("127.0.0.1"), true);
    assertEquals(isPrivateOrRestrictedIp("127.255.255.255"), true);
    assertEquals(isPrivateOrRestrictedIp("10.0.0.1"), true);
    assertEquals(isPrivateOrRestrictedIp("172.16.0.1"), true);
    assertEquals(isPrivateOrRestrictedIp("172.31.255.255"), true);
    assertEquals(isPrivateOrRestrictedIp("192.168.1.1"), true);
    assertEquals(isPrivateOrRestrictedIp("169.254.169.254"), true);
    assertEquals(isPrivateOrRestrictedIp("0.0.0.0"), true);
    assertEquals(isPrivateOrRestrictedIp("255.255.255.255"), true);
    assertEquals(isPrivateOrRestrictedIp("224.0.0.1"), true);

    // Public IPs
    assertEquals(isPrivateOrRestrictedIp("8.8.8.8"), false);
    assertEquals(isPrivateOrRestrictedIp("1.1.1.1"), false);
    assertEquals(isPrivateOrRestrictedIp("142.250.190.46"), false);
});

Deno.test("isPrivateOrRestrictedIp identifies IPv6 loopback/link-local/unique-local", () => {
    assertEquals(isPrivateOrRestrictedIp("::1"), true);
    assertEquals(isPrivateOrRestrictedIp("::"), true);
    assertEquals(isPrivateOrRestrictedIp("fe80::1"), true);
    assertEquals(isPrivateOrRestrictedIp("fc00::1"), true);
    assertEquals(isPrivateOrRestrictedIp("fd12:3456:789a::1"), true);

    // Public IPv6
    assertEquals(isPrivateOrRestrictedIp("2606:4700:4700::1111"), false);
});

Deno.test("validateUrlForSafeFetch rejects non-http/https, localhost, credentials", async () => {
    await validateUrlForSafeFetch("ftp://example.com").then(
        () => {
            throw new Error("Should have thrown");
        },
        (e) => assertEquals(e.message.includes("仅支持 HTTP / HTTPS"), true),
    );

    await validateUrlForSafeFetch("http://user:pass@example.com").then(
        () => {
            throw new Error("Should have thrown");
        },
        (e) => assertEquals(e.message.includes("禁止携带用户名密码"), true),
    );

    await validateUrlForSafeFetch("http://localhost/icon.png").then(
        () => {
            throw new Error("Should have thrown");
        },
        (e) => assertEquals(e.message.includes("禁止访问本地或内部网络"), true),
    );

    await validateUrlForSafeFetch("http://127.0.0.1:8080/icon.png").then(
        () => {
            throw new Error("Should have thrown");
        },
        (e) => assertEquals(e.message.includes("禁止访问私有或保留 IP"), true),
    );

    await validateUrlForSafeFetch("http://192.168.1.100/test").then(
        () => {
            throw new Error("Should have thrown");
        },
        (e) => assertEquals(e.message.includes("禁止访问私有或保留 IP"), true),
    );
});
