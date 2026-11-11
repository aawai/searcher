import type { ComponentProps } from "react";
import type { DndContext } from "@dnd-kit/core";

type DragAccessibility = NonNullable<
    ComponentProps<typeof DndContext>["accessibility"]
>;

const announcements: NonNullable<DragAccessibility["announcements"]> = {
    onDragStart: () => "开始拖动。",
    onDragOver: ({ over }) =>
        over ? "已移至可放置位置。" : "当前位置不能放置。",
    onDragEnd: ({ over }) => over ? "拖动结束。" : "未放置，拖动结束。",
    onDragCancel: () => "已取消拖动。",
};

export const keyboardDragAccessibility: DragAccessibility = {
    announcements,
    screenReaderInstructions: {
        draggable:
            "按空格键开始拖动，用方向键移动，再按空格键放置，按 Escape 取消。",
    },
};

export const pointerDragAccessibility: DragAccessibility = {
    announcements,
    screenReaderInstructions: {
        draggable: "使用指针拖动，按 Escape 取消。也可以通过操作菜单移动项目。",
    },
};
