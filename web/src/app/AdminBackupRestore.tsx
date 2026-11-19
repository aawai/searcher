import {
    type ChangeEvent,
    type ReactNode,
    type Ref,
    useRef,
    useState,
} from "react";
import { Download, FileCheck, RotateCcw, Upload } from "lucide-react";
import type { ConfigImportPreviewDto } from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
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
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import "./admin.css";
import { AdminPanelHeader } from "./AdminShell.tsx";

interface BackupManifest {
    version: "1.0.0";
    createdAt: number;
    appName: "Searcher";
    counts: {
        users: number;
        webapps: number;
        documents: number;
        auditLogs: number;
        aiProviders: number;
        aiModels: number;
    };
    assets: {
        wallpapersCount: number;
        iconsCount: number;
    };
}

interface ConfigImportResult {
    createdProvidersCount: number;
    updatedProvidersCount: number;
    importedModelsCount: number;
}

interface PendingConfigImport {
    fileName: string;
    config: unknown;
    preview: ConfigImportPreviewDto;
}

/** Names everything the import changes, for the confirmation. */
function describeConfigImport(preview: ConfigImportPreviewDto): string {
    const changes: string[] = [];
    if (preview.changedSettingsCount > 0) {
        changes.push(`覆盖 ${preview.changedSettingsCount} 项系统设置`);
    }
    const providersTouched = preview.createdProvidersCount > 0 ||
        preview.updatedProvidersCount > 0;
    if (providersTouched) {
        const counts = [
            preview.createdProvidersCount > 0
                ? `新建 ${preview.createdProvidersCount} 个`
                : "",
            preview.updatedProvidersCount > 0
                ? `更新 ${preview.updatedProvidersCount} 个`
                : "",
        ].filter(Boolean);
        changes.push(`${counts.join("、")} AI 服务商`);
    }
    if (preview.importedModelsCount > 0) {
        changes.push(`同步 ${preview.importedModelsCount} 个模型`);
    }
    const sentences = [
        changes.length > 0
            ? `将${changes.join("，")}。`
            : "文件与当前配置一致，导入不会改变任何设置。",
    ];
    if (preview.skippedProvidersCount > 0) {
        sentences.push(
            `同名的个人服务商 ${preview.skippedProvidersCount} 个保持不变。`,
        );
    }
    if (providersTouched) sentences.push("文件中未列出的服务商保持不变。");
    return sentences.join("");
}

function FilePicker({
    id,
    accept,
    buttonText,
    onFileSelect,
    disabled = false,
    icon,
    selectedFileName,
    placeholder,
    describedBy,
    buttonRef,
}: {
    id: string;
    accept: string;
    buttonText: string;
    onFileSelect: (file: File) => void;
    disabled?: boolean;
    icon?: ReactNode;
    selectedFileName?: string;
    placeholder?: string;
    describedBy?: string;
    buttonRef?: Ref<HTMLButtonElement>;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const fileNameId = `${id}-filename`;
    const descriptions = [selectedFileName ? fileNameId : null, describedBy]
        .filter(Boolean).join(" ");

    function handleButtonClick() {
        if (inputRef.current) {
            // 先清空，才能重复选择同一个文件
            inputRef.current.value = "";
            inputRef.current.click();
        }
    }

    function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
        e.target.value = "";
    }

    return (
        <div className="admin-file-row">
            {/* The visible button is the control; the native input only opens the picker. */}
            <input
                ref={inputRef}
                id={id}
                type="file"
                accept={accept}
                onChange={handleInputChange}
                disabled={disabled}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
            />
            <Button
                ref={buttonRef}
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={handleButtonClick}
                aria-describedby={descriptions || undefined}
            >
                {icon}
                <span>{buttonText}</span>
            </Button>
            {selectedFileName
                ? (
                    <span id={fileNameId} className="admin-file-name">
                        {selectedFileName}
                    </span>
                )
                : placeholder
                ? <span className="admin-file-name">{placeholder}</span>
                : null}
        </div>
    );
}

