import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverTrigger,
} from "../../components/ui/popover.tsx";
import { Slider } from "../../components/ui/slider.tsx";
import type { UserGenerationConfig } from "@shared/contracts.ts";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import type { GenerationConfig } from "./types.ts";

export type { UserGenerationConfig };

export interface GenerationSettingsProps {
    config: GenerationConfig;
    onChange: (config: GenerationConfig) => void;
    model?: AiModelDto;
    isReasoningStrict?: boolean;
    onSaveDefault?: (config: UserGenerationConfig) => Promise<void> | void;
    onResetDefault?: () => Promise<void> | void;
    isDefault?: boolean;
}

export function GenerationSettings({
    config,
    onChange,
    model,
    isReasoningStrict: isReasoningStrictProp,
    onSaveDefault,
    onResetDefault,
    isDefault = false,
}: GenerationSettingsProps) {
    const [open, setOpen] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const isStrict = isReasoningStrictProp ?? model?.isReasoningStrict ?? false;

    const temperature = config.temperature ?? 0.7;
    const topP = config.topP ?? 1.0;
    const maxTokens = config.maxTokens ?? 4096;

    const isCustomized = (!isStrict &&
        (config.temperature !== undefined || config.topP !== undefined)) ||
        config.maxTokens !== undefined;

    function handleResetCurrent() {
        onChange({
            ...config,
            temperature: undefined,
            topP: undefined,
            maxTokens: undefined,
        });
    }

    async function handleSaveAsDefault() {
        if (!onSaveDefault || saving) return;
        const defaultConfig: UserGenerationConfig = {
            maxTokens: config.maxTokens,
            reasoningEffort: config.reasoningEffort,
        };
        if (!isStrict) {
            defaultConfig.temperature = config.temperature;
            defaultConfig.topP = config.topP;
        }
        setSaving(true);
        setActionError(null);
        try {
            await onSaveDefault(defaultConfig);
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 2000);
        } catch (err: unknown) {
            setActionError(
                err instanceof Error ? err.message : "保存默认参数失败",
            );
            setTimeout(() => setActionError(null), 3500);
        } finally {
            setSaving(false);
        }
    }

    async function handleResetDefaultAction() {
        if (!onResetDefault || resetting) return;
        setResetting(true);
        setActionError(null);
        try {
            await onResetDefault();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : "恢复预设失败");
            setTimeout(() => setActionError(null), 3500);
        } finally {
            setResetting(false);
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`ask-composer__icon-btn ${
                            isCustomized ? "is-active" : ""
                        }`}
                        aria-label="高级生成设置"
                        title="高级生成设置 (Temperature, Top P, Max Tokens)"
                    />
                }
            >
                <Settings2 size="1em" className="icon-md" />
                {isCustomized && <span className="ask-composer__active-dot" />}
            </PopoverTrigger>

            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="ask-generation-settings__popover"
                aria-label="生成参数设置"
            >
                <div className="ask-generation-settings__head">
                    <span className="ask-generation-settings__title">
                        生成参数{model
                            ? ` (${model.displayName || model.modelId})`
                            : ""}
                    </span>
                    <div className="ask-generation-settings__head-actions">
                        {isCustomized && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetCurrent}
                                title="恢复默认参数"
                            >
                                重置
                            </Button>
                        )}
                        <PopoverClose
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="关闭"
                                />
                            }
                        >
                            <X size="1em" className="icon-sm" />
                        </PopoverClose>
                    </div>
                </div>

                <div className="ask-generation-settings__body">
                    {isStrict
                        ? (
                            <p className="ask-generation-settings__note">
                                严格推理模型不支持调整 Temperature 与 Top P。
                            </p>
                        )
                        : (
                            <>
                                <div className="ask-generation-settings__field">
                                    <div className="ask-generation-settings__label">
                                        <span>Temperature (随机性)</span>
                                        <span className="ask-generation-settings__value">
                                            {temperature.toFixed(2)}
                                        </span>
                                    </div>
                                    <Slider
                                        min={0}
                                        max={2}
                                        step={0.05}
                                        value={[temperature]}
                                        onValueChange={(val) => {
                                            const next = Array.isArray(val)
                                                ? val[0]
                                                : val;
                                            onChange({
                                                ...config,
                                                temperature: next,
                                            });
                                        }}
                                        aria-label="Temperature"
                                    />
                                    <div className="ask-generation-settings__scale">
                                        <span>严谨</span>
                                        <span>创造</span>
                                    </div>
                                </div>

                                <div className="ask-generation-settings__field">
                                    <div className="ask-generation-settings__label">
                                        <span>Top P (核采样)</span>
                                        <span className="ask-generation-settings__value">
                                            {topP.toFixed(2)}
                                        </span>
                                    </div>
                                    <Slider
                                        min={0.05}
                                        max={1}
                                        step={0.05}
                                        value={[topP]}
                                        onValueChange={(val) => {
                                            const next = Array.isArray(val)
                                                ? val[0]
                                                : val;
                                            onChange({ ...config, topP: next });
                                        }}
                                        aria-label="Top P"
                                    />
                                </div>
                            </>
                        )}

                    <div className="ask-generation-settings__field">
                        <div className="ask-generation-settings__label">
                            <span>Max Tokens (最大长度)</span>
                            <span className="ask-generation-settings__value">
                                {maxTokens}
                            </span>
                        </div>
                        <Slider
                            min={256}
                            max={16384}
                            step={256}
                            value={[maxTokens]}
                            onValueChange={(val) => {
                                const next = Array.isArray(val) ? val[0] : val;
                                onChange({ ...config, maxTokens: next });
                            }}
                            aria-label="Max Tokens"
                        />
                    </div>

                    {(onSaveDefault || onResetDefault) && (
                        <div className="ask-generation-settings__footer">
                            {onResetDefault && isDefault && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={resetting}
                                    onClick={handleResetDefaultAction}
                                    title="恢复模型全局预设默认"
                                >
                                    {resetting ? "恢复中..." : "恢复预设"}
                                </Button>
                            )}
                            {onSaveDefault && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={saving}
                                    onClick={handleSaveAsDefault}
                                    className="ask-generation-settings__save"
                                    title="保存当前设置为该模型的默认生成参数"
                                >
                                    {savedNotice
                                        ? "已保存默认"
                                        : saving
                                        ? "保存中..."
                                        : "设为默认"}
                                </Button>
                            )}
                            {actionError && (
                                <p className="ask-generation-settings__error">
                                    {actionError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
