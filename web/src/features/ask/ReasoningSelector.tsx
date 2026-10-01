import { Brain, ChevronDown } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { REASONING_EFFORT_LABELS, type ReasoningEffort } from "./types.ts";

interface ReasoningSelectorProps {
    model: AiModelDto | undefined;
    value: ReasoningEffort | undefined;
    onChange: (level: ReasoningEffort | undefined) => void;
}

export function ReasoningSelector({
    model,
    value,
    onChange,
}: ReasoningSelectorProps) {
    if (!model || !model.supportsReasoning) {
        return null;
    }

    const availableLevels: readonly ReasoningEffort[] =
        model.reasoningEfforts ?? [];
    if (availableLevels.length === 0) {
        return null;
    }

    const currentLabel = value
        ? (REASONING_EFFORT_LABELS[value] ?? value)
        : "默认";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="outline"
                        className="ask-composer__action-pill"
                        aria-label={`选择推理强度: 当前为 ${currentLabel}`}
                        title={`推理强度: ${currentLabel}`}
                    />
                }
            >
                <Brain size={14} className="ask-composer__pill-icon" />
                <span className="ask-composer__pill-text">
                    推理: {currentLabel}
                </span>
                <ChevronDown size={12} className="ask-composer__pill-arrow" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={6} aria-label="可用推理强度">
                <DropdownMenuItem
                    onClick={() => onChange(undefined)}
                    className={value === undefined
                        ? "is-selected font-medium"
                        : ""}
                >
                    默认 (Provider 默认)
                </DropdownMenuItem>
                {availableLevels.map((level) => (
                    <DropdownMenuItem
                        key={level}
                        onClick={() => onChange(level)}
                        className={value === level
                            ? "is-selected font-medium"
                            : ""}
                    >
                        {REASONING_EFFORT_LABELS[level] ?? level}
                        <span className="muted text-xs ml-2">({level})</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * Resolves effective reasoning level when switching models according to the contract:
 * 1. If explicit choice is in the new model's supported levels, keep it.
 * 2. Otherwise fall back to user model preference -> model defaultReasoningEffort -> undefined.
 */
export function resolveEffectiveReasoningLevel(
    targetModel: AiModelDto | undefined,
    currentChoice: ReasoningEffort | undefined,
    userPreference?: ReasoningEffort,
): ReasoningEffort | undefined {
    if (!targetModel || !targetModel.supportsReasoning) {
        return undefined;
    }
    const supported = targetModel.reasoningEfforts ?? [];
    if (currentChoice && supported.includes(currentChoice)) {
        return currentChoice;
    }
    if (userPreference && supported.includes(userPreference)) {
        return userPreference;
    }
    if (
        targetModel.defaultReasoningEffort &&
        supported.includes(targetModel.defaultReasoningEffort)
    ) {
        return targetModel.defaultReasoningEffort;
    }
    return undefined;
}
