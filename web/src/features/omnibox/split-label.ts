export type SuggestionSegment = {
    text: string;
    kind: "plain" | "match" | "completion";
};

export function splitSuggestionLabel(
    label: string,
    query: string,
): SuggestionSegment[] {
    if (!query) return [{ text: label, kind: "plain" }];
    const pattern = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
    );
    const segments: SuggestionSegment[] = [];
    let end = 0;
    for (const match of label.matchAll(pattern)) {
        if (match.index > end) {
            segments.push({
                text: label.slice(end, match.index),
                kind: end === 0 ? "plain" : "completion",
            });
        }
        segments.push({ text: match[0], kind: "match" });
        end = match.index + match[0].length;
    }
    if (end === 0) return [{ text: label, kind: "plain" }];
    if (end < label.length) {
        segments.push({ text: label.slice(end), kind: "completion" });
    }
    return segments;
}
