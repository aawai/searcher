import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileCheck,
    RotateCcw,
    Upload,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import {
    AlertDialog,
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

interface BackupManifest {
    version: "1.0.0";
    createdAt: number;
    appName: "Searcher";
    counts: {
        users: number;
        webapps: number;
        notes: number;
        auditLogs: number;
        aiProviders: number;
        aiModels: number;
    };
    assets: {
        wallpapersCount: number;
        iconsCount: number;
    };
}

interface FilePickerProps {
    id: string;
    label: string;
    accept: string;
    buttonText: string;
    onFileSelect: (file: File) => void;
    disabled?: boolean;
    icon?: ReactNode;
    selectedFileName?: string;
    placeholder?: string;
}

function FilePicker({
    id,
    label,
    accept,
    buttonText,
    onFileSelect,
    disabled = false,
    icon,
    selectedFileName,
    placeholder,
}: FilePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const fileNameId = `${id}-filename`;

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
            <label htmlFor={id} className="sr-only">{label}</label>
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
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={handleButtonClick}
                aria-describedby={selectedFileName ? fileNameId : undefined}
            >
                {icon}
                <span>{buttonText}</span>
            </Button>
            {selectedFileName
                ? (
                    <span
                        id={fileNameId}
                        className="admin-file-name"
                        title={selectedFileName}
                    >
                        {selectedFileName}
                    </span>
                )
                : placeholder
                ? <span className="admin-file-placeholder">{placeholder}</span>
                : null}
        </div>
    );
}

