import { X } from "lucide-react";
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
                    {height && (
                        <div className="sheet-sizes" aria-label="面板高度">
                            {([40, 65, 90] as const).map((value) => (
                                <Button
                                    key={value}
                                    variant="ghost"
                                    aria-label={`面板高度 ${value}%`}
                                    aria-pressed={height === value}
                                    onClick={() => onHeightChange?.(value)}
                                >
                                    {value}%
                                </Button>
                            ))}
                        </div>
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
