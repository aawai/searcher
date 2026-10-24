import type { DocumentNotebookDto } from "@shared/documents.ts";

export interface DocumentNotebookNode {
    notebook: DocumentNotebookDto;
    depth: 0 | 1;
    /** Root name for a child notebook; null for a root. */
    parentName: string | null;
    hasChildren: boolean;
    siblings: DocumentNotebookDto[];
    siblingIndex: number;
}

export interface DocumentNotebookOption {
    id: string;
    label: string;
}

export interface DocumentNotebookTree {
    roots: DocumentNotebookDto[];
    nodes: DocumentNotebookNode[];
    /** Picker options in display order; children read `父 › 子`. */
    options: DocumentNotebookOption[];
}

/** Notebooks are at most two levels deep; options and rows share one order. */
export function documentNotebookTree(
    notebooks: DocumentNotebookDto[],
): DocumentNotebookTree {
    const roots: DocumentNotebookDto[] = [];
    const childrenByParent = new Map<string, DocumentNotebookDto[]>();

    for (const notebook of notebooks) {
        if (notebook.parentId === null) {
            roots.push(notebook);
        } else {
            const children = childrenByParent.get(notebook.parentId) ?? [];
            children.push(notebook);
            childrenByParent.set(notebook.parentId, children);
        }
    }

    const byOrder = (a: DocumentNotebookDto, b: DocumentNotebookDto) =>
        a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : a.id.localeCompare(b.id);

    roots.sort(byOrder);
    for (const children of childrenByParent.values()) children.sort(byOrder);

    const nodes: DocumentNotebookNode[] = [];
    for (const [rootIndex, root] of roots.entries()) {
        const children = childrenByParent.get(root.id) ?? [];
        nodes.push({
            notebook: root,
            depth: 0,
            parentName: null,
            hasChildren: children.length > 0,
            siblings: roots,
            siblingIndex: rootIndex,
        });
        for (const [childIndex, child] of children.entries()) {
            nodes.push({
                notebook: child,
                depth: 1,
                parentName: root.name,
                hasChildren: false,
                siblings: children,
                siblingIndex: childIndex,
            });
        }
    }

    return {
        roots,
        nodes,
        options: nodes.map((node) => ({
            id: node.notebook.id,
            label: node.parentName
                ? `${node.parentName} › ${node.notebook.name}`
                : node.notebook.name,
        })),
    };
}
