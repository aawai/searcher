import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WebAppGroup } from "../../app/SearchHome.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";

interface SortableGroupItemProps {
    group: WebAppGroup;
    index: number;
    total: number;
    onRename: (group: WebAppGroup, name: string) => void;
    onSizeChange: (group: WebAppGroup, size: "small" | "large") => void;
    onDelete: (group: WebAppGroup) => void;
    onMoveOrder: (index: number, direction: -1 | 1) => void;
}

function SortableGroupItem({
    group,
    index,
    total,
    onRename,
    onSizeChange,
    onDelete,
    onMoveOrder,
}: SortableGroupItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: group.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="apps-workspace-group-manage-item"
        >
            <button
                type="button"
                className="apps-workspace-drag-handle"
                aria-label={`拖动排序文件夹 ${group.name}`}
                {...attributes}
                {...listeners}
            >
                <GripVertical size={16} />
            </button>
            <input
                className="apps-workspace-group-rename-input"
                aria-label={`文件夹名称：${group.name}`}
                defaultValue={group.name}
                onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== group.name) {
                        onRename(group, next);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.currentTarget.blur();
                    }
                }}
            />
            <Button
                variant="outline"
                size="sm"
                onClick={() =>
                    onSizeChange(
                        group,
                        group.folderSize === "large" ? "small" : "large",
                    )}
                aria-label={`${group.name} 当前为${
                    group.folderSize === "large" ? "大" : "小"
                }文件夹，点击切换`}
            >
                {group.folderSize === "large" ? "大文件夹" : "小文件夹"}
            </Button>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    className="apps-workspace-icon-btn"
                    disabled={index === 0}
                    onClick={() => onMoveOrder(index, -1)}
                    title="上移文件夹"
                    aria-label={`上移文件夹 ${group.name}`}
                >
                    <ArrowUp size={14} />
                </button>
                <button
                    type="button"
                    className="apps-workspace-icon-btn"
                    disabled={index === total - 1}
                    onClick={() => onMoveOrder(index, 1)}
                    title="下移文件夹"
                    aria-label={`下移文件夹 ${group.name}`}
                >
                    <ArrowDown size={14} />
                </button>
            </div>
            <button
                type="button"
                className="apps-workspace-icon-btn apps-workspace-icon-btn is-destructive"
                onClick={() => onDelete(group)}
                title="删除文件夹"
                aria-label={`删除文件夹 ${group.name}`}
            >
                <Trash2 size={15} />
            </button>
        </div>
    );
}

export interface AppsGroupsManageViewProps {
    groups: WebAppGroup[];
    onBack?: () => void;
    onCreateGroup: (name: string) => Promise<void>;
    onRenameGroup: (group: WebAppGroup, name: string) => Promise<void>;
    onSizeChange: (
        group: WebAppGroup,
        size: "small" | "large",
    ) => Promise<void>;
    onDeleteGroup: (group: WebAppGroup) => Promise<void>;
    onReorderGroups: (reordered: WebAppGroup[]) => Promise<void>;
}

export function AppsGroupsManageView({
    groups,
    onBack: _onBack,
    onCreateGroup,
    onRenameGroup,
    onSizeChange,
    onDeleteGroup,
    onReorderGroups,
}: AppsGroupsManageViewProps) {
    const [newGroupName, setNewGroupName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<WebAppGroup | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleCreate = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const trimmed = newGroupName.trim();
        if (!trimmed || isCreating) return;
        setIsCreating(true);
        try {
            await onCreateGroup(trimmed);
            setNewGroupName("");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = groups.findIndex((g) => g.id === active.id);
        const newIndex = groups.findIndex((g) => g.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(groups, oldIndex, newIndex);
        void onReorderGroups(reordered);
    };

    const handleMoveOrder = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= groups.length) return;
        const reordered = arrayMove(groups, index, targetIndex);
        void onReorderGroups(reordered);
    };

    const handleConfirmDelete = async () => {
        if (!groupToDelete || isDeleting) return;
        setIsDeleting(true);
        try {
            await onDeleteGroup(groupToDelete);
            setGroupToDelete(null);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="apps-workspace-section">
            <form
                onSubmit={handleCreate}
                className="apps-workspace-manage-create"
            >
                <Input
                    placeholder="新建文件夹名称…"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    disabled={isCreating}
                    className="flex-1"
                />
                <Button
                    type="submit"
                    disabled={!newGroupName.trim() || isCreating}
                >
                    {isCreating ? "创建中…" : "新建文件夹"}
                </Button>
            </form>

            <div className="apps-workspace-group-manage-list">
                {groups.length === 0
                    ? (
                        <div className="apps-workspace-empty">
                            <p className="apps-workspace-empty-title">
                                暂无文件夹
                            </p>
                            <p>创建文件夹以便在网站列表中进行归类整理</p>
                        </div>
                    )
                    : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={groups.map((g) => g.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {groups.map((g, idx) => (
                                    <SortableGroupItem
                                        key={g.id}
                                        group={g}
                                        index={idx}
                                        total={groups.length}
                                        onRename={(group, name) =>
                                            void onRenameGroup(group, name)}
                                        onSizeChange={(group, size) =>
                                            void onSizeChange(group, size)}
                                        onDelete={(group) =>
                                            setGroupToDelete(group)}
                                        onMoveOrder={handleMoveOrder}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
            </div>

            <AlertDialog
                open={Boolean(groupToDelete)}
                onOpenChange={(open) => !open && setGroupToDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除文件夹</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定删除文件夹“{groupToDelete
                                ?.name}”吗？文件夹中的网站将保留并移至未分组，不会被删除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={() => void handleConfirmDelete()}
                        >
                            {isDeleting ? "删除中…" : "确认删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
