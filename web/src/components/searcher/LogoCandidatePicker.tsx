import { Link } from "react-router-dom";
import { Check, Loader2, Sparkles } from "lucide-react";
import {
    LOGO_STYLES,
    type LogoStyle,
} from "../../../../src/features/ai/types.ts";
import { LOGO_STYLE_LABELS, type LogoSession } from "./useLogoSession.ts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog.tsx";
import { Button, buttonVariants } from "../ui/button.tsx";
import { routes } from "../../app/routes.ts";
import { Input } from "../ui/input.tsx";
import { NativeSelect } from "../ui/native-select.tsx";
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
            <SettingsRow title="AI 生成" description="未配置图片模型">
                <Link
                    to={routes.settings("ai")}
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                    onClick={onClose}
                >
                    前往设置
                </Link>
            </SettingsRow>
        );
    }

    return (
        <>
            <SettingsRow title="模型" labelFor="ai-model-select">
                <NativeSelect
                    id="ai-model-select"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    disabled={busy}
                >
                    {models.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.displayName} ·{" "}
                            {providers.find((provider) =>
                                provider.id === item.providerId
                            )?.name ?? "未知"} · {item.modelId}
                        </option>
                    ))}
                </NativeSelect>
            </SettingsRow>
            <SettingsRow title="风格" labelFor="ai-style-select">
                <NativeSelect
                    id="ai-style-select"
                    value={style}
                    onChange={(event) =>
                        setStyle(event.target.value as LogoStyle)}
                    disabled={busy}
                >
                    {LOGO_STYLES.map((styleKey) => (
                        <option key={styleKey} value={styleKey}>
                            {LOGO_STYLE_LABELS[styleKey]}
                        </option>
                    ))}
                </NativeSelect>
            </SettingsRow>
            <SettingsRow
                title="图片协议"
                labelFor="ai-image-protocol"
                message="仅用于本次生成，不修改模型配置。"
                messageId="ai-image-protocol-hint"
            >
                <NativeSelect
                    id="ai-image-protocol"
                    value={imageProtocol}
                    disabled={busy}
                    aria-describedby="ai-image-protocol-hint"
                    onChange={(event) => {
                        const value = event.target.value;
                        if (
                            value === "openai" || value === "gemini"
                        ) setImageProtocol(value);
                    }}
                >
                    <option value="openai">OpenAI Images</option>
                    <option value="gemini">Gemini 原生</option>
                </NativeSelect>
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
                    placeholder="例如：个人探索与常用应用启动器"
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
                    <div
                        className="app-ai-candidates-grid"
                        role="radiogroup"
                        aria-label="AI 图标候选"
                    >
                        {candidates.map((candidate, index) => {
                            const isSelected = selectedCandidateIndex === index;
                            return (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    className={`app-ai-candidate-card${
                                        isSelected ? " is-selected" : ""
                                    }`}
                                    key={index}
                                    disabled={busy}
                                    onClick={() =>
                                        void choose(candidate, index)}
                                    aria-label={`选用第 ${
                                        index + 1
                                    } 个 AI 图标候选`}
                                >
                                    <div className="app-ai-candidate-img-box">
                                        <img src={candidate.dataUrl} alt="" />
                                    </div>
                                    <div className="app-ai-candidate-footer">
                                        <span className="app-ai-candidate-radio-dot">
                                            {isSelected && (
                                                <Check
                                                    size="1em"
                                                    className="icon-sm"
                                                />
                                            )}
                                        </span>
                                        <span>图标 {index + 1}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </SettingsRow>
            )}
            <AlertDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) {
                        setConfirmSnapshot(null);
                    }
                }}
            >
                <AlertDialogContent className="app-ai-confirm-dialog">
                    {confirmSnapshot && (
                        <>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    生成 AI 图标
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    应用名称、域名和用途将发送至以下服务商，可能产生费用。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="app-ai-confirm-body min-h-0 overflow-y-auto">
                                <div className="app-ai-confirm-item">
                                    <span className="app-ai-confirm-label">
                                        服务商
                                    </span>
                                    <span className="app-ai-confirm-value font-medium">
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
                                    <span className="app-ai-confirm-value font-medium">
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
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={busy}>
                                    取消
                                </AlertDialogCancel>
                                <AlertDialogAction
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
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </>
                    )}
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
