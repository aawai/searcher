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
            aria-label="笔记大纲"
        >
            <div className="document-outline-header">
                <h3 className="document-outline-title">大纲</h3>
                {onClose && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="收起大纲"
                        onClick={onClose}
                    >
                        <X size="1em" className="icon-sm" />
                    </Button>
                )}
            </div>

            {outline.length === 0
                ? (
                    <p className="document-outline-empty">
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
