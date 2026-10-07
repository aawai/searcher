import { X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { DocumentOutlineItem } from "./editor-content.ts";

export interface DocumentOutlineProps {
    outline: DocumentOutlineItem[];
    onSelectHeading: (index: number) => void;
    onClose?: () => void;
}

export function DocumentOutline({
    outline,
    onSelectHeading,
    onClose,
}: DocumentOutlineProps) {
    return (
        <aside
            className="document-outline-sidebar"
            aria-label="文档大纲"
        >
            <div className="flex items-center justify-between pb-1">
                <h3 className="document-outline-title">大纲</h3>
                {onClose && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="收起大纲"
                        onClick={onClose}
                    >
                        <X size={14} />
                    </Button>
                )}
            </div>

            {outline.length === 0
                ? (
                    <p className="text-xs text-[var(--muted)] py-4 text-center">
                        暂无标题大纲
                    </p>
                )
                : (
                    <ul className="document-outline-list">
                        {outline.map((item) => {
                            return (
                                <li key={`${item.index}-${item.level}`}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="document-outline-item-btn"
                                        data-level={item.level}
                                        title={item.text}
                                        onClick={() =>
                                            onSelectHeading(item.index)}
                                    >
                                        <span className="opacity-70 text-xs mr-1 font-mono">
                                            H{item.level}
                                        </span>
                                        {item.text}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
        </aside>
    );
}
