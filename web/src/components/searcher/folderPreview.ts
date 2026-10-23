import type { LauncherApp } from "./launcherTiles.ts";

export interface FolderPreview {
    /** Icons rendered as individually clickable launch targets. */
    clickable: LauncherApp[];
    /** Members not shown as clickable icons (large folders only). */
    remainder: LauncherApp[];
    /**
     * Mini 2x2 inside the remainder cell: always the first 4 of `remainder`,
     * even when the remainder is larger (the label carries the full count).
     */
    remainderPreview: LauncherApp[];
    remainderLabel: string | null;
    folderLabel: string;
    /** Non-interactive 2x2 preview of the first 4 members for small folders; [] when large. */
    miniPreview: LauncherApp[];
}

const LARGE_DESKTOP_SLOTS = 9;
const LARGE_TOUCH_SLOTS = 4;

export function folderPreview(
    members: LauncherApp[],
    { large, touch, folderName }: {
        large: boolean;
        touch: boolean;
        folderName: string;
    },
): FolderPreview {
    const folderLabel = `打开文件夹 ${folderName}，${members.length} 个应用`;
    if (!large) {
        return {
            clickable: [],
            remainder: [],
            remainderPreview: [],
            remainderLabel: null,
            folderLabel,
            miniPreview: members.slice(0, 4),
        };
    }
    const slots = touch ? LARGE_TOUCH_SLOTS : LARGE_DESKTOP_SLOTS;
    if (members.length <= slots) {
        return {
            clickable: members.slice(),
            remainder: [],
            remainderPreview: [],
            remainderLabel: null,
            folderLabel,
            miniPreview: [],
        };
    }
    const keep = slots - 1;
    const remainder = members.slice(keep);
    return {
        clickable: members.slice(0, keep),
        remainder,
        remainderPreview: remainder.slice(0, 4),
        remainderLabel:
            `打开文件夹 ${folderName}，另有 ${remainder.length} 个应用`,
        folderLabel,
        miniPreview: [],
    };
}
