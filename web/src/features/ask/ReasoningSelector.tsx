import { ChevronDown } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { REASONING_EFFORT_LABELS, type ReasoningEffort } from "./types.ts";

const PROVIDER_DEFAULT = "default";

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
                        size="sm"
                        className="ask-composer__action-pill"
                        aria-label={`选择推理强度: 当前为 ${currentLabel}`}
                        title={`推理强度: ${currentLabel}`}
                    />
                }
            >
                <span className="ask-composer__pill-text">
                    推理: {currentLabel}
                </span>
                <ChevronDown
                    size="1em"
                    className="icon-sm ask-composer__pill-arrow"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={6} aria-label="可用推理强度">
                <DropdownMenuRadioGroup
                    value={value ?? PROVIDER_DEFAULT}
                    onValueChange={(next) =>
                        onChange(
                            availableLevels.find((level) => level === next),
                        )}
                >
                    <DropdownMenuRadioItem
                        value={PROVIDER_DEFAULT}
                        closeOnClick
                    >
                        默认
                    </DropdownMenuRadioItem>
                    {availableLevels.map((level) => (
                        <DropdownMenuRadioItem
                            key={level}
                            value={level}
                            closeOnClick
                        >
                            {REASONING_EFFORT_LABELS[level] ?? level}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
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
