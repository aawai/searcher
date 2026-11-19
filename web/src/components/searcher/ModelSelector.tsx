import { ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
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
                title={current?.label ?? "选择模型"}
            >
                <span className="model-pill-label">
                    {current?.label ?? "选择模型"}
                </span>
                <ChevronDown size="1em" className="icon-sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                sideOffset={9}
                className="model-menu"
                aria-label="可用模型"
            >
                <DropdownMenuRadioGroup
                    aria-label="可用模型"
                    value={selected ?? ""}
                    onValueChange={onChange}
                >
                    {models.map((model) => (
                        <DropdownMenuRadioItem
                            key={model.id}
                            value={model.id}
                            closeOnClick
                        >
                            <span className="model-option-label">
                                {model.label}
                            </span>
                            <span className="model-option-provider">
                                {model.provider}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
