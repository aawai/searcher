import { type Dispatch, lazy, Suspense, useCallback, useState } from "react";
import type { DocumentDto } from "@shared/documents.ts";
import { LoadingState } from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Expand, Minimize2, Minus, X } from "lucide-react";
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
import type { DesktopGeometry } from "./desktop-geometry.ts";
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
        immersive = false,
        background = false,
        onEnterImmersive,
        onExitImmersive,
    }: {
        window: DesktopWindowState;
        rect: DesktopGeometry;
        active: boolean;
        dispatch: Dispatch<DesktopAction>;
        userId: string;
        title: string;
        onOpenDocument: (id: string) => void;
        onDocumentChanged: (document: DocumentDto) => void;
        onDocumentsChanged: () => void;
        immersive?: boolean;
        background?: boolean;
        onEnterImmersive: () => void;
        onExitImmersive: () => void;
    },
) {
    const [unsafeDraft, setUnsafeDraft] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [saveStatus, setSaveStatus] = useState("正在加载…");
    const requestClose = () => {
        onExitImmersive();
        if (unsafeDraft) setConfirmClose(true);
        else close();
    };
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
                onClose={requestClose}
                immersive={immersive}
                background={background}
                headerMenu={rect.usable ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="desktop-window-chrome-btn"
                        aria-label="进入沉浸式"
                        title="进入沉浸式"
                        data-immersive-enter
                        onClick={onEnterImmersive}
                    >
                        <Expand className="desktop-window-chrome-icon" />
                    </Button>
                ) : undefined}
                chrome={immersive ? (
                    <div className="desktop-window-chrome desktop-immersive-chrome" role="toolbar" aria-label={`沉浸式笔记：${title}`}>
                        <Button variant="ghost" size="sm" data-immersive-exit onClick={onExitImmersive}>
                            <Minimize2 className="desktop-window-chrome-icon" />
                            退出沉浸式
                        </Button>
                        <h2 className="desktop-window-chrome-title">{title}</h2>
                        <span className="desktop-immersive-save-status" role="status">{saveStatus}</span>
                        <div className="desktop-window-chrome-controls">
                            <Button variant="ghost" size="icon" aria-label="最小化窗口" className="desktop-window-chrome-btn" onClick={() => {
                                onExitImmersive();
                                dispatch({ type: "MINIMIZE", id: window.id });
                            }}>
                                <Minus className="desktop-window-chrome-icon" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="关闭笔记" className="desktop-window-chrome-btn" onClick={requestClose}>
                                <X className="desktop-window-chrome-icon" />
                            </Button>
                        </div>
                    </div>
                ) : undefined}
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
                        immersive={immersive}
                        onSaveStatusChange={setSaveStatus}
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
