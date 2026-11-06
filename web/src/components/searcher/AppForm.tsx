import { useAppSessionContext } from "./AppSessionProvider.tsx";
import { Check, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "../ui/native-select.tsx";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";
import { Switch } from "../ui/switch.tsx";
import { LogoCandidatePicker } from "./LogoCandidatePicker.tsx";
import { SettingsGroup, SettingsRow } from "./semantic.tsx";
import { WebAppGlyph } from "./WebAppIcon.tsx";
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

export function AppForm() {
    const session = useAppSessionContext();
    const {
        editingApp,
        groups,
        appearance,
        appUrl,
        appName,
        appGroupId,
        appHomeFixed,
        appOpenMode,
        iconTab,
        appIconSource,
        iconPreviewUrl,
        iconImageUrl,
        urlFetchStatus,
        urlFetchMessage,
        formError,
        isSubmitting,
        isUploadingIcon,
        isFetchingUrlIcon,
        confirmDialog,
        activeConfirmType,
        urlValidationError,
        previewName,
        previewDomain,
        iconExpanded,
        iconError,
        logo,
        setIconExpanded,
        setAppName,
        setAppGroupId,
        setAppHomeFixed,
        setAppOpenMode,
        setIconTab,
        setAppIconAssetId,
        setAppIconSource,
        setIconPreviewUrl,
        setImageLoadError,
        setIconImageUrl,
        handleUrlChange,
        handleUrlBlur,
        handleRetryFetch,
        handleFileUpload,
        handleUseImageUrl,
        handleSubmit,
        handleCancelConfirm,
        handleConfirmDuplicate,
        handleConfirmIconUpdate,
        onClose,
    } = session;
    // The URL row always keeps its second line, sized for the retry button, so
    // fetch feedback arriving later never moves the rows and footer below it.
    const urlMessage = (
        <span
            className="app-dialog-url-status"
            data-tone={urlValidationError || urlFetchStatus === "error"
                ? "danger"
                : urlFetchStatus === "success"
                ? "success"
                : undefined}
        >
            {urlValidationError
                ? <span role="alert">{urlValidationError}</span>
                : urlFetchStatus === "loading"
                ? (
                    <>
                        <Loader2 size="1em" className="icon-sm animate-spin" />
                        <span>{urlFetchMessage}</span>
                    </>
                )
                : urlFetchStatus === "success"
                ? (
                    <>
                        <Check size="1em" className="icon-sm" />
                        <span>{urlFetchMessage}</span>
                    </>
                )
                : urlFetchStatus === "error"
                ? (
                    <>
                        <span>{urlFetchMessage}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRetryFetch}
                        >
                            重新获取
                        </Button>
                    </>
                )
                : "填写后自动获取应用名称和网站图标"}
        </span>
    );
    const sourceLabel = appIconSource === "website"
        ? "自动获取"
        : appIconSource === "upload"
        ? "本地上传"
        : appIconSource === "url"
        ? "网络图片"
        : appIconSource === "ai"
        ? "AI 生成"
        : "首字母";
    const formJsx = (
        <form onSubmit={handleSubmit} className="app-dialog-form">
            <div className="app-dialog-body">
                {formError && (
                    <p role="alert" className="error app-dialog-form-error">
                        {formError}
                    </p>
                )}

                <SettingsGroup title="基础信息" headingLevel={3}>
                    <SettingsRow
                        title="网址"
                        labelFor="app-url-input"
                        className="settings-row--vertical"
                        message={urlMessage}
                        messageId="app-url-message"
                        invalid={Boolean(urlValidationError)}
                    >
                        <Input
                            id="app-url-input"
                            required
                            type="text"
                            placeholder="https://example.com"
                            value={appUrl}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            onBlur={handleUrlBlur}
                            autoFocus={!editingApp}
                            aria-invalid={Boolean(urlValidationError) ||
                                undefined}
                            aria-describedby="app-url-message"
                        />
                    </SettingsRow>
                    <SettingsRow title="应用名称" labelFor="app-name-input">
                        <Input
                            id="app-name-input"
                            placeholder="默认使用域名"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                        />
                    </SettingsRow>
                    <SettingsRow title="文件夹" labelFor="app-group-select">
                        <NativeSelect
                            id="app-group-select"
                            value={appGroupId}
                            onChange={(e) => setAppGroupId(e.target.value)}
                        >
                            <NativeSelectOption value="">
                                未放入文件夹
                            </NativeSelectOption>
                            {groups.map((g) => (
                                <NativeSelectOption key={g.id} value={g.id}>
                                    {g.name}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </SettingsRow>
                    {!editingApp && (
                        <SettingsRow
                            title="固定到首页"
                            description={appGroupId
                                ? "文件夹成员随文件夹显示，固定状态由文件夹决定"
                                : "只影响首页呈现，应用始终保留在应用面板"}
                        >
                            <Switch
                                id="app-home-fixed"
                                aria-label="固定到首页"
                                checked={appGroupId ? false : appHomeFixed}
                                disabled={Boolean(appGroupId)}
                                onCheckedChange={setAppHomeFixed}
                            />
                        </SettingsRow>
                    )}
                </SettingsGroup>

                <SettingsGroup title="打开设置" headingLevel={3}>
                    <SettingsRow
                        title="打开方式"
                        description={appOpenMode === "global"
                            ? `当前全局：${
                                appearance.target === "new_tab"
                                    ? "新标签页"
                                    : "当前标签页"
                            }`
                            : undefined}
                    >
                        <RadioGroup
                            variant="segmented"
                            aria-label="打开方式"
                            value={appOpenMode}
                            onValueChange={(val) =>
                                setAppOpenMode(
                                    val as "global" | "current" | "new_tab",
                                )}
                        >
                            <RadioGroupItem value="global">
                                跟随全局
                            </RadioGroupItem>
                            <RadioGroupItem value="new_tab">
                                新标签页
                            </RadioGroupItem>
                            <RadioGroupItem value="current">
                                当前标签页
                            </RadioGroupItem>
                        </RadioGroup>
                    </SettingsRow>
                </SettingsGroup>

                <SettingsGroup title="图标" headingLevel={3}>
                    <SettingsRow
                        title="当前图标"
                        description={
                            <>
                                <span>{sourceLabel}</span>
                                {" · "}
                                <span title={previewName || previewDomain}>
                                    {iconPreviewUrl
                                        ? (previewName || previewDomain)
                                        : "使用首字母"}
                                </span>
                            </>
                        }
                        message={iconError
                            ? <span role="alert">{iconError}</span>
                            : undefined}
                        invalid={Boolean(iconError)}
                    >
                        {iconPreviewUrl && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setAppIconAssetId(null);
                                    setAppIconSource("default");
                                    setIconPreviewUrl(null);
                                    setImageLoadError(false);
                                }}
                            >
                                重置
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={iconExpanded}
                            onClick={() => setIconExpanded(!iconExpanded)}
                        >
                            {iconExpanded ? "收起图标设置" : "更换图标"}
                        </Button>
                        <WebAppGlyph
                            className="app-dialog-preview-icon"
                            app={{
                                name: previewName,
                                url: `https://${previewDomain}`,
                                iconUrl: iconPreviewUrl,
                            }}
                        />
                    </SettingsRow>
                    {iconExpanded && (
                        <SettingsRow title="图标来源">
                            <RadioGroup
                                variant="segmented"
                                aria-label="图标来源"
                                value={iconTab}
                                onValueChange={(val) =>
                                    setIconTab(
                                        val as "auto" | "upload" | "url" | "ai",
                                    )}
                            >
                                <RadioGroupItem value="auto">
                                    自动获取
                                </RadioGroupItem>
                                <RadioGroupItem value="upload">
                                    上传图片
                                </RadioGroupItem>
                                <RadioGroupItem value="url">
                                    网络图片
                                </RadioGroupItem>
                                <RadioGroupItem value="ai">
                                    AI 生成
                                </RadioGroupItem>
                            </RadioGroup>
                        </SettingsRow>
                    )}
                    {iconExpanded && iconTab === "auto" && (
                        <SettingsRow
                            title="网站图标"
                            description="从网址的网站抓取图标"
                        >
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={urlFetchStatus === "loading" ||
                                    !appUrl.trim()}
                                onClick={() => void handleRetryFetch()}
                            >
                                {urlFetchStatus === "loading"
                                    ? (
                                        <Loader2
                                            size="1em"
                                            className="icon-sm animate-spin"
                                        />
                                    )
                                    : (
                                        <RefreshCw
                                            size="1em"
                                            className="icon-sm"
                                        />
                                    )}
                                <span>
                                    {urlFetchStatus === "loading"
                                        ? "正在抓取…"
                                        : "重新获取"}
                                </span>
                            </Button>
                        </SettingsRow>
                    )}
                    {iconExpanded && iconTab === "upload" && (
                        <SettingsRow
                            title="图片文件"
                            className="settings-row--vertical"
                        >
                            <label className="app-upload-dropzone">
                                <Upload
                                    size="1em"
                                    className="icon-lg app-upload-icon"
                                />
                                <span className="app-upload-text">
                                    {isUploadingIcon ? "正在上传…" : "上传图片"}
                                </span>
                                <span className="app-upload-hint">
                                    支持
                                    PNG、JPEG、WebP、AVIF、SVG、ICO，文件小于
                                    5MB
                                </span>
                                <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp, image/avif, image/svg+xml, image/x-icon"
                                    className="app-upload-input"
                                    disabled={isUploadingIcon}
                                    onChange={(e) => void handleFileUpload(e)}
                                />
                            </label>
                        </SettingsRow>
                    )}
                    {iconExpanded && iconTab === "url" && (
                        <SettingsRow
                            title="图片网址"
                            labelFor="app-icon-url-input"
                            className="settings-row--vertical"
                        >
                            <div className="app-input-with-button">
                                <Input
                                    id="app-icon-url-input"
                                    type="url"
                                    placeholder="https://example.com/icon.png"
                                    value={iconImageUrl}
                                    onChange={(e) =>
                                        setIconImageUrl(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!iconImageUrl.trim() ||
                                        isFetchingUrlIcon}
                                    onClick={() => void handleUseImageUrl()}
                                >
                                    {isFetchingUrlIcon ? "提取中…" : "使用图片"}
                                </Button>
                            </div>
                        </SettingsRow>
                    )}
                    {iconExpanded && iconTab === "ai" && (
                        <LogoCandidatePicker session={logo} />
                    )}
                </SettingsGroup>
            </div>

            <div className="app-dialog-footer">
                <Button
                    variant="outline"
                    type="button"
                    disabled={isSubmitting}
                    onClick={onClose}
                >
                    取消
                </Button>
                <Button
                    variant="default"
                    type="submit"
                    disabled={isSubmitting || !appUrl.trim()}
                >
                    {isSubmitting
                        ? "保存中…"
                        : editingApp
                        ? "保存修改"
                        : "添加应用"}
                </Button>
            </div>
        </form>
    );

    return (
        <div className="app-panel-form-container">
            {formJsx}
            <AlertDialog
                open={confirmDialog !== null}
                onOpenChange={(open) => {
                    if (!open && !isSubmitting) {
                        handleCancelConfirm();
                    }
                }}
            >
                <AlertDialogContent>
                    {activeConfirmType === "duplicate"
                        ? (
                            <>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        该应用已存在，仍要继续添加吗？
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        启动器中已存在相同网址的应用。重复添加可用于设置不同的名称、图标或分组。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel
                                        disabled={isSubmitting}
                                        onClick={handleCancelConfirm}
                                    >
                                        取消
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        variant="default"
                                        disabled={isSubmitting}
                                        onClick={handleConfirmDuplicate}
                                    >
                                        {isSubmitting
                                            ? "正在添加…"
                                            : "继续添加"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </>
                        )
                        : (
                            <>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        网址已改变，是否重新获取网站图标？
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        检测到网址已变更。确认后将自动重新获取新网址的网站图标并保存；取消将保留原表单且不保存。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel
                                        disabled={isSubmitting}
                                        onClick={handleCancelConfirm}
                                    >
                                        取消
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        variant="default"
                                        disabled={isSubmitting}
                                        onClick={handleConfirmIconUpdate}
                                    >
                                        {isSubmitting
                                            ? "正在更新…"
                                            : "重新获取并保存"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </>
                        )}
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
