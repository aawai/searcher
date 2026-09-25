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
                className="model-pill model-trigger"
                aria-label="选择 AI 模型"
            >
                {current?.label ?? "选择模型"}
                <ChevronDown size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={9} aria-label="可用模型">
                {models.map((model) => (
                    <DropdownMenuItem
                        key={model.id}
                        onClick={() => onChange(model.id)}
                    >
                        {model.label}
                        <span className="muted">{model.provider}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
