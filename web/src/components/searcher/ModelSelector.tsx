import { ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";

export interface ModelOption {
    id: string;
    label: string;
    provider: string;
}

export function ModelSelector(
    { models, selected, onChange }: {
        models: ModelOption[];
        selected: string | null;
        onChange: (id: string) => void;
    },
) {
    const current = models.find((model) => model.id === selected);
    if (!models.length) {
        return <span className="model-pill" role="status">未配置模型</span>;
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="model-pill model-trigger flex items-center gap-1.5"
                aria-label="选择 AI 模型"
                title={current?.label ?? "选择模型"}
            >
                <span className="truncate max-w-[140px]">
                    {current?.label ?? "选择模型"}
                </span>
                <ChevronDown size={13} className="shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                sideOffset={9}
                className="max-h-[360px] overflow-y-auto max-w-xs p-1"
                aria-label="可用模型"
            >
                {models.map((model) => (
                    <DropdownMenuItem
                        key={model.id}
                        onClick={() => onChange(model.id)}
                        className="flex items-center justify-between gap-2"
                    >
                        <span className="truncate flex-1">{model.label}</span>
                        <span className="muted text-xs shrink-0">
                            {model.provider}
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
