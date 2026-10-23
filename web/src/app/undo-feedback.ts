/** What the undo toast says about the actions it can still reverse. */
export type UndoSubject = {
    kind: "app" | "paper" | "capture";
    name: string;
    error?: string;
    /** Capture only: the new note was pinned to home from the toast. */
    pinned?: boolean;
};

export function undoMessage(subjects: readonly UndoSubject[]): string {
    if (subjects.length === 1) {
        const [subject] = subjects;
        if (subject.kind !== "capture") {
            return `已将“${subject.name}”移至回收站`;
        }
        return subject.pinned
            ? `已记录笔记“${subject.name}”并固定到首页`
            : `已记录笔记“${subject.name}”`;
    }
    const names = subjects.map((subject) => subject.name).join("、");
    return subjects.every((subject) => subject.kind !== "capture")
        ? `已将 ${subjects.length} 项移至回收站：${names}`
        : `${subjects.length} 项操作可撤销：${names}`;
}

export function undoErrorMessage(subjects: readonly UndoSubject[]): string {
    return subjects.flatMap((subject) =>
        subject.error
            ? [
                `${
                    subject.kind === "capture"
                        ? "撤销记录"
                        : "恢复"
                }“${subject.name}”失败：${subject.error}，可以重试。`,
            ]
            : []
    ).join(" ");
}
