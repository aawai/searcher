import { type Dispatch, lazy, Suspense, useCallback, useState } from "react";
import type { DocumentDto } from "@shared/documents.ts";
import { LoadingState } from "../../components/searcher/semantic.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { DesktopWindow } from "./DesktopWindow.tsx";
import type { SafeRect } from "./desktop-geometry.ts";
import type { DesktopAction, DesktopWindowState } from "./desktop-state.ts";

const DocumentEditor = lazy(() => import("../documents/DocumentEditor.tsx"));

export function DocumentEntityWindow(
    {
        window,
        rect,
        active,
        dispatch,
        userId,
        title,
        onOpenDocument,
        onDocumentChanged,
        onDocumentsChanged,
    }: {
        window: DesktopWindowState;
        rect: SafeRect;
        active: boolean;
        dispatch: Dispatch<DesktopAction>;
        userId: string;
        title: string;
        onOpenDocument: (id: string) => void;
        onDocumentChanged: (document: DocumentDto) => void;
        onDocumentsChanged: () => void;
    },
) {
    const [unsafeDraft, setUnsafeDraft] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const close = useCallback(
        () => dispatch({ type: "CLOSE", id: window.id }),
        [dispatch, window.id],
    );
    return (
        <>
            <DesktopWindow
                window={window}
                rect={rect}
                active={active}
                dispatch={dispatch}
                title={title}
                closeLabel="关闭笔记"
                onClose={() => unsafeDraft ? setConfirmClose(true) : close()}
            >
                <Suspense
                    fallback={
                        <LoadingState density="compact">
                            正在加载编辑器…
                        </LoadingState>
                    }
                >
                    <DocumentEditor
                        key={`${userId}:${window.entityId}`}
                        documentId={window.entityId!}
                        userId={userId}
                        onOpenDocument={onOpenDocument}
                        onDocumentChanged={onDocumentChanged}
                        onChanged={onDocumentsChanged}
                        onUnavailable={close}
                        onDirtyChange={setUnsafeDraft}
                    />
                </Suspense>
            </DesktopWindow>
            <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>关闭未保存的笔记？</AlertDialogTitle>
                        <AlertDialogDescription>
                            正文尚未保存，且本地草稿写入失败。关闭将丢失当前未保存内容。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>继续编辑</AlertDialogCancel>
                        <AlertDialogAction onClick={close}>
                            仍然关闭
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
