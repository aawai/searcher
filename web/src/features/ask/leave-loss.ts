/** What an AI window holds that would not survive being left. */
export interface AskLoss {
    /** A generation is running. */
    streaming: boolean;
    /** The shown conversation is temporary: it is deleted when released. */
    temporary: boolean;
    /** Unsent text in the composer, or kept for another conversation. */
    draft: boolean;
    /** Attachments chosen but not yet sent. */
    attachments: boolean;
}

/**
 * - `switch`: another conversation replaces the shown one. Text drafts of
 *   history conversations are kept in memory; attachments are not.
 * - `close`: the window and everything it holds is destroyed.
 * - `logout`: the account's windows are destroyed.
 */
export type AskLeave = "switch" | "close" | "logout";

export function needsConfirmation(loss: AskLoss, leave: AskLeave): boolean {
    if (leave === "switch") {
        return loss.streaming || loss.temporary || loss.attachments;
    }
    return loss.streaming || loss.temporary || loss.draft || loss.attachments;
}

/** Leaving the page loses the stream and unsent input; temporary leases expire on their own. */
export function warnsOnUnload(loss: AskLoss): boolean {
    return loss.streaming || loss.draft || loss.attachments;
}

export const LEAVE_TITLES: Record<AskLeave, string> = {
    switch: "切换会话？",
    close: "关闭 AI 问答？",
    logout: "退出登录？",
};

export const LEAVE_ACTIONS: Record<AskLeave, string> = {
    switch: "继续切换",
    close: "仍要关闭",
    logout: "仍要退出",
};

/** The consequences to show, most severe first; empty when nothing is lost. */
export function lossDescriptions(loss: AskLoss, leave: AskLeave): string[] {
    const items: string[] = [];
    if (loss.streaming) {
        items.push(
            loss.temporary
                ? "正在生成的回答将被终止，且不会保留。"
                : "正在生成的回答将被中断；已生成的内容保留在历史会话中，标记为已中断。",
        );
    }
    if (loss.temporary) {
        items.push("临时会话及其消息、附件和未发送的输入将被删除，无法恢复。");
        return items;
    }
    if (loss.attachments) items.push("未发送的附件将被丢弃。");
    if (loss.draft && leave !== "switch") items.push("未发送的输入将被丢弃。");
    return items;
}
