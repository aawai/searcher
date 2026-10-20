import { AppWindow } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { EmptyState } from "../../components/searcher/semantic.tsx";
import type { WindowKind } from "./desktop-geometry.ts";

export interface WindowPreview {
    id: string;
    kind: WindowKind;
    title: string;
    summary: string;
    minimized: boolean;
}

const TYPE_LABELS: Record<WindowKind, string> = {
    apps: "应用工作区",
    notes: "便签工作区",
    note: "便签",
    documents: "笔记工作区",
    document: "笔记",
};

/** A separate preview surface: never moves or remounts the live editors. */
export function DesktopOverview(
    { open, windows, onOpenChange, onSelect, returnFocus }: {
        open: boolean;
        windows: WindowPreview[];
        onOpenChange: (open: boolean) => void;
        onSelect: (id: string) => void;
        returnFocus: () => HTMLElement | false | null;
    },
) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="desktop-overview"
                finalFocus={returnFocus}
            >
                <div className="desktop-overview-header">
                    <div>
                        <DialogTitle>窗口总览</DialogTitle>
                        <DialogDescription>
                            选择窗口以恢复并聚焦；Ctrl+Alt+Shift+O
                            打开总览，Escape 退出。
                        </DialogDescription>
                    </div>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        退出总览
                    </Button>
                </div>
                {windows.length === 0
                    ? (
                        <EmptyState
                            title="没有打开的窗口"
                            description="从 Dock 打开应用、便签或笔记工作区。"
                        />
                    )
                    : (
                        <div className="desktop-overview-grid">
                            {windows.map((win) => (
                                <Button
                                    key={win.id}
                                    variant="outline"
                                    className="desktop-overview-preview"
                                    data-overview-window={win.id}
                                    aria-label={`${win.title}，${
                                        TYPE_LABELS[win.kind]
                                    }${win.minimized ? "，已最小化" : ""}`}
                                    onClick={() => onSelect(win.id)}
                                >
                                    <span className="desktop-overview-type">
                                        {win.kind === "apps" && (
                                            <AppWindow
                                                size={16}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {TYPE_LABELS[win.kind]}
                                        {win.minimized ? " · 已最小化" : ""}
                                    </span>
                                    <span className="desktop-overview-title">
                                        {win.title}
                                    </span>
                                    <span className="desktop-overview-summary">
                                        {win.summary}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    )}
            </DialogContent>
        </Dialog>
    );
}
