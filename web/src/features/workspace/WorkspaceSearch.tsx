import { SearchField } from "../../components/searcher/semantic.tsx";

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
    return (
        <SearchField
            data-workspace-search=""
            placeholder={placeholder}
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            aria-label={ariaLabel}
        />
    );
}
