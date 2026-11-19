import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
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
            setActionError(
                err instanceof Error ? err.message : "清除已保存默认参数失败",
            );
            setTimeout(() => setActionError(null), 3500);
        } finally {
            setResetting(false);
        }
    }

    return (
        <section className="ask-composer__section ask-generation-settings">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ask-generation-settings__toggle"
                aria-expanded={open}
                aria-controls="ask-generation-settings-body"
                onClick={() => setOpen((prev) => !prev)}
            >
                <span className="ask-generation-settings__toggle-label">
                    <Settings2
                        size="1em"
                        className="icon-sm"
                        aria-hidden="true"
                    />
                    <span>高级生成设置</span>
                    {isCustomized && (
                        <span className="ask-generation-settings__status">
                            已自定义
                        </span>
                    )}
                </span>
                <ChevronDown
                    size="1em"
                    className={`icon-sm ask-generation-settings__chevron${
                        open ? " is-open" : ""
                    }`}
                    aria-hidden="true"
                />
            </Button>

            {open && (
                <div
                    id="ask-generation-settings-body"
                    role="region"
                    aria-label="生成参数设置"
                    className="ask-generation-settings__body"
                >
                    <div className="ask-generation-settings__head">
                        <span className="ask-generation-settings__title">
                            生成参数{model
                                ? `（${model.displayName || model.modelId}）`
                                : ""}
                        </span>
                        {isCustomized && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetCurrent}
                                title="清除当前采样和长度覆盖，推理强度不变"
                            >
                                重置当前参数
                            </Button>
                        )}
                    </div>

                    <p className="ask-generation-settings__note">
                        重置当前参数会清除当前采样和长度覆盖，依次使用已保存的模型默认、全局默认或服务商默认值；推理强度不变。
                    </p>
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
                                        <span>Temperature（随机性）</span>
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
                                        <span>较低随机性</span>
                                        <span>较高随机性</span>
                                    </div>
                                </div>

                                <div className="ask-generation-settings__field">
                                    <div className="ask-generation-settings__label">
                                        <span>Top P（核采样）</span>
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
                            <span>Max Tokens（最大长度）</span>
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
                                    title="清除该模型已保存的默认参数，当前参数将重新继承全局或模型默认值"
                                >
                                    {resetting ? "清除中…" : "清除已保存默认参数"}
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
                                        ? "保存中…"
                                        : "设为该模型默认"}
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
            )}
        </section>
    );
}
