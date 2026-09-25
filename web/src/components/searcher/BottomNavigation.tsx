import { AppWindow, StickyNote } from "lucide-react";
export function BottomNavigation(
    { onApps, onNotes, disabled }: {
        onApps: () => void;
        onNotes: () => void;
        disabled?: boolean;
    },
) {
    return (
        <nav className="bottom-navigation" aria-label="个人内容">
            <button type="button" onClick={onApps} disabled={disabled}>
                <AppWindow size={19} />APP
            </button>
            <button type="button" onClick={onNotes} disabled={disabled}>
                <StickyNote size={19} />便签
            </button>
        </nav>
    );
}
