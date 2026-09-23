import pino from "pino";
import type { Context, Next } from "hono";
import {
    type ConsoleAndfileOptions,
    createLogger,
    type Options,
} from "@logger";
import { getConnInfo } from "hono/deno";
import { join } from "@std/path";

const appName = Deno.env.get("APP");
const defaultConfig: ConsoleAndfileOptions = {
    output: "consoleAndfile",
    filename: "http.log",
    rotate: {
        path: join(
            Deno.cwd(),
            appName ? `data/logs/${appName}` : "data/logs",
        ),
        interval: "1d",
    },
    consolePrettyOptions: { include: "time,level,msg" },
    timestamp: pino.stdTimeFunctions.isoTime,
};

export type LoggerMiddleWareOptions =
    | Options
    | boolean
    | "console"
    | "file"
    | "consoleAndfile";
/**
 * Hono `http`接口日志中间件
 * @param options
 * @param {string} options.output 默认  file
 * @param {string} options.filename 默认  http.log
 * @param {string} options.rotate.path 默认 data/logs
 * @param {string} options.rotate.interval 默认 1天
 * @param {string} options.consolePrettyOptions.include 默认控制台只打印 time,level,msg
 * @param {string} options.timestamp 默认转换成年月日 时分秒
 * @returns
 */
export function loggerMiddleware(options?: LoggerMiddleWareOptions) {
    if (options === false) {
        return async function (_c: Context, next: Next) {
            await next();
        };
    }

    const { rotate, consolePrettyOptions, filename, timestamp } = defaultConfig;
    const userOptions = typeof options === "object" ? options : undefined;
    const output = userOptions?.output ??
        (typeof options === "string" ? options : "file");
    let loggerOptions: Options;
    switch (output) {
        case "file": {
            const custom = userOptions?.output === "file"
                ? userOptions
                : undefined;
            loggerOptions = {
                timestamp,
                filename,
                ...custom,
                output,
                rotate: { ...rotate, ...custom?.rotate },
            };
            break;
        }
        case "console": {
            const custom = userOptions?.output === "console"
                ? userOptions
                : undefined;
            loggerOptions = {
                timestamp,
                ...custom,
                output,
                consolePrettyOptions: {
                    ...consolePrettyOptions,
                    ...custom?.consolePrettyOptions,
                },
            };
            break;
        }
        case "consoleAndfile": {
            const custom = userOptions?.output === "consoleAndfile"
                ? userOptions
                : undefined;
            loggerOptions = {
                timestamp,
                filename,
                ...custom,
                output,
                rotate: { ...rotate, ...custom?.rotate },
                consolePrettyOptions: {
                    ...consolePrettyOptions,
                    ...custom?.consolePrettyOptions,
                },
            };
            break;
        }
    }

    const logger = createLogger(loggerOptions);

    return async function (c: Context, next: Next) {
        const s = Date.now();

        await next();

        const ip = getClientIP(c);
        const status = c.res.status;
        const duration = Date.now() - s;

        logger.info(
            {
                method: c.req.method,
                path: c.req.path,
                status,
                duration,
                ip,
                host: c.req.header("Host"),
            },
            `${c.req.method} ${c.req.path} ${status} ${duration}ms ${ip}`,
        );
    };
}

function getClientIP(c: Context): string | undefined {
    try {
        const connInfo = getConnInfo(c);
        if (connInfo?.remote?.address) {
            return connInfo.remote.address;
        }
    } catch {
        // 非 Deno 连接信息环境忽略
    }
    return undefined;
}
