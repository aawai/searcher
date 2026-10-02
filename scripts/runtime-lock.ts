// Derive runtime dependency closure without resolving new versions from registries.
import ts from "typescript";

type Package = { integrity: string; dependencies?: string[] };
type Lock = {
    version: string;
    specifiers: Record<string, string>;
    jsr: Record<string, Package>;
    npm: Record<string, Package>;
};
type Config = { imports: Record<string, string> };

const source = JSON.parse(await Deno.readTextFile("deno.lock")) as Lock;
function parseConfig(path: string, text: string): Config {
    const result = ts.parseConfigFileTextToJson(path, text);
    if (result.error) throw new Error(`Invalid config: ${path}`);
    return result.config as Config;
}
const main = parseConfig("deno.jsonc", await Deno.readTextFile("deno.jsonc"));
const runtime = parseConfig(
    "deno.runtime.jsonc",
    await Deno.readTextFile("deno.runtime.jsonc"),
);
if (source.version !== "5") throw new Error("Unsupported lockfile version");

const specifiers: Record<string, string> = {};
const jsr: Record<string, Package> = {};
const npm: Record<string, Package> = {};
const npmNames = new Map<string, string[]>();
for (const key of Object.keys(source.npm)) {
    const name = key.slice(0, key.indexOf("@", 1));
    npmNames.set(name, [...(npmNames.get(name) ?? []), key]);
}

function visitNpm(key: string): void {
    if (key in npm) return;
    const pkg = source.npm[key];
    if (!pkg) throw new Error(`Missing locked npm dependency: ${key}`);
    npm[key] = pkg;
    for (const dependency of pkg.dependencies ?? []) {
        // v5 omits versions only when the package name is unambiguous.
        const candidates = dependency in source.npm
            ? [dependency]
            : npmNames.get(dependency) ?? [];
        if (candidates.length !== 1) {
            throw new Error(
                `Ambiguous or missing npm dependency: ${dependency}`,
            );
        }
        visitNpm(candidates[0]);
    }
}

function visitSpecifier(specifier: string): void {
    if (!(specifier in source.specifiers)) {
        const candidates = Object.keys(source.specifiers).filter((key) =>
            key.startsWith(`${specifier}@`)
        );
        if (candidates.length !== 1) {
            throw new Error(`Ambiguous or missing specifier: ${specifier}`);
        }
        specifier = candidates[0];
    }
    if (specifier in specifiers) return;
    const version = source.specifiers[specifier];
    if (!version) throw new Error(`Missing locked specifier: ${specifier}`);
    specifiers[specifier] = version;
    const prefix = specifier.slice(0, 4);
    const name = specifier.slice(4, specifier.lastIndexOf("@"));
    const key = `${name}@${version}`;
    if (prefix === "npm:") {
        visitNpm(key);
    } else if (prefix === "jsr:") {
        const pkg = source.jsr[key];
        if (!pkg) throw new Error(`Missing locked JSR dependency: ${key}`);
        jsr[key] = pkg;
        for (const dependency of pkg.dependencies ?? []) {
            visitSpecifier(dependency);
        }
    } else {
        throw new Error(`Unsupported dependency: ${specifier}`);
    }
}

const dependencies: string[] = [];
for (const [alias, target] of Object.entries(runtime.imports)) {
    if (main.imports[alias] !== target) {
        throw new Error(`Runtime import differs from main config: ${alias}`);
    }
    if (target.startsWith("./")) continue;
    dependencies.push(target);
    visitSpecifier(target);
}
for (const entrypoint of ["src/main.ts", "src/commands/admin.ts"]) {
    const result = await new Deno.Command(Deno.execPath(), {
        args: ["info", "--json", "--frozen", entrypoint],
        stdout: "piped",
    }).output();
    if (!result.success) throw new Error(`Cannot inspect ${entrypoint}`);
    const graph = JSON.parse(new TextDecoder().decode(result.stdout)) as {
        modules: { dependencies?: { code?: { specifier: string } }[] }[];
    };
    for (const module of graph.modules) {
        for (const dependency of module.dependencies ?? []) {
            const target = dependency.code?.specifier;
            const match = target?.match(
                /^(npm:|jsr:)\/?((?:@[^/]+\/)?[^@/]+@[^/]+)/,
            );
            if (match) visitSpecifier(match[1] + match[2]);
        }
    }
}
function sorted<T>(entries: Record<string, T>): Record<string, T> {
    return Object.fromEntries(
        Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    );
}
await Deno.writeTextFile(
    "deno.runtime.lock",
    JSON.stringify(
        {
            version: source.version,
            specifiers: sorted(specifiers),
            jsr: sorted(jsr),
            npm: sorted(npm),
            workspace: { dependencies: dependencies.sort() },
        },
        null,
        2,
    ) + "\n",
);
