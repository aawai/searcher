import { type ComponentType, useEffect, useState } from "react";
import type { NoteMarkdownProps } from "./NoteMarkdown.tsx";

type NoteMarkdownComponent = ComponentType<NoteMarkdownProps>;

let cachedNoteMarkdown: NoteMarkdownComponent | null = null;

export function preloadNoteMarkdown(): Promise<NoteMarkdownComponent> {
    if (cachedNoteMarkdown) {
        return Promise.resolve(cachedNoteMarkdown);
    }
    return import("./NoteMarkdown.tsx").then((m) => {
        cachedNoteMarkdown = m.NoteMarkdown;
        return m.NoteMarkdown;
    });
}

export function NoteMarkdownView(
    { body, onToggleTask }: NoteMarkdownProps,
) {
    const [Comp, setComp] = useState<NoteMarkdownComponent | null>(
        () => cachedNoteMarkdown,
    );

    useEffect(() => {
        if (!Comp) {
            void preloadNoteMarkdown().then((loaded) => {
                setComp(() => loaded);
            });
        }
    }, [Comp]);

    if (Comp) {
        return <Comp body={body} onToggleTask={onToggleTask} />;
    }
    return (
        <span className="note-preview-loading" aria-busy="true">
            {body ?? ""}
        </span>
    );
}
