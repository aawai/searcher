import type { AiMessageDto } from "./types.ts";

/**
 * Finds the active leaf message.
 * Priority:
 * 1. Message matching activeLeafId
 * 2. Newest assistant/user message
 * 3. Last message in list
 */
export function findActiveLeaf(
    messages: readonly AiMessageDto[],
    activeLeafId?: string | null,
): AiMessageDto | null {
    if (!messages.length) return null;
    if (activeLeafId) {
        const found = messages.find((m) => m.id === activeLeafId);
        if (found) return found;
    }
    // Find leaves (messages that are not parents of any other message)
    const parentIds = new Set<string>();
    for (const m of messages) {
        if (m.parentMessageId) parentIds.add(m.parentMessageId);
    }
    const leaves = messages.filter((m) => !parentIds.has(m.id));
    if (leaves.length > 0) {
        // Return latest leaf by createdAt
        return leaves.reduce((latest, current) =>
            current.createdAt > latest.createdAt ? current : latest
        );
    }
    return messages[messages.length - 1];
}

/**
 * Traverses parentMessageId chain from active leaf to root to construct active branch.
 * Falls back to chronological sorting if parentMessageId is absent (legacy data compatibility).
 */
export function getActiveBranchMessages(
    messages: readonly AiMessageDto[],
    activeLeafId?: string | null,
): AiMessageDto[] {
    if (!messages.length) return [];

    // Check if messages have parentMessageId information
    const hasParentIds = messages.some((m) =>
        m.parentMessageId !== null && m.parentMessageId !== undefined
    );
    if (!hasParentIds) {
        // Legacy conversation: sort by createdAt
        return [...messages].sort((a, b) => a.createdAt - b.createdAt);
    }

    const leaf = findActiveLeaf(messages, activeLeafId);
    if (!leaf) return [...messages].sort((a, b) => a.createdAt - b.createdAt);

    const map = new Map<string, AiMessageDto>();
    for (const m of messages) {
        map.set(m.id, m);
    }

    const branch: AiMessageDto[] = [];
    const visited = new Set<string>();
    let current: AiMessageDto | undefined = leaf;

    while (current && !visited.has(current.id)) {
        branch.push(current);
        visited.add(current.id);
        if (!current.parentMessageId) break;
        current = map.get(current.parentMessageId);
    }

    // Return root -> leaf order
    return branch.reverse();
}

/**
 * When switching from a message to its sibling, finds the descendant leaf
 * in that sibling's subtree to activate.
 */
export function resolveLeafForSibling(
    allMessages: readonly AiMessageDto[],
    targetSiblingId: string,
): string {
    const mapByParent = new Map<string, AiMessageDto[]>();
    for (const m of allMessages) {
        if (m.parentMessageId) {
            const list = mapByParent.get(m.parentMessageId) ?? [];
            list.push(m);
            mapByParent.set(m.parentMessageId, list);
        }
    }

    let currentId = targetSiblingId;
    while (true) {
        const children = mapByParent.get(currentId);
        if (!children || children.length === 0) {
            return currentId;
        }
        // Pick the latest child
        const latest = children.reduce((prev, curr) =>
            curr.createdAt > prev.createdAt ? curr : prev
        );
        currentId = latest.id;
    }
}
