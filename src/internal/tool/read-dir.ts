import { walk, type WalkEntry } from "@std/fs";

/**
 * 读取目录下的所有文件
 * @param {String} dirpath 文件夹路径
 * @param {String} ext 文件格式过滤
 * @returns
 */
export async function getFilesByWalk(
    dirpath: string,
    ext?: string,
): Promise<WalkEntry[]> {
    const entries: WalkEntry[] = [];

    for await (const entry of walk(dirpath)) {
        if (!entry.isFile) {
            continue;
        }
        if (ext && !entry.name.endsWith(ext)) {
            continue;
        }
        entries.push(entry);
    }

    return entries;
}
