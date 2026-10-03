export type MarkdownCommand =
    | "bold"
    | "italic"
    | "strike"
    | "inlineCode"
    | "heading1"
    | "heading2"
    | "heading3"
    | "bulletList"
    | "orderedList"
    | "taskList"
    | "blockquote"
    | "codeBlock"
    | "link"
    | "horizontalRule"
    | "table";

export interface TextEditResult {
    value: string;
    selectionStart: number;
    selectionEnd: number;
}

function countCharBackward(str: string, index: number, ch: string): number {
    let count = 0;
    for (let i = index - 1; i >= 0 && str[i] === ch; i--) {
        count++;
    }
    return count;
}

function countCharForward(str: string, index: number, ch: string): number {
    let count = 0;
    for (let i = index; i < str.length && str[i] === ch; i++) {
        count++;
    }
    return count;
}

function applyInlineWrapper(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    wrapper: string,
): TextEditResult {
    const selected = value.slice(selectionStart, selectionEnd);
    const wLen = wrapper.length;

    // Check if selection is inside wrapper
    let insideWrapped = false;
    if (wrapper === "*") {
        const beforeStars = countCharBackward(value, selectionStart, "*");
        const afterStars = countCharForward(value, selectionEnd, "*");
        insideWrapped = beforeStars % 2 === 1 && afterStars % 2 === 1;
    } else if (wrapper === "**") {
        const beforeStars = countCharBackward(value, selectionStart, "*");
        const afterStars = countCharForward(value, selectionEnd, "*");
        insideWrapped = beforeStars >= 2 && afterStars >= 2;
    } else {
        insideWrapped = selectionStart >= wLen &&
            selectionEnd + wLen <= value.length &&
            value.slice(selectionStart - wLen, selectionStart) === wrapper &&
            value.slice(selectionEnd, selectionEnd + wLen) === wrapper;
    }

    if (insideWrapped) {
        return {
            value: value.slice(0, selectionStart - wLen) + selected +
                value.slice(selectionEnd + wLen),
            selectionStart: selectionStart - wLen,
            selectionEnd: selectionEnd - wLen,
        };
    }

    // Check if selection includes wrapper
    let includesWrapped = false;
    if (wrapper === "*") {
        const startsWithStar = selected.startsWith("*");
        const endsWithStar = selected.endsWith("*");
        if (startsWithStar && endsWithStar && selected.length >= 2) {
            const startsWithDouble = selected.startsWith("**");
            const endsWithDouble = selected.endsWith("**");
            if (startsWithDouble && endsWithDouble) {
                includesWrapped = selected.startsWith("***") &&
                    selected.endsWith("***") && selected.length >= 6;
            } else {
                includesWrapped = true;
            }
        }
    } else {
        includesWrapped = selected.length >= 2 * wLen &&
            selected.startsWith(wrapper) &&
            selected.endsWith(wrapper);
    }

    if (includesWrapped) {
        const inner = selected.slice(wLen, -wLen);
        return {
            value: value.slice(0, selectionStart) + inner +
                value.slice(selectionEnd),
            selectionStart,
            selectionEnd: selectionStart + inner.length,
        };
    }

    // Wrap selection (or insert empty wrapper pair)
    return {
        value: value.slice(0, selectionStart) + wrapper + selected + wrapper +
            value.slice(selectionEnd),
        selectionStart: selectionStart + wLen,
        selectionEnd: selectionEnd + wLen,
    };
}

interface LineEdit {
    lineOffset: number;
    oldLength: number;
    oldPrefixLen: number;
    newPrefixLen: number;
    delta: number;
}

function adjustPoint(point: number, lineEdits: LineEdit[]): number {
    let current = point;
    for (const edit of lineEdits) {
        if (point < edit.lineOffset) {
            continue;
        } else if (point <= edit.lineOffset + edit.oldLength) {
            const offsetOnLine = point - edit.lineOffset;
            if (offsetOnLine < edit.oldPrefixLen) {
                current += edit.newPrefixLen - offsetOnLine;
            } else {
                current += edit.delta;
            }
        } else {
            current += edit.delta;
        }
    }
    return current;
}

