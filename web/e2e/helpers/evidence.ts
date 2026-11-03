// Retained debug artifacts, unlike fixture resource directories. Each call gets
// its own directory, including independent processes and --repeats rounds.
export async function createEvidenceDirectory(suite: string): Promise<string> {
    const parent = Deno.env.get("E2E_EVIDENCE_DIR") ??
        Deno.env.get("E2E_REPORT_DIR") ?? "artifacts/e2e/evidence";
    await Deno.mkdir(parent, { recursive: true });
    const directory = await Deno.makeTempDir({
        dir: parent,
        prefix: `${suite}-`,
    });
    console.log(`E2E evidence: ${directory}`);
    return directory;
}

/**
 * Themes for geometry and behaviour matrices. Layout does not depend on the
 * theme, so assertions run in light; evidence mode (`E2E_EVIDENCE_DIR`) adds
 * dark to capture screenshots for visual review.
 */
export function layoutThemes(): readonly ("light" | "dark")[] {
    return Deno.env.get("E2E_EVIDENCE_DIR") ? ["light", "dark"] : ["light"];
}
