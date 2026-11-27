import { Link } from "react-router-dom";
import {
    Check,
    ChevronDown,
    ChevronUp,
    Loader2,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import { ICON_PROMPT_MAX_LENGTH } from "../../../../src/shared/icon-prompts.ts";
import type { LogoSession } from "./useLogoSession.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog.tsx";
import { Button, buttonVariants } from "../ui/button.tsx";
import { routes } from "../../app/routes.ts";
import { Input } from "../ui/input.tsx";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select.tsx";
import { Switch } from "../ui/switch.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { cn } from "../../lib/utils.ts";
import { SettingsRow } from "./semantic.tsx";

/** The AI source of the app form's icon group: rows inside that group. */
export function LogoCandidatePicker({ session }: { session: LogoSession }) {
    const {
        loadingModels,
        models,
        providers,
        selectedId,
        style,
        styleOptions,
        count,
        imageProtocol,
        description,
        referenceIcon,
        useReferenceIcon,
        effectiveReference,
        effectivePrompt,
        isPromptCustomized,
        promptExpanded,
        confirmOpen,
        confirmSnapshot,
        candidates,
        selectedCandidateIndex,
        busy,
        setSelectedId,
        setStyle,
        setCount,
        setImageProtocol,
        setDescription,
        setUseReferenceIcon,
        setCustomPrompt,
        setPromptExpanded,
        setConfirmOpen,
        setConfirmSnapshot,
        setCandidates,
        setSelectedCandidateIndex,
        promptGenerateConfirm,
        executeGenerate,
        choose,
        siteName,
        onClose,
    } = session;

    if (loadingModels) {
        return (
            <SettingsRow title="AI 生成">
                <span className="app-ai-loading">
                    <Loader2 size="1em" className="icon-sm animate-spin" />
                    <span>正在加载模型…</span>
                </span>
            </SettingsRow>
        );
    }

    if (!models.length) {
        return (
            <SettingsRow
                title="AI 生成"
                description="暂无可用模型，请在 AI 设置中添加服务商或联系管理员。"
            >
                <Link
                    to={routes.settings("ai")}
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                    onClick={onClose}
                >
                    前往 AI 设置
                </Link>
            </SettingsRow>
        );
    }

    const modelItems = Object.fromEntries(
        models.map((item) => [
            item.id,
            `${item.displayName} · ${
                providers.find((provider) => provider.id === item.providerId)
                    ?.name ?? "未知"
            } · ${item.modelId}`,
        ]),
    );
    const styleItems = Object.fromEntries(
        styleOptions.map((item) => [item.id, item.label]),
    );

    return (
        <>
            {referenceIcon
                ? (
                    <SettingsRow
                        title="基于当前图标美化"
                        labelFor="ai-use-reference-icon"
                        description="将当前真实图标作为参考图发给 AI，保留品牌特征并统一桌面风格"
                    >
                        <img
                            src={referenceIcon.previewUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="app-ai-ref-thumb"
                        />
                        <Switch
                            id="ai-use-reference-icon"
                            aria-label="基于当前图标美化"
                            checked={useReferenceIcon}
                            disabled={busy}
                            onCheckedChange={setUseReferenceIcon}
                        />
                    </SettingsRow>
                )
                : (
                    <SettingsRow
                        title="参考图标"
                        description="暂无可用原图，将按名称与风格从零生成；也可先通过“网站图标”或“上传图片”获取原图。"
                    />
                )}
            <SettingsRow title="模型" labelFor="ai-model-select">
                <Select
                    items={modelItems}
                    value={selectedId}
                    onValueChange={(next) => {
                        if (next !== null) setSelectedId(next);
                    }}
                    disabled={busy}
                >
                    <SelectTrigger id="ai-model-select" aria-label="模型">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {models.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {modelItems[item.id]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>
            <SettingsRow
                title="风格"
                labelFor="ai-style-select"
                description={
                    <Link
                        to={routes.settings("ai")}
                        className="app-ai-settings-link"
                        onClick={onClose}
                    >
                        在 AI 设置中管理全局风格与模板
                    </Link>
                }
            >
                <Select
                    items={styleItems}
                    value={style}
                    onValueChange={(next) => {
                        if (next !== null) setStyle(next);
                    }}
                    disabled={busy || isPromptCustomized}
                >
                    <SelectTrigger id="ai-style-select" aria-label="风格">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {styleOptions.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>
            <SettingsRow title="生成数量">
                <RadioGroup
                    variant="segmented"
                    aria-label="生成数量"
                    value={String(count)}
                    disabled={busy}
                    onValueChange={(next) => {
                        const parsed = Number(next);
                        if (parsed === 1 || parsed === 2 || parsed === 3) {
                            setCount(parsed);
                        }
                    }}
                >
                    <RadioGroupItem value="1">1 张</RadioGroupItem>
                    <RadioGroupItem value="2">2 张</RadioGroupItem>
                    <RadioGroupItem value="3">3 张</RadioGroupItem>
                </RadioGroup>
            </SettingsRow>
            <SettingsRow
                title="图片协议"
                message={effectiveReference && imageProtocol === "openai"
                    ? "携带参考图时将调用 /images/edits 接口；部分中转站不支持该接口，可改用 Gemini 原生。"
                    : "仅用于本次生成，不修改模型配置。"}
                messageId="ai-image-protocol-hint"
            >
                <RadioGroup
                    id="ai-image-protocol"
                    variant="segmented"
                    aria-label="图片协议"
                    aria-describedby="ai-image-protocol-hint"
                    value={imageProtocol}
                    disabled={busy}
                    onValueChange={(next) => {
                        if (next === "openai" || next === "gemini") {
                            setImageProtocol(next);
                        }
                    }}
                >
                    <RadioGroupItem value="openai">
                        OpenAI Images
                    </RadioGroupItem>
                    <RadioGroupItem value="gemini">Gemini 原生</RadioGroupItem>
                </RadioGroup>
            </SettingsRow>
            <SettingsRow
                title="补充描述（可选）"
                labelFor="ai-description-input"
                className="settings-row--vertical"
                description={description.length > 0
                    ? `${description.length}/300`
                    : undefined}
            >
                <Input
                    id="ai-description-input"
                    type="text"
                    placeholder="简要描述应用用途或想要调整的细节"
                    maxLength={300}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={busy || isPromptCustomized}
                />
            </SettingsRow>
            <SettingsRow
                title="提示词"
                description={isPromptCustomized
                    ? "已手动覆盖提示词，将原样发送"
                    : "默认按风格与参考图自动组装，可展开完全自定义"}
            >
                {isPromptCustomized && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setCustomPrompt(null)}
                    >
                        <RotateCcw size="1em" className="icon-sm" />
                        <span>恢复默认</span>
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={promptExpanded}
                    onClick={() => setPromptExpanded(!promptExpanded)}
                >
                    {promptExpanded
                        ? <ChevronUp size="1em" className="icon-sm" />
                        : <ChevronDown size="1em" className="icon-sm" />}
                    <span>
                        {promptExpanded ? "收起提示词" : "查看 / 自定义"}
                    </span>
                </Button>
            </SettingsRow>
            {promptExpanded && (
                <SettingsRow
                    title="最终提示词"
                    labelFor="ai-custom-prompt"
                    className="settings-row--vertical"
                    description={`${effectivePrompt.length}/${ICON_PROMPT_MAX_LENGTH}`}
                >
                    <Textarea
                        id="ai-custom-prompt"
                        className="app-ai-prompt-textarea"
                        placeholder="输入完整英文或中文生图提示词"
                        rows={7}
                        maxLength={ICON_PROMPT_MAX_LENGTH}
                        value={effectivePrompt}
                        disabled={busy}
                        onChange={(event) =>
                            setCustomPrompt(event.target.value)}
                    />
                </SettingsRow>
            )}
            <SettingsRow
                title="生成图标"
                description={effectiveReference
                    ? `基于当前图标生成 ${count} 张统一风格图标`
                    : `根据名称与风格生成 ${count} 张图标`}
            >
                {candidates.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                            setCandidates([]);
                            setSelectedCandidateIndex(null);
                        }}
                    >
                        清除结果
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !selectedId || !siteName.trim() ||
                        (isPromptCustomized && !effectivePrompt.trim())}
                    onClick={promptGenerateConfirm}
                >
                    {busy
                        ? (
                            <>
                                <Loader2
                                    size="1em"
                                    className="icon-sm animate-spin"
                                />
                                <span>处理中…</span>
                            </>
                        )
                        : (
                            <>
                                <Sparkles size="1em" className="icon-sm" />
                                <span>生成图标</span>
                            </>
                        )}
                </Button>
            </SettingsRow>
            {candidates.length > 0 && (
                <SettingsRow
                    title="生成结果"
                    className="settings-row--vertical"
                >
                    <RadioGroup
                        className="app-ai-candidates-grid"
                        data-count={String(candidates.length)}
                        aria-label="AI 图标候选"
                        disabled={busy}
                        value={selectedCandidateIndex !== null
                            ? String(selectedCandidateIndex)
                            : ""}
                        onValueChange={(value) => {
                            const index = Number(value);
                            const candidate = candidates[index];
                            if (Number.isInteger(index) && candidate) {
                                void choose(candidate, index);
                            }
                        }}
                    >
                        {candidates.map((candidate, index) => {
                            const isSelected = selectedCandidateIndex === index;
                            return (
                                <RadioGroupItem
                                    key={index}
                                    value={String(index)}
                                    disabled={busy}
                                    className={cn(
                                        "app-ai-candidate-card",
                                        isSelected && "is-selected",
                                    )}
                                    aria-label={`选用第 ${
                                        index + 1
                                    } 个 AI 图标`}
                                >
                                    <div className="app-ai-candidate-img-box">
                                        <img
                                            src={candidate.dataUrl}
                                            alt=""
                                            width={128}
                                            height={128}
                                        />
                                    </div>
                                    <div className="app-ai-candidate-footer">
                                        <span
                                            className="app-ai-candidate-radio-dot"
                                            aria-hidden="true"
                                        >
                                            {isSelected && (
                                                <Check
                                                    size="1em"
                                                    className="icon-sm"
                                                />
                                            )}
                                        </span>
                                        <span>
                                            {isSelected
                                                ? "已选用"
                                                : candidates.length === 1
                                                ? "应用此图标"
                                                : `图标 ${index + 1}`}
                                        </span>
                                    </div>
                                </RadioGroupItem>
                            );
                        })}
                    </RadioGroup>
                </SettingsRow>
            )}
            <Dialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) {
                        setConfirmSnapshot(null);
                    }
                }}
            >
                <DialogContent className="app-ai-confirm-dialog">
                    {confirmSnapshot && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    生成 AI 图标
                                </DialogTitle>
                                <DialogDescription>
                                    以下请求内容将发送至服务商，可能产生费用。
                                </DialogDescription>
                            </DialogHeader>
                            <div className="app-ai-confirm-body">
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        服务商
                                    </span>
                                    <span className="app-ai-confirm-value app-ai-confirm-value--emphasis">
                                        {confirmSnapshot.providerName}{" "}
                                        ({confirmSnapshot.baseUrl})
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        模型
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.modelDisplayName}{" "}
                                        ({confirmSnapshot.modelId})
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        模式
                                    </span>
                                    <span className="app-ai-confirm-value app-ai-confirm-ref-row">
                                        {confirmSnapshot.referenceIcon
                                            ? (
                                                <>
                                                    <img
                                                        src={confirmSnapshot
                                                            .referenceIcon
                                                            .previewUrl}
                                                        alt=""
                                                        width={20}
                                                        height={20}
                                                        className="app-ai-ref-thumb"
                                                    />
                                                    <span>
                                                        基于当前图标美化（{confirmSnapshot
                                                            .count} 张）
                                                    </span>
                                                </>
                                            )
                                            : (
                                                <span>
                                                    纯文字生成（{confirmSnapshot
                                                        .count} 张）
                                                </span>
                                            )}
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        图片协议
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.imageProtocol ===
                                                "gemini"
                                            ? "Gemini 原生"
                                            : "OpenAI Images"}
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        风格
                                    </span>
                                    <span className="app-ai-confirm-value">
                                        {confirmSnapshot.isPromptCustomized
                                            ? "完全自定义提示词"
                                            : confirmSnapshot.styleLabel}
                                    </span>
                                </div>
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        应用名称
                                    </span>
                                    <span className="app-ai-confirm-value app-ai-confirm-value--emphasis">
                                        {confirmSnapshot.siteName}
                                    </span>
                                </div>
                                {confirmSnapshot.siteDomain && (
                                    <div className="app-ai-confirm-item">
                                        <span className="app-ai-confirm-label">
                                            网站域名
                                        </span>
                                        <span className="app-ai-confirm-value">
                                            {confirmSnapshot.siteDomain}
                                        </span>
                                    </div>
                                )}
                                <div className="app-ai-confirm-prompt-box">
                                    <div className="app-ai-confirm-prompt-title">
                                        最终发送提示词
                                    </div>
                                    <pre className="app-ai-confirm-prompt-pre">
                                        {confirmSnapshot.finalPrompt}
                                    </pre>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => {
                                        setConfirmOpen(false);
                                        setConfirmSnapshot(null);
                                    }}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="button"
                                    variant="default"
                                    disabled={busy}
                                    onClick={() => {
                                        const snapshot = confirmSnapshot;
                                        setConfirmOpen(false);
                                        setConfirmSnapshot(null);
                                        if (snapshot) {
                                            void executeGenerate(snapshot);
                                        }
                                    }}
                                >
                                    确认生成
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