const HEADING_RE = /^(#{1,6})\s+/;
const TASK_RE = /^([-*+]\s+\[[ xX]\]\s+)/;
const CHECKED_TASK_RE = /^([-*+]\s+\[[xX]\]\s+)/;
const UNCHECKED_TASK_RE = /^([-*+]\s+\[ \]\s+)/;
const BULLET_RE = /^([-*+]\s+)/;
const ORDERED_RE = /^(\d+\.\s+)/;
const BLOCKQUOTE_RE = /^(>\s?)/;

function applyLineCommand(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    command:
        | "heading1"
        | "heading2"
        | "heading3"
        | "bulletList"
        | "orderedList"
        | "taskList"
        | "blockquote",
): TextEditResult {
    const lineStartIndex = selectionStart === 0
        ? 0
        : value.lastIndexOf("\n", selectionStart - 1) + 1;
    let lineEndIndex: number;
    if (selectionEnd > selectionStart && value[selectionEnd - 1] === "\n") {
        lineEndIndex = selectionEnd - 1;
    } else {
        const nextNewline = value.indexOf("\n", selectionEnd);
        lineEndIndex = nextNewline === -1 ? value.length : nextNewline;
    }

    const coveredText = value.slice(lineStartIndex, lineEndIndex);
    const lines = coveredText.split("\n");

    let transformLine: (
        line: string,
        index: number,
    ) => { newLine: string; oldPrefixLen: number; newPrefixLen: number };

    if (
        command === "heading1" || command === "heading2" ||
        command === "heading3"
    ) {
        const targetPrefix = command === "heading1"
            ? "# "
            : command === "heading2"
            ? "## "
            : "### ";
        const targetRe = command === "heading1"
            ? /^#\s+/
            : command === "heading2"
            ? /^##\s+/
            : /^###\s+/;
        transformLine = (line: string) => {
            if (targetRe.test(line)) {
                // Same heading level: toggle off back to normal paragraph
                const match = line.match(HEADING_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const newLine = line.slice(oldPrefixLen);
                return { newLine, oldPrefixLen, newPrefixLen: 0 };
            } else {
                // Different heading level or plain text: switch/apply target heading
                const match = line.match(HEADING_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const rest = line.slice(oldPrefixLen);
                const newLine = targetPrefix + rest;
                return {
                    newLine,
                    oldPrefixLen,
                    newPrefixLen: targetPrefix.length,
                };
            }
        };
    } else if (command === "blockquote") {
        const allHaveQuote = lines.every((line) => BLOCKQUOTE_RE.test(line));
        transformLine = (line: string) => {
            if (allHaveQuote) {
                const match = line.match(BLOCKQUOTE_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const newLine = line.slice(oldPrefixLen);
                return { newLine, oldPrefixLen, newPrefixLen: 0 };
            } else {
                const newLine = "> " + line;
                return { newLine, oldPrefixLen: 0, newPrefixLen: 2 };
            }
        };
    } else if (command === "taskList") {
        const allHaveTask = lines.every((line) => TASK_RE.test(line));
        transformLine = (line: string) => {
            if (allHaveTask) {
                const match = line.match(TASK_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const newLine = line.slice(oldPrefixLen);
                return { newLine, oldPrefixLen, newPrefixLen: 0 };
            } else {
                // If line is already a checked task, keep it
                const checkedMatch = line.match(CHECKED_TASK_RE);
                if (checkedMatch) {
                    return {
                        newLine: line,
                        oldPrefixLen: checkedMatch[0].length,
                        newPrefixLen: checkedMatch[0].length,
                    };
                }
                const uncheckedMatch = line.match(UNCHECKED_TASK_RE);
                if (uncheckedMatch) {
                    return {
                        newLine: line,
                        oldPrefixLen: uncheckedMatch[0].length,
                        newPrefixLen: uncheckedMatch[0].length,
                    };
                }
                // Check if line has ordered or bullet prefix
                const ordMatch = line.match(ORDERED_RE);
                if (ordMatch) {
                    const oldPrefixLen = ordMatch[0].length;
                    const newLine = "- [ ] " + line.slice(oldPrefixLen);
                    return { newLine, oldPrefixLen, newPrefixLen: 6 };
                }
                const bulletMatch = line.match(BULLET_RE);
                if (bulletMatch) {
                    const oldPrefixLen = bulletMatch[0].length;
                    const newLine = "- [ ] " + line.slice(oldPrefixLen);
                    return { newLine, oldPrefixLen, newPrefixLen: 6 };
                }
                const newLine = "- [ ] " + line;
                return { newLine, oldPrefixLen: 0, newPrefixLen: 6 };
            }
        };
    } else if (command === "bulletList") {
        const allHaveBullet = lines.every((line) =>
            BULLET_RE.test(line) && !TASK_RE.test(line)
        );
        transformLine = (line: string) => {
            if (allHaveBullet) {
                const match = line.match(BULLET_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const newLine = line.slice(oldPrefixLen);
                return { newLine, oldPrefixLen, newPrefixLen: 0 };
            } else {
                const taskMatch = line.match(TASK_RE);
                if (taskMatch) {
                    const oldPrefixLen = taskMatch[0].length;
                    const newLine = "- " + line.slice(oldPrefixLen);
                    return { newLine, oldPrefixLen, newPrefixLen: 2 };
                }
                const ordMatch = line.match(ORDERED_RE);
                if (ordMatch) {
                    const oldPrefixLen = ordMatch[0].length;
                    const newLine = "- " + line.slice(oldPrefixLen);
                    return { newLine, oldPrefixLen, newPrefixLen: 2 };
                }
                const bulletMatch = line.match(BULLET_RE);
                if (bulletMatch) {
                    const oldPrefixLen = bulletMatch[0].length;
                    const newLine = "- " + line.slice(oldPrefixLen);
                    return { newLine, oldPrefixLen, newPrefixLen: 2 };
                }
                const newLine = "- " + line;
                return { newLine, oldPrefixLen: 0, newPrefixLen: 2 };
            }
        };
    } else {
        // orderedList
        const allHaveOrdered = lines.every((line) => ORDERED_RE.test(line));
        transformLine = (line: string, index: number) => {
            if (allHaveOrdered) {
                const match = line.match(ORDERED_RE);
                const oldPrefixLen = match ? match[0].length : 0;
                const newLine = line.slice(oldPrefixLen);
                return { newLine, oldPrefixLen, newPrefixLen: 0 };
            } else {
                const targetPrefix = `${index + 1}. `;
                const taskMatch = line.match(TASK_RE);
                if (taskMatch) {
                    const oldPrefixLen = taskMatch[0].length;
                    const newLine = targetPrefix + line.slice(oldPrefixLen);
                    return {
                        newLine,
                        oldPrefixLen,
                        newPrefixLen: targetPrefix.length,
                    };
                }
                const bulletMatch = line.match(BULLET_RE);
                if (bulletMatch) {
                    const oldPrefixLen = bulletMatch[0].length;
                    const newLine = targetPrefix + line.slice(oldPrefixLen);
                    return {
                        newLine,
                        oldPrefixLen,
                        newPrefixLen: targetPrefix.length,
                    };
                }
                const ordMatch = line.match(ORDERED_RE);
                if (ordMatch) {
                    const oldPrefixLen = ordMatch[0].length;
                    const newLine = targetPrefix + line.slice(oldPrefixLen);
                    return {
                        newLine,
                        oldPrefixLen,
                        newPrefixLen: targetPrefix.length,
                    };
                }
                const newLine = targetPrefix + line;
                return {
                    newLine,
                    oldPrefixLen: 0,
                    newPrefixLen: targetPrefix.length,
                };
            }
        };
    }

    const newLines: string[] = [];
    const lineEdits: LineEdit[] = [];
    let currentOffset = lineStartIndex;

    for (let i = 0; i < lines.length; i++) {
        const oldLine = lines[i];
        const { newLine, oldPrefixLen, newPrefixLen } = transformLine(
            oldLine,
            i,
        );
        newLines.push(newLine);
        const delta = newLine.length - oldLine.length;
        lineEdits.push({
            lineOffset: currentOffset,
            oldLength: oldLine.length,
            oldPrefixLen,
            newPrefixLen,
            delta,
        });
        currentOffset += oldLine.length + 1; // +1 for \n
    }

    const newCoveredText = newLines.join("\n");
    const nextValue = value.slice(0, lineStartIndex) + newCoveredText +
        value.slice(lineEndIndex);
    const nextStart = adjustPoint(selectionStart, lineEdits);
    const nextEnd = adjustPoint(selectionEnd, lineEdits);

    return {
        value: nextValue,
        selectionStart: nextStart,
        selectionEnd: nextEnd,
    };
}

function applyLink(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): TextEditResult {
    if (selectionStart < selectionEnd) {
        const selected = value.slice(selectionStart, selectionEnd);
        const prefix = `[${selected}](`;
        const url = "https://";
        const suffix = ")";
        const nextValue = value.slice(0, selectionStart) +
            prefix +
            url +
            suffix +
            value.slice(selectionEnd);
        const nextStart = selectionStart + prefix.length;
        const nextEnd = nextStart + url.length;
        return {
            value: nextValue,
            selectionStart: nextStart,
            selectionEnd: nextEnd,
        };
    }

    const placeholder = "链接文字";
    const prefix = "[";
    const middle = "](https://)";
    const nextValue = value.slice(0, selectionStart) +
        prefix +
        placeholder +
        middle +
        value.slice(selectionEnd);
    const nextStart = selectionStart + prefix.length;
    const nextEnd = nextStart + placeholder.length;
    return {
        value: nextValue,
        selectionStart: nextStart,
        selectionEnd: nextEnd,
    };
}

function applyCodeBlock(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): TextEditResult {
    const beforeText = value.slice(0, selectionStart);
    const afterText = value.slice(selectionEnd);
    const leadingNewline = selectionStart > 0 && !beforeText.endsWith("\n")
        ? "\n"
        : "";

    if (selectionStart < selectionEnd) {
        const selected = value.slice(selectionStart, selectionEnd);
        const prefix = leadingNewline + "```\n";
        const codeSuffix = selected.endsWith("\n") ? "```" : "\n```";
        const trailingNewline =
            selectionEnd < value.length && !afterText.startsWith("\n")
                ? "\n"
                : "";
        const suffix = codeSuffix + trailingNewline;
        const nextValue = beforeText + prefix + selected + suffix + afterText;
        const nextStart = selectionStart + prefix.length;
        const nextEnd = nextStart + selected.length;
        return {
            value: nextValue,
            selectionStart: nextStart,
            selectionEnd: nextEnd,
        };
    }

    const prefix = leadingNewline + "```\n";
    const trailingNewline =
        selectionEnd < value.length && !afterText.startsWith("\n") ? "\n" : "";
    const suffix = "\n```" + trailingNewline;
    const nextValue = beforeText + prefix + suffix + afterText;
    const nextStart = selectionStart + prefix.length;
    return {
        value: nextValue,
        selectionStart: nextStart,
        selectionEnd: nextStart,
    };
}

function applyHorizontalRule(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): TextEditResult {
    const beforeText = value.slice(0, selectionStart);
    const afterText = value.slice(selectionEnd);

    let prefix = "";
    if (selectionStart > 0) {
        if (beforeText.endsWith("\n\n")) {
            prefix = "";
        } else if (beforeText.endsWith("\n")) {
            prefix = "\n";
        } else {
            prefix = "\n\n";
        }
    }

    let suffix = "";
    if (selectionEnd < value.length) {
        if (afterText.startsWith("\n\n")) {
            suffix = "";
        } else if (afterText.startsWith("\n")) {
            suffix = "\n";
        } else {
            suffix = "\n\n";
        }
    }

    const inserted = prefix + "---" + suffix;
    const nextValue = beforeText + inserted + afterText;
    const nextPos = selectionStart + inserted.length;
    return {
        value: nextValue,
        selectionStart: nextPos,
        selectionEnd: nextPos,
    };
}

const TABLE_TEMPLATE = "| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |";

function applyTable(
    value: string,
    selectionStart: number,
    selectionEnd: number,
): TextEditResult {
    const beforeText = value.slice(0, selectionStart);
    const afterText = value.slice(selectionEnd);

    let prefix = "";
    if (selectionStart > 0) {
        if (beforeText.endsWith("\n\n")) {
            prefix = "";
        } else if (beforeText.endsWith("\n")) {
            prefix = "\n";
        } else {
            prefix = "\n\n";
        }
    }

    let suffix = "";
    if (selectionEnd < value.length) {
        if (afterText.startsWith("\n\n")) {
            suffix = "";
        } else if (afterText.startsWith("\n")) {
            suffix = "\n";
        } else {
            suffix = "\n\n";
        }
    }

    const inserted = prefix + TABLE_TEMPLATE + suffix;
    const nextValue = beforeText + inserted + afterText;
    const nextPos = selectionStart + prefix.length + TABLE_TEMPLATE.length;
    return {
        value: nextValue,
        selectionStart: nextPos,
        selectionEnd: nextPos,
    };
}

export function applyMarkdownCommand(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    command: MarkdownCommand,
): TextEditResult {
    switch (command) {
        case "bold":
            return applyInlineWrapper(
                value,
                selectionStart,
                selectionEnd,
                "**",
            );
        case "italic":
            return applyInlineWrapper(value, selectionStart, selectionEnd, "*");
        case "strike":
            return applyInlineWrapper(
                value,
                selectionStart,
                selectionEnd,
                "~~",
            );
        case "inlineCode":
            return applyInlineWrapper(value, selectionStart, selectionEnd, "`");
        case "heading1":
        case "heading2":
        case "heading3":
        case "bulletList":
        case "orderedList":
        case "taskList":
        case "blockquote":
            return applyLineCommand(
                value,
                selectionStart,
                selectionEnd,
                command,
            );
        case "link":
            return applyLink(value, selectionStart, selectionEnd);
        case "codeBlock":
            return applyCodeBlock(value, selectionStart, selectionEnd);
        case "horizontalRule":
            return applyHorizontalRule(value, selectionStart, selectionEnd);
        case "table":
            return applyTable(value, selectionStart, selectionEnd);
        default:
            return {
                value,
                selectionStart,
                selectionEnd,
            };
    }
}
