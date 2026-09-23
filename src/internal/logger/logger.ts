import pino from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import pretty, { type PrettyOptions } from "pino-pretty";
import { createStream } from "rotating-file-stream";
import type {
    Options as RotateOptions,
    RotatingFileStream,
} from "rotating-file-stream";
import { fromFileUrl, join } from "@std/path";

export interface ConsoleOptions extends LoggerOptions {
    output: "console";
    consolePrettyOptions?: PrettyOptions;
}

export interface FileOptions extends LoggerOptions {
    output: "file";
    filename: string;
    rotate: RotateOptions;
}

export interface ConsoleAndfileOptions extends LoggerOptions {
    output: "consoleAndfile";
    consolePrettyOptions?: PrettyOptions;
    filename: string;
    rotate: RotateOptions;
}

const loggers: Set<Logger> = new Set();
const fileStreams = new Set<RotatingFileStream>();

/** 等待已提交日志的 flush 与文件写入；不关闭流，也不提供 fsync 保证。 */
export async function flushLogger(): Promise<void> {
    await Promise.all(
        [...loggers].map((logger) =>
            new Promise<void>((resolve, reject) => {
                logger.flush((error) => error ? reject(error) : resolve());
            })
        ),
    );
    // A completed write waits for all earlier writes on each rotating stream.
    await Promise.all(
        [...fileStreams].map((stream) =>
            new Promise<void>((resolve, reject) => {
                stream.write("", (error) => error ? reject(error) : resolve());
            })
        ),
    );
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export function fastTimeFormat(): string {
    const iso = new Date(Date.now() + BEIJING_OFFSET_MS).toISOString();
    return `,"time":"${iso.slice(0, 10)} ${iso.slice(11, 23)}"`;
}

export type Options = ConsoleOptions | FileOptions | ConsoleAndfileOptions;

export function createLogger(options: Options = { output: "console" }): Logger {
    const streams: DestinationStream[] = [];

    if (options.output !== "file") {
        streams.push(pretty({
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ...options.consolePrettyOptions,
        }));
    }

    if (options.output !== "console") {
        const rotate = { ...options.rotate };
        if (rotate.path?.startsWith("file:")) {
            rotate.path = fromFileUrl(rotate.path);
        }
        const stream = createStream(options.filename, rotate);
        fileStreams.add(stream);
        streams.push(stream);
    }

    const destination = streams.length === 1 ? streams[0] : pino.multistream(
        // Pino 决定级别；输出端不再过滤，兼容运行时调级与自定义级别。
        streams.map((stream) => ({ stream, level: -Infinity })),
    );
    const instance = pino({ base: null, ...options }, destination);
    loggers.add(instance);
    return instance;
}

const appName = Deno.env.get("APP");
export const logger = createLogger({
    output: "consoleAndfile",
    filename: "common.log",
    rotate: {
        path: join(
            Deno.cwd(),
            appName ? `data/logs/${appName}` : "data/logs",
        ),
        interval: "1d",
        size: "100M",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: null,
});
