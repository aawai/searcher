import { Link } from "react-router-dom";
import { Check, Loader2, Sparkles } from "lucide-react";
import {
    LOGO_STYLES,
    type LogoStyle,
} from "../../../../src/features/ai/types.ts";
import { LOGO_STYLE_LABELS, type LogoSession } from "./useLogoSession.ts";
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
        imageProtocol,
        description,
        confirmOpen,
        confirmSnapshot,
        candidates,
        selectedCandidateIndex,
        busy,
        setSelectedId,
        setStyle,
        setImageProtocol,
        setDescription,
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

    return (
        <>
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
            <SettingsRow title="风格" labelFor="ai-style-select">
                <Select
                    items={LOGO_STYLE_LABELS}
                    value={style}
                    onValueChange={(next) => {
                        if (next !== null) setStyle(next as LogoStyle);
                    }}
                    disabled={busy}
                >
                    <SelectTrigger id="ai-style-select" aria-label="风格">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LOGO_STYLES.map((styleKey) => (
                            <SelectItem key={styleKey} value={styleKey}>
                                {LOGO_STYLE_LABELS[styleKey]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>
            <SettingsRow
                title="图片协议"
                message="仅用于本次生成，不修改模型配置。"
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
                title="用途（可选）"
                labelFor="ai-description-input"
                className="settings-row--vertical"
                description={description.length > 0
                    ? `${description.length}/300`
                    : undefined}
            >
                <Input
                    id="ai-description-input"
                    type="text"
                    placeholder="简要描述应用的用途"
                    maxLength={300}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={busy}
                />
            </SettingsRow>
            <SettingsRow
                title="候选图标"
                description="根据名称、域名和用途生成 3 个原创图标"
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
                        清除生成结果
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !selectedId || !siteName.trim()}
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
                                    } 个 AI 图标候选`}
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
                                        <span>图标 {index + 1}</span>
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
                                    应用名称、域名和用途将发送至以下服务商，可能产生费用。
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
                                        {confirmSnapshot.styleLabel}
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
                                {confirmSnapshot.description && (
                                    <div className="app-ai-confirm-item">
                                        <span className="app-ai-confirm-label">
                                            用途描述
                                        </span>
                                        <span className="app-ai-confirm-value">
                                            {confirmSnapshot.description}
                                        </span>
                                    </div>
                                )}
                                <div className="app-ai-confirm-hint">
                                    将生成 3 个原创图标，非官方品牌标志。
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
