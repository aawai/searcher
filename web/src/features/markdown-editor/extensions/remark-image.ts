import { $remark } from "@milkdown/utils";

/**
 * Remark plugin to normalize mdast image nodes:
 * Converts `title: null` from remark-parse into `undefined`
 * to avoid ProseMirror attribute validation failure on `null` title.
 * Preserves canonical `asset://...` URLs and HTTP URLs exactly.
 */
export const remarkImageSanitizer = $remark(
    "remarkImageSanitizer",
    () => () => (tree: unknown) => {
        function normalize(node: unknown): void {
            if (typeof node !== "object" || node === null) return;
            const record = node as Record<string, unknown>;
            if (record.type === "image") {
                if (record.title === null) {
                    record.title = undefined;
                }
            }
            if (Array.isArray(record.children)) {
                for (const child of record.children) {
                    normalize(child);
                }
            }
        }
        normalize(tree);
    },
);
