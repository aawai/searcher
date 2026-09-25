import { Maximize2, Minimize2, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useRef } from "react";
import { Button } from "../ui/button.tsx";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "../ui/sheet.tsx";
export function ContentSheet(
    { open, onOpenChange, title, children, height, onHeightChange }: {
        open: boolean;
        onOpenChange: (value: boolean) => void;
        title: string;
        children: ReactNode;
        height?: 40 | 65 | 90;
        onHeightChange?: (height: 40 | 65 | 90) => void;
    },
) {
    const touchStart = useRef<number | null>(null);
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className={height ? "sheet--apps" : undefined}
                style={height
                    ? { "--sheet-height": `${height}dvh` } as CSSProperties
                    : undefined}
            >
                <SheetHeader
                    onTouchStart={(event) => {
                        touchStart.current = event.touches[0]?.clientY ?? null;
                    }}
                    onTouchEnd={(event) => {
                        if (
                            touchStart.current !== null &&
                            event.changedTouches[0]?.clientY -
                                        touchStart.current > 80
                        ) {
                            onOpenChange(false);
                        }
                        touchStart.current = null;
                    }}
                >
                    {height && (
                        <span className="sheet-grip" aria-hidden="true" />
                    )}
                    <SheetTitle>{title}</SheetTitle>
                    {onHeightChange && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={height === 90
                                ? "恢复默认高度"
                                : "全屏面板"}
                            title={height === 90 ? "恢复默认" : "全屏"}
                            onClick={() =>
                                onHeightChange(height === 90 ? 65 : 90)}
                            style={{ marginLeft: "auto" }}
                        >
                            {height === 90
                                ? <Minimize2 size={16} />
                                : <Maximize2 size={16} />}
                        </Button>
                    )}
                    <SheetClose
                        render={<Button variant="ghost" aria-label="关闭" />}
                    >
                        <X size={20} />
                    </SheetClose>
                </SheetHeader>
                <div className="sheet-content">{children}</div>
            </SheetContent>
        </Sheet>
    );
}
