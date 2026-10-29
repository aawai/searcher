import {
    Home,
    LayoutGrid,
    NotebookPen,
    Settings,
    Sparkles,
    Trash2,
} from "lucide-react";
import type { DockSystemId } from "@shared/dock.ts";

export const DOCK_SYSTEM_ITEMS: Record<
    DockSystemId,
    {
        label: string;
        icon: typeof Home;
    }
> = {
    home: { label: "首页", icon: Home },
    apps: { label: "应用", icon: LayoutGrid },
    notes: { label: "笔记", icon: NotebookPen },
    ai: { label: "AI 问答", icon: Sparkles },
    settings: { label: "设置", icon: Settings },
    trash: { label: "回收站", icon: Trash2 },
};

export function moveDockItem<T>(
    items: readonly T[],
    index: number,
    delta: -1 | 1,
): T[] | null {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) {
        return null;
    }
    const copy = [...items];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, moved);
    return copy;
}
