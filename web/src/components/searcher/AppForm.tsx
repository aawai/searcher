import { useAppSessionContext } from "./AppSessionProvider.tsx";
import { Check, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "../ui/native-select.tsx";
import { Switch } from "../ui/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import { LogoCandidatePicker } from "./LogoCandidatePicker.tsx";
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
        appOpenMode,
        appIsPinned,
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
        setAppOpenMode,
        setAppIsPinned,
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
    const formJsx = (
        <form onSubmit={handleSubmit} className="app-dialog-form">
            <div className="app-dialog-body">
                {formError && (
                    <p
                        role="alert"
                        className="error"
                        style={{ margin: 0 }}
                    >
                        {formError}
                    </p>
                )}

                {/* 1. 基础信息 (首要) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">基础信息</h3>

                    {/* 网址输入与状态 */}
                    <div className="app-dialog-field">
                        <label
                            htmlFor="app-url-input"
                            className="app-dialog-field-label"
                        >
                            <span>
                                网址
                            </span>
                        </label>
                        <Input
                            id="app-url-input"
                            required
                            type="text"
                            placeholder="https://example.com"
                            value={appUrl}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            onBlur={handleUrlBlur}
                            autoFocus={!editingApp}
                            className="w-full"
                        />
                        {urlValidationError && (
                            <p className="error" role="alert">
                                {urlValidationError}
                            </p>
                        )}
                        {/* URL 状态反馈 */}
                        {urlFetchStatus === "loading" && (
                            <div className="app-dialog-url-status loading">
                                <Loader2
                                    size="1em"
                                    className="icon-sm animate-spin"
                                />
                                <span>{urlFetchMessage}</span>
                            </div>
                        )}
                        {urlFetchStatus === "success" && (
                            <div className="app-dialog-url-status success">
                                <Check size="1em" className="icon-sm" />
                                <span>{urlFetchMessage}</span>
                            </div>
                        )}
                        {urlFetchStatus === "error" && (
                            <div className="app-dialog-url-status error">
                                <span>{urlFetchMessage}</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRetryFetch}
                                >
                                    重新获取
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* 网站名称与文件夹：桌面双列，移动端单列 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="app-dialog-field">
                            <label
                                htmlFor="app-name-input"
                                className="app-dialog-field-label"
                            >
                                应用名称
                            </label>
                            <Input
                                id="app-name-input"
                                placeholder="默认使用域名"
                                value={appName}
                                onChange={(e) => setAppName(e.target.value)}
                                className="w-full"
                            />
                        </div>

                        <div className="app-dialog-field">
                            <label
                                htmlFor="app-group-select"
                                className="app-dialog-field-label"
                            >
                                文件夹
                            </label>
                            <NativeSelect
                                id="app-group-select"
                                value={appGroupId}
                                onChange={(e) => setAppGroupId(e.target.value)}
                                className="w-full"
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
                        </div>
                    </div>
                </section>

                {/* 2. 打开设置 (清晰紧凑) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">打开设置</h3>
                    <div className="app-dialog-options-card">
                        {/* 固定在搜索首页 */}
                        <div className="app-dialog-option-row">
                            <div className="flex flex-col gap-0.5">
                                <label
                                    htmlFor="app-pin-switch"
                                    className="app-dialog-option-title cursor-pointer"
                                >
                                    固定到首页
                                </label>
                            </div>
                            <Switch
                                id="app-pin-switch"
                                checked={appIsPinned}
                                onCheckedChange={setAppIsPinned}
                                aria-label="固定到首页"
                            />
                        </div>

                        <div className="app-dialog-option-divider" />

                        {/* 打开方式 */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="app-dialog-option-title">
                                    打开方式
                                </span>
                                {appOpenMode === "global" && (
                                    <span className="app-dialog-option-desc">
                                        当前全局：{appearance.target ===
                                                "new_tab"
                                            ? "新标签页"
                                            : "当前标签页"}
                                    </span>
                                )}
                            </div>
                            <Tabs
                                value={appOpenMode}
                                onValueChange={(val) =>
                                    setAppOpenMode(
                                        val as "global" | "current" | "new_tab",
                                    )}
                                className="w-full"
                            >
                                <TabsList className="w-full">
                                    <TabsTrigger value="global">
                                        跟随全局
                                    </TabsTrigger>
                                    <TabsTrigger value="new_tab">
                                        新标签页
                                    </TabsTrigger>
                                    <TabsTrigger value="current">
                                        当前标签页
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                </section>

                {/* 3. 图标设置 (实时预览 + 4种来源选项卡) */}
                <section className="app-dialog-section">
                    <h3 className="app-dialog-section-title">图标</h3>

                    <div className="app-dialog-icon-card">
                        {/* 实时图标预览栏 */}
                        <div className="app-dialog-preview-bar">
                            <WebAppGlyph
                                className="app-dialog-preview-icon"
                                app={{
                                    name: previewName,
                                    url: `https://${previewDomain}`,
                                    iconUrl: iconPreviewUrl,
                                }}
                            />
                            <div className="app-dialog-preview-meta">
                                <div className="flex items-center gap-1.5">
                                    <span className="app-dialog-preview-meta-title">
                                        当前图标
                                    </span>
                                    <span className="app-dialog-source-badge">
                                        {appIconSource === "website"
                                            ? "自动获取"
                                            : appIconSource === "upload"
                                            ? "本地上传"
                                            : appIconSource === "url"
                                            ? "网络图片"
                                            : appIconSource === "ai"
                                            ? "AI 生成"
                                            : "首字母"}
                                    </span>
                                </div>
                                <span
                                    className="app-dialog-preview-meta-desc"
                                    title={previewName || previewDomain}
                                >
                                    {iconPreviewUrl
                                        ? (previewName || previewDomain)
                                        : "使用首字母"}
                                </span>
                            </div>
                            {iconPreviewUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="app-dialog-preview-reset-btn"
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
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={iconExpanded}
                            onClick={() => setIconExpanded(!iconExpanded)}
                        >
                            {iconExpanded ? "收起图标设置" : "更换图标"}
                        </Button>
                        {iconError && (
                            <p role="alert" className="error">{iconError}</p>
                        )}
                        <div hidden={!iconExpanded}>
                            {/* 图标来源模式切换 */}
                            <Tabs
                                value={iconTab}
                                onValueChange={(val) =>
                                    setIconTab(
                                        val as "auto" | "upload" | "url" | "ai",
                                    )}
                                className="w-full"
                            >
                                <TabsList className="w-full">
                                    <TabsTrigger value="auto">
                                        自动获取
                                    </TabsTrigger>
                                    <TabsTrigger value="upload">
                                        上传图片
                                    </TabsTrigger>
                                    <TabsTrigger value="url">
                                        网络图片
                                    </TabsTrigger>
                                    <TabsTrigger value="ai">
                                        AI 生成
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {/* 来源子面板 */}
                            <div className="app-dialog-icon-subpanel-wrap">
                                {iconTab === "auto" && (
                                    <div className="app-dialog-icon-subpanel app-dialog-icon-subpanel--auto">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={urlFetchStatus ===
                                                    "loading" || !appUrl.trim()}
                                            onClick={() =>
                                                void handleRetryFetch()}
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
                                    </div>
                                )}

                                {iconTab === "upload" && (
                                    <div className="app-dialog-icon-subpanel">
                                        <label className="app-upload-dropzone">
                                            <Upload
                                                size="1em"
                                                className="icon-lg app-upload-icon"
                                            />
                                            <span className="app-upload-text">
                                                {isUploadingIcon
                                                    ? "正在上传…"
                                                    : "上传图片"}
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
                                                onChange={(e) =>
                                                    void handleFileUpload(e)}
                                            />
                                        </label>
                                    </div>
                                )}

                                {iconTab === "url" && (
                                    <div className="app-dialog-icon-subpanel">
                                        <div className="app-input-with-button">
                                            <Input
                                                type="url"
                                                aria-label="图片网址"
                                                placeholder="https://example.com/icon.png"
                                                value={iconImageUrl}
                                                onChange={(e) =>
                                                    setIconImageUrl(
                                                        e.target.value,
                                                    )}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!iconImageUrl
                                                    .trim() ||
                                                    isFetchingUrlIcon}
                                                onClick={() =>
                                                    void handleUseImageUrl()}
                                                className="flex-shrink-0"
                                            >
                                                {isFetchingUrlIcon
                                                    ? "提取中…"
                                                    : "使用图片"}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {iconTab === "ai" && (
                                    <LogoCandidatePicker session={logo} />
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {/* 底部固定操作栏 */}
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
