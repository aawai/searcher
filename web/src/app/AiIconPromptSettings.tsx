import { useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
    BUILTIN_ICON_STYLES,
    type CustomIconStylePreset,
    DEFAULT_ICON_STYLE_ID,
    DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE,
    DEFAULT_TEXT_ICON_PROMPT_TEMPLATE,
    ICON_CUSTOM_STYLES_MAX_COUNT,
    ICON_PROMPT_MAX_LENGTH,
    ICON_STYLE_NAME_MAX_LENGTH,
    ICON_STYLE_PROMPT_MAX_LENGTH,
    type IconGenerationPreferences,
    resolveIconStyle,
} from "../../../src/shared/icon-prompts.ts";
import type { PreferencesDto } from "../../../src/shared/contracts.ts";
import { api, json } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import {
    FormField,
    FormFields,
    SettingsGroup,
    SettingsRow,
} from "../components/searcher/semantic.tsx";

export function AiIconPromptSettings({
    onStatus,
    onError,
}: {
    onStatus: (message: string) => void;
    onError: (message: string) => void;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [defaultStyle, setDefaultStyle] = useState<string>(
        DEFAULT_ICON_STYLE_ID,
    );
    const [defaultCount, setDefaultCount] = useState<1 | 2 | 3>(1);
    const [defaultProtocol, setDefaultProtocol] = useState<"openai" | "gemini">(
        "openai",
    );
    const [referenceTemplate, setReferenceTemplate] = useState(
        DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE,
    );
    const [textTemplate, setTextTemplate] = useState(
        DEFAULT_TEXT_ICON_PROMPT_TEMPLATE,
    );
    const [customStyles, setCustomStyles] = useState<CustomIconStylePreset[]>(
        [],
    );

    const [styleDialogOpen, setStyleDialogOpen] = useState(false);
    const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
    const [styleName, setStyleName] = useState("");
    const [stylePrompt, setStylePrompt] = useState("");
    const [deleteStyleTarget, setDeleteStyleTarget] = useState<
        CustomIconStylePreset | null
    >(null);

    useEffect(() => {
        let active = true;
        void api<PreferencesDto>("/api/preferences")
            .then((prefs) => {
                if (!active) return;
                const ig = prefs.aiGenerationDefaults?.iconGeneration;
                if (ig) {
                    applyPreferences(ig);
                }
            })
            .catch((err) => {
                if (active) onError(errorMessage(err));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    function applyPreferences(ig: IconGenerationPreferences) {
        const list = ig.customStyles ?? [];
        setCustomStyles(list);
        const resolved = resolveIconStyle(ig.defaultStyle, list);
        setDefaultStyle(resolved?.id ?? DEFAULT_ICON_STYLE_ID);
        setDefaultCount(ig.defaultCount ?? 1);
        setDefaultProtocol(ig.defaultProtocol ?? "openai");
        setReferenceTemplate(
            ig.referenceTemplate?.trim() ||
                DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE,
        );
        setTextTemplate(
            ig.textTemplate?.trim() || DEFAULT_TEXT_ICON_PROMPT_TEMPLATE,
        );
    }

    async function persist(patch: {
        defaultStyle?: string;
        defaultCount?: 1 | 2 | 3;
        defaultProtocol?: "openai" | "gemini";
        referenceTemplate?: string | null;
        textTemplate?: string | null;
        customStyles?: CustomIconStylePreset[] | null;
    }, successMessage: string) {
        setSaving(true);
        try {
            const updated = await api<PreferencesDto>(
                "/api/preferences",
                json("PATCH", {
                    aiGenerationDefaults: {
                        iconGeneration: patch,
                    },
                }),
            );
            applyPreferences(
                updated.aiGenerationDefaults?.iconGeneration ?? {},
            );
            onStatus(successMessage);
        } catch (err) {
            onError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    function handleSaveDefaults() {
        const refTrimmed = referenceTemplate.trim();
        const textTrimmed = textTemplate.trim();
        void persist(
            {
                defaultStyle,
                defaultCount,
                defaultProtocol,
                referenceTemplate:
                    refTrimmed === DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE.trim()
                        ? null
                        : refTrimmed || null,
                textTemplate:
                    textTrimmed === DEFAULT_TEXT_ICON_PROMPT_TEMPLATE.trim()
                        ? null
                        : textTrimmed || null,
            },
            "已保存应用图标生成默认设置",
        );
    }

    function openAddStyle() {
        setEditingStyleId(null);
        setStyleName("");
        setStylePrompt("");
        setStyleDialogOpen(true);
    }

    function openEditStyle(item: CustomIconStylePreset) {
        setEditingStyleId(item.id);
        setStyleName(item.name);
        setStylePrompt(item.prompt);
        setStyleDialogOpen(true);
    }

    async function handleSaveStyle() {
        const trimmedName = styleName.trim();
        const trimmedPrompt = stylePrompt.trim();
        if (!trimmedName || !trimmedPrompt) return;

        let nextStyles: CustomIconStylePreset[];
        if (editingStyleId) {
            nextStyles = customStyles.map((item) =>
                item.id === editingStyleId
                    ? { ...item, name: trimmedName, prompt: trimmedPrompt }
                    : item
            );
        } else {
            const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
            nextStyles = [
                ...customStyles,
                { id, name: trimmedName, prompt: trimmedPrompt },
            ];
        }
        setStyleDialogOpen(false);
        await persist(
            { customStyles: nextStyles },
            editingStyleId ? "已更新自定义风格" : "已添加自定义风格",
        );
    }

    async function handleDeleteStyle(target: CustomIconStylePreset) {
        const nextStyles = customStyles.filter((item) => item.id !== target.id);
        const nextDefaultStyle = defaultStyle === target.id
            ? DEFAULT_ICON_STYLE_ID
            : defaultStyle;
        setDeleteStyleTarget(null);
        await persist(
            {
                customStyles: nextStyles.length > 0 ? nextStyles : null,
                defaultStyle: nextDefaultStyle,
            },
            `已删除风格“${target.name}”`,
        );
    }

    const styleItems = Object.fromEntries([
        ...BUILTIN_ICON_STYLES.map((item) => [item.id, item.label]),
        ...customStyles.map((item) => [item.id, `${item.name}（自定义）`]),
    ]);

    return (
        <>
            <SettingsGroup
                title="应用图标生成"
                footer="模板支持变量：{{siteName}}、{{siteDomain}}、{{description}}、{{stylePrompt}}，以及条件块 {{#siteDomain}}...{{/siteDomain}}、{{#description}}...{{/description}}。"
            >
                <SettingsRow
                    title="默认风格"
                    labelFor="ai-icon-default-style"
                    description="新建或美化应用图标时默认选中的风格套件"
                >
                    <Select
                        items={styleItems}
                        value={defaultStyle}
                        disabled={loading || saving}
                        onValueChange={(next) => {
                            if (next !== null) setDefaultStyle(next);
                        }}
                    >
                        <SelectTrigger
                            id="ai-icon-default-style"
                            aria-label="默认风格"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {BUILTIN_ICON_STYLES.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    {item.label}
                                </SelectItem>
                            ))}
                            {customStyles.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    {`${item.name}（自定义）`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingsRow>
                <SettingsRow
                    title="默认生成数量"
                    description="单次请求默认生成的图标张数（建议 1 张，更省费且更稳定）"
                >
                    <RadioGroup
                        variant="segmented"
                        aria-label="默认生成数量"
                        value={String(defaultCount)}
                        disabled={loading || saving}
                        onValueChange={(next) => {
                            const parsed = Number(next);
                            if (parsed === 1 || parsed === 2 || parsed === 3) {
                                setDefaultCount(parsed);
                            }
                        }}
                    >
                        <RadioGroupItem value="1">1 张</RadioGroupItem>
                        <RadioGroupItem value="2">2 张</RadioGroupItem>
                        <RadioGroupItem value="3">3 张</RadioGroupItem>
                    </RadioGroup>
                </SettingsRow>
                <SettingsRow
                    title="默认图片协议"
                    description="参考图重绘推荐使用 Gemini 原生；OpenAI 需服务商支持 /images/edits"
                >
                    <RadioGroup
                        variant="segmented"
                        aria-label="默认图片协议"
                        value={defaultProtocol}
                        disabled={loading || saving}
                        onValueChange={(next) => {
                            if (next === "openai" || next === "gemini") {
                                setDefaultProtocol(next);
                            }
                        }}
                    >
                        <RadioGroupItem value="openai">
                            OpenAI Images
                        </RadioGroupItem>
                        <RadioGroupItem value="gemini">
                            Gemini 原生
                        </RadioGroupItem>
                    </RadioGroup>
                </SettingsRow>
                <SettingsRow
                    title="基于参考图重绘模板"
                    labelFor="ai-icon-ref-template"
                    className="settings-row--vertical"
                    description={`${referenceTemplate.length}/${ICON_PROMPT_MAX_LENGTH}`}
                >
                    <div className="ai-icon-template-field">
                        <Textarea
                            id="ai-icon-ref-template"
                            className="ai-icon-template-textarea"
                            placeholder="输入基于参考图的重绘提示词模板"
                            rows={6}
                            maxLength={ICON_PROMPT_MAX_LENGTH}
                            value={referenceTemplate}
                            disabled={loading || saving}
                            onChange={(e) =>
                                setReferenceTemplate(e.target.value)}
                        />
                        <div className="ai-icon-template-actions">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={loading || saving}
                                onClick={() =>
                                    setReferenceTemplate(
                                        DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE,
                                    )}
                            >
                                <RotateCcw size="1em" className="icon-sm" />
                                <span>恢复默认</span>
                            </Button>
                        </div>
                    </div>
                </SettingsRow>
                <SettingsRow
                    title="无参考图生成模板"
                    labelFor="ai-icon-text-template"
                    className="settings-row--vertical"
                    description={`${textTemplate.length}/${ICON_PROMPT_MAX_LENGTH}`}
                >
                    <div className="ai-icon-template-field">
                        <Textarea
                            id="ai-icon-text-template"
                            className="ai-icon-template-textarea"
                            placeholder="输入无参考图时的文生图提示词模板"
                            rows={6}
                            maxLength={ICON_PROMPT_MAX_LENGTH}
                            value={textTemplate}
                            disabled={loading || saving}
                            onChange={(e) => setTextTemplate(e.target.value)}
                        />
                        <div className="ai-icon-template-actions">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={loading || saving}
                                onClick={() =>
                                    setTextTemplate(
                                        DEFAULT_TEXT_ICON_PROMPT_TEMPLATE,
                                    )}
                            >
                                <RotateCcw size="1em" className="icon-sm" />
                                <span>恢复默认</span>
                            </Button>
                        </div>
                    </div>
                </SettingsRow>
                <SettingsRow title="保存默认配置">
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={loading || saving}
                        onClick={handleSaveDefaults}
                    >
                        {saving ? "保存中…" : "保存设置"}
                    </Button>
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup
                title="自定义图标风格预设"
                footer={`最多可创建 ${ICON_CUSTOM_STYLES_MAX_COUNT} 个自定义风格，用于替换模板中的 {{stylePrompt}}。`}
            >
                <SettingsRow
                    title="我的风格套件"
                    description={customStyles.length > 0
                        ? `已创建 ${customStyles.length} 个自定义风格`
                        : "创建属于你自己的统一桌面视觉风格"}
                >
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading || saving ||
                            customStyles.length >= ICON_CUSTOM_STYLES_MAX_COUNT}
                        onClick={openAddStyle}
                    >
                        <Plus size="1em" className="icon-sm" />
                        <span>新建风格预设</span>
                    </Button>
                </SettingsRow>
                {customStyles.map((item) => (
                    <SettingsRow
                        key={item.id}
                        title={item.name}
                        description={item.prompt}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`编辑风格 ${item.name}`}
                            disabled={saving}
                            onClick={() => openEditStyle(item)}
                        >
                            <Pencil size="1em" className="icon-sm" />
                            <span>编辑</span>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`删除风格 ${item.name}`}
                            disabled={saving}
                            onClick={() => setDeleteStyleTarget(item)}
                        >
                            <Trash2 size="1em" className="icon-sm" />
                            <span>删除</span>
                        </Button>
                    </SettingsRow>
                ))}
            </SettingsGroup>

            <Dialog
                open={styleDialogOpen}
                onOpenChange={setStyleDialogOpen}
            >
                <DialogContent
                    aria-label={editingStyleId
                        ? "编辑自定义风格"
                        : "新建自定义风格"}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editingStyleId
                                ? "编辑自定义风格"
                                : "新建自定义风格"}
                        </DialogTitle>
                        <DialogDescription>
                            定义统一背景、材质、光照与色彩规则，供所有应用图标复用。
                        </DialogDescription>
                    </DialogHeader>
                    <FormFields>
                        <FormField
                            label="风格名称"
                            labelFor="ai-custom-style-name"
                        >
                            <Input
                                id="ai-custom-style-name"
                                placeholder="例如：毛玻璃液态"
                                maxLength={ICON_STYLE_NAME_MAX_LENGTH}
                                value={styleName}
                                onChange={(e) => setStyleName(e.target.value)}
                            />
                        </FormField>
                        <FormField
                            label="风格提示词"
                            labelFor="ai-custom-style-prompt"
                        >
                            <Textarea
                                id="ai-custom-style-prompt"
                                placeholder="例如：Clean dark obsidian square background (#14161B), glowing translucent glass emblem with crisp specular rim..."
                                rows={5}
                                maxLength={ICON_STYLE_PROMPT_MAX_LENGTH}
                                value={stylePrompt}
                                onChange={(e) => setStylePrompt(e.target.value)}
                            />
                        </FormField>
                    </FormFields>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStyleDialogOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            disabled={saving || !styleName.trim() ||
                                !stylePrompt.trim()}
                            onClick={() => void handleSaveStyle()}
                        >
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={deleteStyleTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteStyleTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除自定义风格？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteStyleTarget
                                ? `将永久删除风格“${deleteStyleTarget.name}”。`
                                : "将永久删除该自定义风格。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                if (deleteStyleTarget) {
                                    void handleDeleteStyle(deleteStyleTarget);
                                }
                            }}
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
