import { type RefObject, useEffect, useRef } from "react";
import { createMarkdownEditor } from "../../features/markdown-editor/runtime.ts";
import { taskListControls } from "../../features/markdown-editor/extensions/task-list.ts";
import type { MarkdownEditorHandle } from "../../features/markdown-editor/types.ts";

if (typeof Deno === "undefined") {
    void import("../../features/markdown-editor/structural.css");
}

export default function NoteLivePreviewEditor(
    { body, editorRef, onChange, onComposition, onReady, onError }: {
        body: string;
        editorRef: RefObject<MarkdownEditorHandle | null>;
        onChange: (body: string) => void;
        onComposition: (composing: boolean) => void;
        onReady: (ready: boolean) => void;
        onError: () => void;
    },
) {
    const rootRef = useRef<HTMLDivElement>(null);
    const latest = useRef({ body, onChange, onComposition, onReady, onError });
    latest.current = { body, onChange, onComposition, onReady, onError };
    const appliedBody = useRef(body);
    const composingRef = useRef(false);
    const pendingBody = useRef<string | null>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let cancelled = false;
        let composing = false;
        let compositionTimer:
            | ReturnType<typeof globalThis.setTimeout>
            | undefined;
        let compositionChanged = false;
        let handle: MarkdownEditorHandle | null = null;
        const publish = (markdown: string) => {
            appliedBody.current = markdown;
            latest.current.onChange(markdown);
        };
        latest.current.onReady(false);
        void createMarkdownEditor(root, latest.current.body, (event) => {
            if (cancelled || event.origin !== "user") return;
            if (composing) {
                compositionChanged = true;
                return;
            }
            publish(event.markdown);
        }, {
            plugins: [taskListControls],
            preserveSoftBreaks: true,
            onComposition: (event) => {
                composing = event.type !== "end";
                composingRef.current = composing;
                if (event.type === "start") compositionChanged = false;
                latest.current.onComposition(composing);
                if (!composing) {
                    // Let ProseMirror finish its DOM composition handler before serializing.
                    compositionTimer = globalThis.setTimeout(() => {
                        if (cancelled || !handle) return;
                        if (pendingBody.current !== null) {
                            const replacement = pendingBody.current;
                            pendingBody.current = null;
                            handle.replaceMarkdown(replacement);
                            appliedBody.current = replacement;
                            compositionChanged = false;
                        } else if (compositionChanged) {
                            compositionChanged = false;
                            publish(handle.getMarkdown());
                        }
                    }, 0);
                }
            },
        }).then(async (created) => {
            if (cancelled) {
                await created.destroy();
                return;
            }
            handle = created;
            editorRef.current = created;
            if (appliedBody.current !== latest.current.body) {
                created.replaceMarkdown(latest.current.body);
            }
            appliedBody.current = latest.current.body;
            created.view.dom.setAttribute("role", "textbox");
            created.view.dom.setAttribute("aria-label", "Markdown 内容");
            created.view.dom.setAttribute("aria-multiline", "true");
            latest.current.onReady(true);
        }).catch(() => {
            if (!cancelled) latest.current.onError();
        });
        return () => {
            cancelled = true;
            clearTimeout(compositionTimer);
            editorRef.current = null;
            if (composing) latest.current.onComposition(false);
            latest.current.onReady(false);
            if (handle) void handle.destroy();
        };
    }, [editorRef]);

    useEffect(() => {
        if (!editorRef.current || appliedBody.current === body) return;
        if (composingRef.current) {
            pendingBody.current = body;
            return;
        }
        try {
            editorRef.current.replaceMarkdown(body);
            appliedBody.current = body;
        } catch {
            latest.current.onError();
        }
    }, [body, editorRef]);

    return <div ref={rootRef} className="note-live-editor markdown" />;
}
