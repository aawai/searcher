import { assertEquals, assertMatch } from "@std/assert";
import { runCheck } from "../check-ui.ts";

Deno.test("regression - update is shrink-only and refuses to absorb new drift", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-shrink-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        const filePath = `${targetDir}/components/Stable.tsx`;
        await Deno.writeTextFile(
            filePath,
            `export function Stable() {
                return <div style={{ fontSize: 14 }}>One</div>;
            }`,
        );

        // Initialize baseline
        const initCode = await runCheck([
            "--initialize",
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(initCode, 0);

        // Injected drift: add another violation
        await Deno.writeTextFile(
            filePath,
            `export function Stable() {
                return (
                    <div style={{ fontSize: 14 }}>
                        <span style={{ color: "red" }}>Drift</span>
                    </div>
                );
            }`,
        );

        // Running --update MUST FAIL and NOT absorb the new drift into baseline!
        const updateAttemptCode = await runCheck([
            "--update",
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(updateAttemptCode, 1);

        // Verify baseline file still has original 1 allowance, was not overwritten
        const text = await Deno.readTextFile(baselinePath);
        const baseline = JSON.parse(text);
        assertEquals(baseline.totalViolations, 1);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("regression - baseline content/count changes: stale allowances fail until update shrinks", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-stale-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        const filePath = `${targetDir}/components/ToClean.tsx`;
        await Deno.writeTextFile(
            filePath,
            `export function ToClean() {
                return <div style={{ borderRadius: "8px" }}>Box</div>;
            }`,
        );

        // Capture initial baseline
        const initCode = await runCheck([
            "--initialize",
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(initCode, 0);

        // Clean up the code to use design token
        await Deno.writeTextFile(
            filePath,
            `export function ToClean() {
                return <div style={{ borderRadius: "var(--radius)" }}>Box</div>;
            }`,
        );

        // Stale allowance MUST fail until baseline is updated
        const staleCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(staleCode, 1);

        // Updating baseline should now pass with shrink-only update to 0 allowances
        const updateCode = await runCheck([
            "--update",
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(updateCode, 0);

        const afterUpdateCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(afterUpdateCode, 0);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("regression - real CLI throwaway fixture verification (deno run scripts/check-ui.ts)", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-cli-fixture-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        // 1. Write clean component with legitimate runtime values
        await Deno.writeTextFile(
            `${targetDir}/components/GoodComponent.tsx`,
            `
            export function GoodComponent({ transform, isDragging }: { transform: unknown; isDragging: boolean }) {
                return (
                    <div
                        className="p-4 rounded-lg bg-surface text-foreground"
                        style={{
                            transform: CSS.Transform.toString(transform),
                            opacity: isDragging ? 0.5 : 1,
                        }}
                    >
                        Clean
                    </div>
                );
            }
            `,
        );

        // 2. Run real CLI via Deno.Command to initialize baseline
        const initCmd = new Deno.Command(Deno.execPath(), {
            args: [
                "run",
                "-A",
                "scripts/check-ui.ts",
                "--initialize",
                "--baseline",
                baselinePath,
                "--target",
                targetDir,
                "--base-dir",
                tempDir,
            ],
            stdout: "piped",
            stderr: "piped",
        });
        const initOutput = await initCmd.output();
        assertEquals(initOutput.code, 0);

        // 3. Verify clean check passes via CLI with [PASS]
        const cleanCmd = new Deno.Command(Deno.execPath(), {
            args: [
                "run",
                "-A",
                "scripts/check-ui.ts",
                "--baseline",
                baselinePath,
                "--target",
                targetDir,
                "--base-dir",
                tempDir,
            ],
            stdout: "piped",
            stderr: "piped",
        });
        const cleanOutput = await cleanCmd.output();
        const cleanStdout = new TextDecoder().decode(cleanOutput.stdout);
        assertEquals(cleanOutput.code, 0);
        assertMatch(
            cleanStdout,
            /\[PASS\] All UI visual presentations match the baseline contract/,
        );

        // 4. Inject visual drift (raw inline style + arbitrary tailwind)
        await Deno.writeTextFile(
            `${targetDir}/components/DriftComponent.tsx`,
            `
            export function DriftComponent() {
                return (
                    <div style={{ background: "#ff0000", padding: "19px" }}>
                        <span className="shadow-[0_10px_20px_black] text-[15px]">Drift</span>
                    </div>
                );
            }
            `,
        );

        // 5. Verify CLI denies the injected drift with [VIOLATION] and no emojis
        const driftCmd = new Deno.Command(Deno.execPath(), {
            args: [
                "run",
                "-A",
                "scripts/check-ui.ts",
                "--baseline",
                baselinePath,
                "--target",
                targetDir,
                "--base-dir",
                tempDir,
            ],
            stdout: "piped",
            stderr: "piped",
        });
        const driftOutput = await driftCmd.output();
        const driftStderr = new TextDecoder().decode(driftOutput.stderr);
        assertEquals(driftOutput.code, 1);
        assertMatch(driftStderr, /\[VIOLATION\] NEW VIOLATIONS DETECTED/);
        assertMatch(driftStderr, /raw-box-shadow/);
        assertMatch(driftStderr, /raw-font-size/);
        assertMatch(driftStderr, /raw-spacing-literal/);
        assertMatch(driftStderr, /inline-visual-style/);

        // Ensure no emojis are in the output
        assertEquals(driftStderr.includes("❌"), false);
        assertEquals(driftStderr.includes("✅"), false);
        assertEquals(driftStderr.includes("💡"), false);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});
