import { assertEquals, assertMatch } from "@std/assert";
import { runCheck } from "../check-ui.ts";

Deno.test("regression - new violations in new or existing files are denied", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-new-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        // Initial file
        await Deno.writeTextFile(
            `${targetDir}/components/Sample.tsx`,
            `export function Sample() { return <div style={{ background: "var(--surface)" }}>A</div>; }`,
        );

        // Explicit bootstrap via --initialize
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

        // Injected drift: add a new file with raw-box-shadow
        await Deno.writeTextFile(
            `${targetDir}/components/Drift.tsx`,
            `export function Drift() { return <div style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>B</div>; }`,
        );

        // Verify guard fails
        const checkCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(checkCode, 1);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("regression - same-file additions (increased violation count) are denied", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-same-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        // File with 1 existing violation
        const filePath = `${targetDir}/components/Existing.tsx`;
        await Deno.writeTextFile(
            filePath,
            `export function Existing() {
                return (
                    <div>
                        <span style={{ fontSize: 14 }}>One</span>
                    </div>
                );
            }`,
        );

        // Explicit bootstrap
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

        // Same file adds a 2nd violation (same rule)
        await Deno.writeTextFile(
            filePath,
            `export function Existing() {
                return (
                    <div>
                        <span style={{ fontSize: 14 }}>One</span>
                        <span style={{ fontSize: 14 }}>Two</span>
                    </div>
                );
            }`,
        );

        // Verify guard fails on increased count
        const checkCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(checkCode, 1);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

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

Deno.test("regression - consumer-visible denials for unrelated dynamic styling", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-denials-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/components`, { recursive: true });

        // 1. background: product.color outside actual swatch owner is denied
        await Deno.writeTextFile(
            `${targetDir}/components/ProductCard.tsx`,
            `export function ProductCard({ product }: { product: { color: string } }) {
                return <div style={{ background: product.color }}>Product</div>;
            }`,
        );

        // 2. width: \`\${arbitrary}px\` outside masonry owner is denied
        await Deno.writeTextFile(
            `${targetDir}/components/HeaderBar.tsx`,
            `export function HeaderBar({ width }: { width: number }) {
                return <div style={{ width: \`\${width}px\` }}>Header</div>;
            }`,
        );

        // 3. transform: 'translate3d(0,0,0)' unrelated is denied
        await Deno.writeTextFile(
            `${targetDir}/components/Banner.tsx`,
            `export function Banner() {
                return <div style={{ transform: "translate3d(0, 0, 0)" }}>Banner</div>;
            }`,
        );

        // Run check without baseline: all 3 must be detected as violations
        const checkCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
            "--json",
        ]);
        assertEquals(checkCode, 1);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});

Deno.test("regression - runtime exception safety: wallpaper, drag, masonry, domain values accepted without allowances", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-reg-runtime-" });
    const baselinePath = `${tempDir}/baseline.json`;
    const targetDir = `${tempDir}/web/src`;

    try {
        await Deno.mkdir(`${targetDir}/app`, { recursive: true });
        await Deno.mkdir(`${targetDir}/components/searcher`, {
            recursive: true,
        });

        await Deno.mkdir(`${targetDir}/components/wallpaper`, {
            recursive: true,
        });
        await Deno.writeTextFile(
            `${targetDir}/components/wallpaper/WallpaperSurface.tsx`,
            `export function WallpaperSurface({ wallpaper, filter }: { wallpaper: string; filter: string }) {
                return (
                    <div style={{
                        "--wallpaper-image": wallpaper,
                        "--wallpaper-filter": filter,
                        "--search-opacity": 0.95,
                    } as React.CSSProperties} />
                );
            }`,
        );

        // 2. Drag transform and masonry geometry in SearchHome.tsx
        await Deno.writeTextFile(
            `${targetDir}/app/SearchHome.tsx`,
            `export function SearchHome({ transform, isDragging, columnLayout }: {
                transform: unknown;
                isDragging: boolean;
                columnLayout: { left: number; top: number; width: number };
            }) {
                return (
                    <div
                        style={{
                            position: "absolute",
                            left: columnLayout.left + "px",
                            top: columnLayout.top + "px",
                            width: columnLayout.width + "px",
                            transform: CSS.Transform.toString(transform),
                            zIndex: isDragging ? 50 : undefined,
                            opacity: isDragging ? 0.5 : 1,
                        }}
                    />
                );
            }`,
        );

        // 3. Floating notes domain values in FloatingNotes.tsx
        await Deno.writeTextFile(
            `${targetDir}/components/searcher/FloatingNotes.tsx`,
            `export function FloatingNotes({ point, noteId }: { point: { x: number; y: number; z: number }; noteId: string }) {
                return (
                    <div style={{
                        left: point.x + "px",
                        top: point.y + "px",
                        zIndex: point.z,
                        "--note-tilt": getNoteTilt(noteId),
                    } as React.CSSProperties} />
                );
            }`,
        );

        // 4. Swatch preview in SettingsPage.tsx
        await Deno.writeTextFile(
            `${targetDir}/app/SettingsPage.tsx`,
            `export function SettingsPage({ id, hex }: { id: string; hex: string }) {
                return (
                    <div style={{
                        background: getAccentLight(id),
                        "--item-accent": hex,
                    }} />
                );
            }`,
        );

        // Run check: since all are legitimate runtime exceptions in their respective owners, 0 violations occur!
        const checkCode = await runCheck([
            "--baseline",
            baselinePath,
            "--target",
            targetDir,
            "--base-dir",
            tempDir,
        ]);
        assertEquals(checkCode, 0);
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
