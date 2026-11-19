import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group.tsx";
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

    return (
        <section className="ask-composer__section">
            <h3 className="ask-composer__section-title">推理强度</h3>
            <RadioGroup
                variant="segmented"
                className="ask-composer__reasoning-group"
                aria-label="推理强度"
                value={value ?? PROVIDER_DEFAULT}
                onValueChange={(next) =>
                    onChange(
                        availableLevels.find((level) => level === next),
                    )}
            >
                <RadioGroupItem value={PROVIDER_DEFAULT}>默认</RadioGroupItem>
                {availableLevels.map((level) => (
                    <RadioGroupItem key={level} value={level}>
                        {REASONING_EFFORT_LABELS[level] ?? level}
                    </RadioGroupItem>
                ))}
            </RadioGroup>
        </section>
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