export function AdminBackupRestore() {
    const configTriggerRef = useRef<HTMLButtonElement>(null);
    const restoreTriggerRef = useRef<HTMLButtonElement>(null);

    const [configBusy, setConfigBusy] = useState(false);
    const [configSuccess, setConfigSuccess] = useState("");
    const [configError, setConfigError] = useState("");
    const [configFileName, setConfigFileName] = useState("");
    const [pendingImport, setPendingImport] = useState<
        PendingConfigImport | null
    >(null);

    const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
    const [validating, setValidating] = useState(false);
    const [validatedManifest, setValidatedManifest] = useState<
        BackupManifest | null
    >(null);
    const [validationError, setValidationError] = useState("");
    const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

    const [restoring, setRestoring] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [restoreSuccess, setRestoreSuccess] = useState("");
    const [restoreError, setRestoreError] = useState("");
    const [restoreWarnings, setRestoreWarnings] = useState<string[]>([]);

    async function handleConfigFileChange(file: File) {
        setConfigFileName(file.name);
        setConfigError("");
        setConfigSuccess("");
        setConfigBusy(true);
        try {
            let config: unknown;
            try {
                config = JSON.parse(await file.text());
            } catch {
                throw new Error("无法解析 JSON 文件，格式不正确");
            }
            const preview = await api<ConfigImportPreviewDto>(
                "/api/admin/system/config/preview",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(config),
                },
            );
            setPendingImport({ fileName: file.name, config, preview });
        } catch (err) {
            setConfigError(errorMessage(err));
        } finally {
            setConfigBusy(false);
        }
    }

    async function handleConfirmImport() {
        if (!pendingImport) return;
        setConfigBusy(true);
        try {
            const res = await api<ConfigImportResult>(
                "/api/admin/system/config/import",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(pendingImport.config),
                },
            );
            const keyNote = res.createdProvidersCount > 0
                ? "新服务商默认禁用，在 AI 设置中配置 API Key 后启用。"
                : "";
            setConfigSuccess(`已导入「${pendingImport.fileName}」。${keyNote}`);
            setPendingImport(null);
        } catch (err) {
            setConfigError(errorMessage(err));
            setPendingImport(null);
        } finally {
            setConfigBusy(false);
        }
    }

    function handleZipFileChange(file: File) {
        setSelectedZipFile(file);
        setValidatedManifest(null);
        setValidationError("");
        setValidationWarnings([]);
        setRestoreSuccess("");
        setRestoreError("");
        setRestoreWarnings([]);
    }

    async function handlePreValidate() {
        if (!selectedZipFile) return;
        setValidating(true);
        setValidationError("");
        setValidatedManifest(null);
        setValidationWarnings([]);
        try {
            const formData = new FormData();
            formData.append("backup", selectedZipFile);
            const res = await api<{
                valid: boolean;
                manifest: BackupManifest;
                warnings: string[];
            }>(
                "/api/admin/backup/validate",
                { method: "POST", body: formData },
            );
            if (res.valid && res.manifest) {
                setValidatedManifest(res.manifest);
                setValidationWarnings(res.warnings);
            } else {
                setValidationError("备份文件校验未通过");
            }
        } catch (err) {
            setValidationError(errorMessage(err));
        } finally {
            setValidating(false);
        }
    }

    async function handleExecuteRestore() {
        if (!selectedZipFile) return;
        setRestoring(true);
        setRestoreError("");
        setRestoreSuccess("");
        setRestoreWarnings([]);
        try {
            const formData = new FormData();
            formData.append("backup", selectedZipFile);
            const restored = await api<{
                manifest: BackupManifest;
                snapshotCreated: boolean;
                snapshotPath: string;
                warnings: string[];
            }>("/api/admin/backup/restore", { method: "POST", body: formData });
            setRestoreWarnings(restored.warnings);
            setRestoreSuccess(
                "备份已还原，还原前快照已保存。重新加载页面后生效；若被登出，需重新登录。",
            );
            setRestoreModalOpen(false);
        } catch (err) {
            setRestoreError(`还原失败：${errorMessage(err)}`);
            setRestoreModalOpen(false);
        } finally {
            setRestoring(false);
        }
    }

    return (
        <div className="semantic-section" data-content="grouped">
            <AdminPanelHeader title="备份" />
            {configSuccess && (
                <StatusBanner tone="success" density="compact">
                    {configSuccess}
                </StatusBanner>
            )}
            <SettingsGroup
                title="系统配置"
                headingLevel={3}
                footer="仅含系统设置与 AI 服务商，不含用户数据和 API Key。"
            >
                <SettingsRow title="导出配置">
                    <Button
                        variant="outline"
                        render={
                            <a
                                href="/api/admin/system/config/export"
                                download
                            />
                        }
                    >
                        <Download size="1em" />
                        <span>导出 JSON</span>
                    </Button>
                </SettingsRow>
                <SettingsRow
                    title="导入配置"
                    description={configFileName || undefined}
                    message={configError
                        ? <span role="alert">{configError}</span>
                        : undefined}
                    messageId="config-import-error"
                    invalid={Boolean(configError)}
                >
                    <FilePicker
                        id="config-import-file"
                        accept=".json,application/json"
                        buttonText={configBusy ? "正在读取…" : "导入 JSON"}
                        icon={<Upload size="1em" />}
                        disabled={configBusy}
                        describedBy={configError
                            ? "config-import-error"
                            : undefined}
                        buttonRef={configTriggerRef}
                        onFileSelect={handleConfigFileChange}
                    />
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="完整备份" headingLevel={3}>
                <SettingsRow title="创建备份">
                    <Button
                        variant="outline"
                        render={<a href="/api/admin/backup/export" download />}
                    >
                        <Download size="1em" />
                        <span>下载备份（ZIP）</span>
                    </Button>
                </SettingsRow>
                <SettingsRow
                    title="备份文件"
                    description={selectedZipFile?.name}
                    message={validationError
                        ? (
                            <span role="alert">
                                预检失败：{validationError}
                            </span>
                        )
                        : undefined}
                    messageId="backup-validate-error"
                    invalid={Boolean(validationError)}
                >
                    <div className="admin-file-row">
                        {selectedZipFile && (
                            <Button type="button" variant="outline" disabled={validating || restoring}
                                onClick={() => {
                                    setSelectedZipFile(null);
                                    setValidatedManifest(null);
                                    setValidationError("");
                                    setValidationWarnings([]);
                                    setRestoreError("");
                                    setRestoreSuccess("");
                                    setRestoreWarnings([]);
                                }}>
                                清除文件
                            </Button>
                        )}
                        <FilePicker
                            id="backup-restore-file"
                            accept=".zip,application/zip"
                            buttonText={selectedZipFile ? "重新选择" : "选择 ZIP 文件"}
                            disabled={validating || restoring}
                            onFileSelect={handleZipFileChange}
                        />
                        {selectedZipFile && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePreValidate}
                                disabled={validating}
                                aria-describedby={validationError
                                    ? "backup-validate-error"
                                    : undefined}
                            >
                                <FileCheck size="1em" />
                                <span>{validating ? "正在验证…" : "预检备份"}</span>
                            </Button>
                        )}
                    </div>
                </SettingsRow>
                {validatedManifest && (
                    <>
                        <SettingsRow title="预检结果" className="settings-row--vertical">
                            <StatusBanner tone="success" density="compact">
                                备份文件校验通过，数据库完整性与外键检查正常。
                            </StatusBanner>
                            {validationWarnings.length > 0 && (
                                <StatusBanner tone="warning" density="compact">
                                    {validationWarnings.join(" ")}
                                </StatusBanner>
                            )}
                        </SettingsRow>
                        <SettingsRow title="生成时间">
                            {new Date(validatedManifest.createdAt).toLocaleString("zh-CN")}
                        </SettingsRow>
                        <SettingsRow title="用户">{validatedManifest.counts.users}</SettingsRow>
                        <SettingsRow title="应用 / 笔记">
                            {validatedManifest.counts.webapps} / {validatedManifest.counts.documents}
                        </SettingsRow>
                        <SettingsRow title="AI 服务商 / 模型">
                            {validatedManifest.counts.aiProviders} / {validatedManifest.counts.aiModels}
                        </SettingsRow>
                        <SettingsRow title="壁纸 / 图标">
                            {validatedManifest.assets.wallpapersCount} / {validatedManifest.assets.iconsCount}
                        </SettingsRow>
                        <SettingsRow title="还原备份" className="settings-row--vertical"
                            description="还原前会先保存当前数据快照，失败时尝试回滚。">
                            {restoreError && <StatusBanner tone="error" density="compact">{restoreError}</StatusBanner>}
                            {restoreSuccess && <StatusBanner tone="success" density="compact">{restoreSuccess}</StatusBanner>}
                            {restoreWarnings.length > 0 && <StatusBanner tone="warning" density="compact">{restoreWarnings.join(" ")}</StatusBanner>}
                            <Button ref={restoreTriggerRef} type="button" variant="destructive"
                                disabled={restoring} onClick={() => setRestoreModalOpen(true)}>
                                <RotateCcw size="1em" />
                                <span>还原此备份…</span>
                            </Button>
                            {restoreSuccess && <Button type="button" variant="outline" onClick={() => globalThis.location.reload()}>重新加载页面</Button>}
                        </SettingsRow>
                    </>
                )}
            </SettingsGroup>

            <AlertDialog
                open={pendingImport !== null}
                onOpenChange={(open) => {
                    if (!configBusy && !open) {
                        setPendingImport(null);
                        setConfigFileName("");
                    }
                }}
            >
                <AlertDialogContent finalFocus={configTriggerRef}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            导入「{pendingImport?.fileName}」？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingImport &&
                                describeConfigImport(pendingImport.preview)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={configBusy}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            type="button"
                            variant="default"
                            disabled={configBusy}
                            onClick={handleConfirmImport}
                        >
                            {configBusy ? "正在导入…" : "导入"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={restoreModalOpen}
                onOpenChange={(open) => {
                    if (!restoring) setRestoreModalOpen(open);
                }}
            >
                <AlertDialogContent finalFocus={restoreTriggerRef}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>还原此备份？</AlertDialogTitle>
                        <AlertDialogDescription>
                            将用「{selectedZipFile
                                ?.name}」覆盖当前的数据库、系统设置、图标和壁纸。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restoring}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            type="button"
                            disabled={restoring}
                            onClick={handleExecuteRestore}
                        >
                            {restoring ? "正在还原…" : "还原备份"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
