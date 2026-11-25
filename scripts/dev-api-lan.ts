import { isPrivateLanOriginHost } from "../src/main.ts";

/**
 * Collects exact HTTP development origins for loopback and local private IPv4
 * network interfaces so Vite LAN sessions pass API origin checks.
 */
export function collectLanDevOrigins(
    interfaces: ReadonlyArray<
        Pick<Deno.NetworkInterfaceInfo, "family" | "address">
    >,
    port = 5173,
): string[] {
    const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
    const lanAddresses = new Set<string>();
    for (const iface of interfaces) {
        if (iface.family !== "IPv4") continue;
        if (!isPrivateLanOriginHost(iface.address)) continue;
        lanAddresses.add(iface.address);
    }
    for (const addr of Array.from(lanAddresses).sort()) {
        origins.push(`http://${addr}:${port}`);
    }
    return origins;
}

/**
 * Resolves `APP_ORIGIN` for `dev:api:lan`, respecting an explicit override.
 */
export function resolveLanDevOriginEnv(
    existingAppOrigin: string | undefined,
    interfaces: ReadonlyArray<
        Pick<Deno.NetworkInterfaceInfo, "family" | "address">
    >,
    port = 5173,
): string {
    if (existingAppOrigin && existingAppOrigin.trim().length > 0) {
        return existingAppOrigin;
    }
    return collectLanDevOrigins(interfaces, port).join(",");
}

if (import.meta.main) {
    const origin = resolveLanDevOriginEnv(
        Deno.env.get("APP_ORIGIN"),
        Deno.networkInterfaces(),
        5173,
    );
    console.log(`[dev:api:lan] APP_ORIGIN=${origin}`);

    const child = new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", "--watch", "src/main.ts"],
        env: {
            ...Deno.env.toObject(),
            ENCRYPTION_KEY: Deno.env.get("ENCRYPTION_KEY") ?? "abc",
            APP_ORIGIN: origin,
        },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    }).spawn();

    const forwardSignal = (sig: Deno.Signal) => {
        try {
            child.kill(sig);
        } catch {
            // Child process may have already exited.
        }
    };
    Deno.addSignalListener("SIGINT", () => forwardSignal("SIGINT"));
    Deno.addSignalListener("SIGTERM", () => forwardSignal("SIGTERM"));

    const status = await child.status;
    Deno.exit(status.code);
}
