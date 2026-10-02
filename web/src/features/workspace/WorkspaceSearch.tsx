import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";

export interface WorkspaceSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    ariaLabel: string;
}

export function WorkspaceSearch({
    value,
    onChange,
    placeholder,
    disabled = false,
    ariaLabel,
}: WorkspaceSearchProps) {
    const search = useRef<HTMLDivElement>(null);
    return (
        <div ref={search} className="workspace-search-wrap">
            <Search
                size={16}
                className="workspace-search-icon"
                aria-hidden="true"
            />
            <Input
                type="search"
                data-workspace-search=""
                className="workspace-search-input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                aria-label={ariaLabel}
            />
            {Boolean(value) && !disabled && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="workspace-search-clear"
                    onClick={() => {
                        onChange("");
                        search.current?.querySelector<HTMLInputElement>("input")
                            ?.focus();
                    }}
                    aria-label="清除搜索"
                >
                    <X size={14} />
                </Button>
            )}
        </div>
    );
}
