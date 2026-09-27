import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
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
    {
        open,
        onOpenChange,
        title,
        children,
        height = 65,
        onHeightChange,
        onBack,
    }: {
        open: boolean;
        onOpenChange: (value: boolean) => void;
        title: string;
        children: ReactNode;
        height?: 40 | 65 | 90;
        onHeightChange?: (height: 40 | 65 | 90) => void;
        onBack?: () => void;
    },
) {
    const touchStart = useRef<number | null>(null);
    const isExpanded = height === 90;
    const mobileHeight = height === 90
        ? "100dvh"
        : height === 40
        ? "40dvh"
        : "80dvh";

    return (
        <Sheet
            open={open}
            onOpenChange={(next, details) => {
                if (!next && details.reason === "escape-key" && onBack) {
                    onBack();
                    return;
                }
                onOpenChange(next);
            }}
        >
            <SheetContent
                className={`sheet--apps ${isExpanded ? "sheet--expanded" : ""}`}
                style={{
                    "--sheet-mobile-height": mobileHeight,
                } as CSSProperties}
            >
                <SheetHeader
                    onTouchStart={(event) => {
                        if (
                            typeof globalThis.window !== "undefined" &&
                            globalThis.innerWidth < 768
                        ) {
                            touchStart.current = event.touches[0]?.clientY ??
                                null;
                        }
                    }}
                    onTouchEnd={(event) => {
                        if (
                            typeof globalThis.window !== "undefined" &&
                            globalThis.innerWidth < 768 &&
                            touchStart.current !== null &&
                            event.changedTouches[0]?.clientY -
                                        touchStart.current > 80
                        ) {
                            onOpenChange(false);
                        }
                        touchStart.current = null;
                    }}
                >
                    <span className="sheet-grip" aria-hidden="true" />
                    {onBack && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="返回上一级"
                            title="返回"
                            onClick={onBack}
                            className="mr-1"
                        >
                            <ArrowLeft size={18} />
                        </Button>
                    )}
                    <SheetTitle>{title}</SheetTitle>
                    {onHeightChange && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={isExpanded
                                ? "恢复默认高度"
                                : "全屏面板"}
                            title={isExpanded ? "恢复默认" : "全屏"}
                            onClick={() => onHeightChange(isExpanded ? 65 : 90)}
                            style={{ marginLeft: "auto" }}
                        >
                            {isExpanded
                                ? <Minimize2 size={16} />
                                : <Maximize2 size={16} />}
                        </Button>
                    )}
                    <SheetClose
                        render={
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="关闭"
                            />
                        }
                    >
                        <X size={18} />
                    </SheetClose>
                </SheetHeader>
                <div className="sheet-content">{children}</div>
            </SheetContent>
        </Sheet>
    );
}
