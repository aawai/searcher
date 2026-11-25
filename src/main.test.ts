import { assertEquals, assertThrows } from "@std/assert";
import {
    isLoopbackOriginHost,
    isPrivateLanOriginHost,
    parseAppOrigin,
} from "./main.ts";

Deno.test("parseAppOrigin: production requires APP_ORIGIN and rejects non-loopback HTTP", () => {
    assertThrows(
        () => parseAppOrigin(undefined, "production"),
        Error,
        "APP_ORIGIN is required in production",
    );

    assertEquals(
        parseAppOrigin("http://localhost:34567", "production"),
        "http://localhost:34567",
    );
    assertEquals(
        parseAppOrigin("https://search.example.com", "production"),
        "https://search.example.com",
    );

    for (
        const lanOrigin of [
            "http://192.168.1.20:5173",
            "http://10.0.0.5:5173",
            "http://devbox.local:5173",
        ]
    ) {
        assertThrows(
            () => parseAppOrigin(lanOrigin, "production"),
            Error,
            "APP_ORIGIN requires HTTPS outside loopback",
        );
    }
});

Deno.test("parseAppOrigin: development defaults to localhost and allows private LAN HTTP", () => {
    assertEquals(
        parseAppOrigin(undefined, undefined),
        "http://localhost:34567",
    );
    assertEquals(
        parseAppOrigin(undefined, "development"),
        "http://localhost:34567",
    );

    const multiOrigin = [
        "http://localhost:5173",
        "http://192.168.1.20:5173",
        "http://10.0.0.5:5173",
        "http://172.16.0.2:5173",
        "http://100.64.1.2:5173",
        "http://[fd00::1]:5173",
        "http://[fe80::1]:5173",
        "http://macbook.local:5173",
    ].join(", ");

    assertEquals(
        parseAppOrigin(multiOrigin, "development"),
        [
            "http://localhost:5173",
            "http://192.168.1.20:5173",
            "http://10.0.0.5:5173",
            "http://172.16.0.2:5173",
            "http://100.64.1.2:5173",
            "http://[fd00::1]:5173",
            "http://[fe80::1]:5173",
            "http://macbook.local:5173",
        ].join(","),
    );
});

Deno.test("parseAppOrigin: development rejects public HTTP and malformed origins", () => {
    for (
        const publicHttp of [
            "http://example.com",
            "http://8.8.8.8:5173",
            "http://172.32.0.1:5173",
        ]
    ) {
        assertThrows(
            () => parseAppOrigin(publicHttp, "development"),
            Error,
            "APP_ORIGIN requires HTTPS outside loopback or private LAN in development",
        );
    }

    for (
        const invalid of [
            "http://localhost:5173/",
            "http://localhost:5173/path",
            "http://localhost:5173,",
            "ftp://localhost:5173",
        ]
    ) {
        assertThrows(
            () => parseAppOrigin(invalid, "development"),
            Error,
            "APP_ORIGIN must contain exact HTTP(S) origins",
        );
    }
});

Deno.test("origin host helpers classify loopback and private LAN hosts", () => {
    assertEquals(isLoopbackOriginHost("localhost"), true);
    assertEquals(isLoopbackOriginHost("127.0.0.1"), true);
    assertEquals(isLoopbackOriginHost("[::1]"), true);
    assertEquals(isLoopbackOriginHost("192.168.1.1"), false);

    assertEquals(isPrivateLanOriginHost("169.254.10.2"), true);
    assertEquals(isPrivateLanOriginHost("server.lan"), true);
    assertEquals(isPrivateLanOriginHost("api.internal"), true);
    assertEquals(isPrivateLanOriginHost("192.168.1.300"), false);
});
