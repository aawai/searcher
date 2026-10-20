import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";

export function useAppsEscape({
    enabled,
    isForeground,
    hasDialog,
    onDialogEscape,
    onEscape,
}: {
    enabled: boolean;
    isForeground?: () => boolean;
    hasDialog: () => boolean;
    onDialogEscape: () => void;
    onEscape: () => void;
}) {
    useEscapeLayer(enabled, (event) => {
        if (isForeground?.() === false) return;
        if (hasDialog()) {
            onDialogEscape();
            return;
        }
        const target = event.target;
        if (
            target instanceof Element &&
            target.closest("[data-workspace-escape-boundary]")
        ) return;
        onEscape();
    });
}
