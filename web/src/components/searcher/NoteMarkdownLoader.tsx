import { type ComponentType, useEffect, useState } from "react";

let cachedNoteMarkdown: ComponentType<{ body?: string | null }> | null = null;

export function preloadNoteMarkdown(): Promise<
    ComponentType<{ body?: string | null }>
> {
    if (cachedNoteMarkdown) {
        return Promise.resolve(cachedNoteMarkdown);
    }
    return import("./NoteMarkdown.tsx").then((m) => {
        cachedNoteMarkdown = m.NoteMarkdown;
        return m.NoteMarkdown;
    });
}

export function NoteMarkdownView({ body }: { body?: string | null }) {
    const [Comp, setComp] = useState<
        ComponentType<{ body?: string | null }> | null
    >(() => cachedNoteMarkdown);

    useEffect(() => {
        if (!Comp) {
            void preloadNoteMarkdown().then((loaded) => {
                setComp(() => loaded);
            });
        }
    }, [Comp]);

    if (Comp) {
        return <Comp body={body} />;
    }
    return (
        <span className="note-preview-loading" aria-busy="true">
            {body ?? ""}
        </span>
    );
}
