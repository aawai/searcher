export interface AffectedChanges {
    base: string;
    mergeBase: string;
    paths: string[];
}

/** Git arguments never pass through a shell; all path records are NUL-delimited. */
export async function collectAffectedPaths(
    base = "origin/main",
    cwd = Deno.cwd(),
): Promise<AffectedChanges> {
    async function git(args: string[]): Promise<string> {
        let output: Deno.CommandOutput;
        try {
            output = await new Deno.Command("git", {
                args,
                cwd,
                stdout: "piped",
                stderr: "piped",
            }).output();
        } catch (error) {
            throw new Error(
                `Cannot run git for affected selection. Install git and run inside the repository: ${error}`,
            );
        }
        if (!output.success) {
            throw new Error(
                `Affected selection failed (git ${args[0]}, base ${
                    JSON.stringify(base)
                }). ` +
                    `Check the ref and repository; fetch origin/main or pass --base <git-ref>.\n` +
                    new TextDecoder().decode(output.stderr).trim(),
            );
        }
        return new TextDecoder().decode(output.stdout);
    }
    // Resolve separately so a ref cannot be interpreted as an option or revision expression.
    const resolvedBase = (await git([
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${base}^{commit}`,
    ])).trim();
    const mergeBase = (await git(["merge-base", resolvedBase, "HEAD"])).trim();
    const records = (await git([
        "diff",
        "--name-status",
        "-z",
        "--find-renames",
        mergeBase,
        "--",
    ])).split("\0");
    const paths = new Set<string>();
    for (let index = 0; index < records.length && records[index];) {
        const status = records[index++];
        const count = /^[RC]/.test(status) ? 2 : 1;
        for (let part = 0; part < count; part++) {
            const path = records[index++];
            if (path === undefined || path === "") {
                throw new Error(
                    "Malformed NUL-delimited git diff output during affected selection",
                );
            }
            paths.add(path);
        }
    }
    for (
        const path of (await git([
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
        ])).split("\0")
    ) {
        if (path) paths.add(path);
    }
    return { base, mergeBase, paths: [...paths].sort() };
}
