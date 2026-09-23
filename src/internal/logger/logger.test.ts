import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

Deno.test("双输出遵循 logger 级别，支持运行时调整与自定义级别", async () => {
    const directory = await Deno.makeTempDir();
    const moduleUrl = new URL("./logger.ts", import.meta.url).href;
    try {
        // 子进程隔离模块的应用 logger、轮转计时器及文件句柄。
        const result = await new Deno.Command(Deno.execPath(), {
            args: [
                "eval",
                `
                import { createLogger, flushLogger } from ${
                    JSON.stringify(moduleUrl)
                };
                const logger = createLogger({
                    output: "consoleAndfile",
                    filename: "levels.log",
                    rotate: { path: ${JSON.stringify(directory)} },
                    level: "debug",
                    customLevels: { verbose: 5 },
                    consolePrettyOptions: { colorize: false, sync: true },
                });
                logger.trace("filtered");
                logger.debug("debug-record");
                logger.level = "verbose";
                logger.verbose("verbose-record");
                logger.trace("trace-record");
                await flushLogger();
                Deno.exit(0);
                `,
            ],
            stdout: "piped",
            stderr: "piped",
        }).output();
        assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
        const records = (await Deno.readTextFile(join(directory, "levels.log")))
            .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
        assertEquals(records.map((record) => record.msg), [
            "debug-record",
            "verbose-record",
            "trace-record",
        ]);
        const consoleOutput = new TextDecoder().decode(result.stdout);
        for (const record of records) {
            assertStringIncludes(consoleOutput, record.msg);
        }
        assertEquals(consoleOutput.includes("filtered"), false);
    } finally {
        await Deno.remove(directory, { recursive: true });
    }
});