export function AdminBackupRestore() {
    const restoreTriggerRef = useRef<HTMLButtonElement>(null);

    const [configImporting, setConfigImporting] = useState(false);
    const [configSuccess, setConfigSuccess] = useState("");
    const [configError, setConfigError] = useState("");
    const [selectedConfigFileName, setSelectedConfigFileName] = useState("");

    const [backupExporting, setBackupExporting] = useState(false);
    const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
    const [validating, setValidating] = useState(false);
    const [validatedManifest, setValidatedManifest] = useState<
        BackupManifest | null
    >(null);
    const [validationError, setValidationError] = useState("");

    const [restoring, setRestoring] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [restoreSuccess, setRestoreSuccess] = useState("");
    const [restoreError, setRestoreError] = useState("");

    function handleExportConfig() {
        globalThis.open("/api/admin/system/config/export", "_blank");
    }

    async function handleConfigFileChange(file: File) {
        setSelectedConfigFileName(file.name);
        setConfigImporting(true);
        setConfigError("");
        setConfigSuccess("");
        try {
            const text = await file.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                throw new Error("无法解析 JSON 文件，格式不正确");
            }
            const res = await api<{
                importedProvidersCount: number;
                createdProvidersCount?: number;
                updatedProvidersCount?: number;
                importedModelsCount?: number;
            }>("/api/admin/system/config/import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(parsed),
            });
            const created = res.createdProvidersCount ?? 0;
            const updated = res.updatedProvidersCount ??
                res.importedProvidersCount;
            const models = res.importedModelsCount ?? 0;
            const parts = ["系统设置已同步"];
            if (created > 0 || updated > 0) {
                parts.push(`AI 提供商新建 ${created} 个、更新 ${updated} 个`);
            }
            if (models > 0) parts.push(`模型配置同步 ${models} 个`);
            const keyWarning = created > 0
                ? "。新提供商默认禁用，需在 AI 设置中配置 API Key 后启用"
                : "";
            setConfigSuccess(`配置已导入：${parts.join("，")}${keyWarning}。`);
        } catch (err) {
            setConfigError(errorMessage(err));
        } finally {
            setConfigImporting(false);
        }
    }

    function handleExportFullBackup() {
        setBackupExporting(true);
        globalThis.open("/api/admin/backup/export", "_blank");
        setTimeout(() => setBackupExporting(false), 2000);
    }

    function handleZipFileChange(file: File) {
        setSelectedZipFile(file);
        setValidatedManifest(null);
        setValidationError("");
        setRestoreSuccess("");
        setRestoreError("");
    }

    async function handlePreValidate() {
        if (!selectedZipFile) return;
        setValidating(true);
        setValidationError("");
        setValidatedManifest(null);
        try {
            const formData = new FormData();
            formData.append("backup", selectedZipFile);
            const res = await api<{ valid: boolean; manifest: BackupManifest }>(
                "/api/admin/backup/validate",
                { method: "POST", body: formData },
            );
            if (res.valid && res.manifest) {
                setValidatedManifest(res.manifest);
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
        try {
            const formData = new FormData();
            formData.append("backup", selectedZipFile);
            await api<{
                manifest: BackupManifest;
                snapshotCreated: boolean;
                snapshotPath: string;
            }>("/api/admin/backup/restore", { method: "POST", body: formData });
            setRestoreSuccess(
                "已还原，恢复前快照已保存。重新加载页面后生效；若被登出，需重新登录。",
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
        <div className="admin-panel">
            {configError && (
                <StatusBanner tone="error" density="compact">
                    <span className="admin-banner-message">
                        <AlertCircle size="1em" />
                        <span>{configError}</span>
                    </span>
                </StatusBanner>
            )}
            {configSuccess && (
                <StatusBanner tone="success" density="compact">
                    <span className="admin-banner-message">
                        <CheckCircle2 size="1em" />
                        <span>{configSuccess}</span>
                    </span>
                </StatusBanner>
            )}

            <SettingsGroup
                title="系统配置"
                footer="仅含系统设置与 AI 提供商，不含用户数据和 API Key。"
            >
                <SettingsRow title="导出配置">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleExportConfig}
                    >
                        <Download size="1em" />
                        <span>导出 JSON</span>
                    </Button>
                </SettingsRow>
                <SettingsRow title="导入配置">
                    <FilePicker
                        id="config-import-file"
                        label="选择配置 JSON 文件"
                        accept=".json,application/json"
                        buttonText={configImporting ? "正在导入…" : "导入 JSON"}
                        icon={<Upload size="1em" />}
                        disabled={configImporting}
                        selectedFileName={selectedConfigFileName}
                        onFileSelect={handleConfigFileChange}
                    />
                </SettingsRow>
            </SettingsGroup>

            {validationError && (
                <StatusBanner tone="error" density="compact">
                    <span className="admin-banner-message">
                        <AlertCircle size="1em" />
                        <span>预检失败：{validationError}</span>
                    </span>
                </StatusBanner>
            )}
            {restoreError && (
                <StatusBanner tone="error" density="compact">
                    <span className="admin-banner-message">
                        <AlertCircle size="1em" />
                        <span>{restoreError}</span>
                    </span>
                </StatusBanner>
            )}
            {restoreSuccess && (
                <StatusBanner tone="success" density="compact">
                    <div className="admin-banner-row">
                        <span className="admin-banner-message">
                            <CheckCircle2 size="1em" />
                            <span>{restoreSuccess}</span>
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => globalThis.location.reload()}
                        >
                            重新加载页面
                        </Button>
                    </div>
                </StatusBanner>
            )}

            <SettingsGroup
                title="完整备份"
                footer="还原前会先保存当前数据快照，失败时尝试回滚。"
            >
                <SettingsRow title="创建备份">
                    <Button
                        type="button"
                        variant="default"
                        onClick={handleExportFullBackup}
                        disabled={backupExporting}
                    >
                        <Download size="1em" />
                        <span>
                            {backupExporting
                                ? "正在生成备份…"
                                : "下载备份 (ZIP)"}
                        </span>
                    </Button>
                </SettingsRow>
                <SettingsRow title="备份文件">
                    <div className="admin-file-row">
                        <FilePicker
                            id="backup-restore-file"
                            label="选择备份 ZIP 文件"
                            accept=".zip,application/zip"
                            buttonText="选择 ZIP 文件"
                            selectedFileName={selectedZipFile?.name}
                            placeholder="未选择文件"
                            onFileSelect={handleZipFileChange}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePreValidate}
                            disabled={!selectedZipFile || validating}
                        >
                            <FileCheck size="1em" />
                            <span>{validating ? "正在验证…" : "预检验证"}</span>
                        </Button>
                    </div>
                </SettingsRow>
            </SettingsGroup>

            {validatedManifest && (
                <>
                    <StatusBanner tone="success" density="compact">
                        <span className="admin-banner-message">
                            <CheckCircle2 size="1em" />
                            <span>
                                备份文件校验通过，数据库完整性与外键检查正常。
                            </span>
                        </span>
                    </StatusBanner>
                    <SettingsGroup title="备份内容">
                        <SettingsRow title="生成时间">
                            <span className="admin-value">
                                {new Date(validatedManifest.createdAt)
                                    .toLocaleString("zh-CN")}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="用户">
                            <span className="admin-value">
                                {validatedManifest.counts.users}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="应用">
                            <span className="admin-value">
                                {validatedManifest.counts.webapps}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="便签">
                            <span className="admin-value">
                                {validatedManifest.counts.notes}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="AI 提供商 / 模型">
                            <span className="admin-value">
                                {validatedManifest.counts.aiProviders} /{" "}
                                {validatedManifest.counts.aiModels}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="壁纸 / 图标">
                            <span className="admin-value">
                                {validatedManifest.assets.wallpapersCount} /
                                {" "}
                                {validatedManifest.assets.iconsCount}
                            </span>
                        </SettingsRow>
                        <SettingsRow title="还原备份">
                            <Button
                                ref={restoreTriggerRef}
                                type="button"
                                variant="destructive"
                                disabled={restoring}
                                onClick={() => setRestoreModalOpen(true)}
                            >
                                <RotateCcw size="1em" />
                                <span>还原此备份…</span>
                            </Button>
                        </SettingsRow>
                    </SettingsGroup>
                </>
            )}

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
                                ?.name}」覆盖当前的数据库、系统设置、图标和壁纸。还原前会保存当前数据快照，失败时尝试回滚。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restoring}>
                            取消
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={restoring}
                            onClick={handleExecuteRestore}
                        >
                            {restoring ? "正在还原…" : "确认还原"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
