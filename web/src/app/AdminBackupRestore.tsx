import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileCheck,
    HardDrive,
    RotateCcw,
    ShieldAlert,
    Upload,
} from "lucide-react";
import { Button, type ButtonProps } from "../components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import {
    Section,
    SectionHeader,
    SettingsCard,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import "./admin.css";

export interface BackupManifest {
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
    buttonVariant?: ButtonProps["variant"];
    icon?: ReactNode;
    selectedFileName?: string | null;
    placeholder?: string;
}

function FilePicker({
    id,
    label,
    accept,
    buttonText,
    onFileSelect,
    disabled = false,
    buttonVariant = "outline",
    icon,
    selectedFileName,
    placeholder,
}: FilePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = () => {
        if (inputRef.current) {
            // Reset input value before file dialog opens to allow selecting the same file again
            inputRef.current.value = "";
            inputRef.current.click();
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        // Reset value after handling to ensure same-file reselection works
        e.target.value = "";
    };

    const fileNameId = `${id}-filename`;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <input
                ref={inputRef}
                id={id}
                type="file"
                accept={accept}
                onChange={handleInputChange}
                onClick={(e) => {
                    (e.target as HTMLInputElement).value = "";
                }}
                disabled={disabled}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
            />
            <Button
                type="button"
                variant={buttonVariant}
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
                        className="text-xs text-muted truncate max-w-xs font-mono"
                        title={selectedFileName}
                    >
                        {selectedFileName}
                    </span>
                )
                : placeholder
                ? (
                    <span className="text-xs text-muted italic">
                        {placeholder}
                    </span>
                )
                : null}
        </div>
    );
}

export function AdminBackupRestore() {
    const restoreTriggerRef = useRef<HTMLButtonElement>(null);

    // Config export/import state
    const [configImporting, setConfigImporting] = useState(false);
    const [configSuccess, setConfigSuccess] = useState("");
    const [configError, setConfigError] = useState("");
    const [selectedConfigFileName, setSelectedConfigFileName] = useState("");

    // Full ZIP backup state
    const [backupExporting, setBackupExporting] = useState(false);
    const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
    const [validating, setValidating] = useState(false);
    const [validatedManifest, setValidatedManifest] = useState<
        BackupManifest | null
    >(null);
    const [validationError, setValidationError] = useState("");

    // Restore execution state
    const [restoring, setRestoring] = useState(false);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [restoreSuccess, setRestoreSuccess] = useState("");
    const [restoreError, setRestoreError] = useState("");

    // 1. Export Config JSON
    const handleExportConfig = () => {
        globalThis.open("/api/admin/system/config/export", "_blank");
    };

    // 2. Import Config JSON
    const handleConfigFileChange = async (file: File) => {
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
                throw new Error("无法解析 JSON 文件，请确认格式正确");
            }

            const res = await api<{
                importedProvidersCount: number;
                createdProvidersCount?: number;
                updatedProvidersCount?: number;
                importedModelsCount?: number;
            }>(
                "/api/admin/system/config/import",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(parsed),
                },
            );

            const created = res.createdProvidersCount ?? 0;
            const updated = res.updatedProvidersCount ??
                res.importedProvidersCount;
            const models = res.importedModelsCount ?? 0;
            const parts: string[] = ["系统设置已同步"];
            if (created > 0 || updated > 0) {
                parts.push(
                    `AI 提供商（新建 ${created} 个，更新 ${updated} 个）`,
                );
            }
            if (models > 0) {
                parts.push(`已同步 ${models} 个模型配置`);
            }
            const keyWarning = created > 0
                ? "。新导入的提供商默认处于禁用状态，必须在 AI 设置中配置 API Key 后方可使用"
                : "";
            setConfigSuccess(
                `配置导入成功！${parts.join("，")}${keyWarning}。`,
            );
        } catch (err) {
            setConfigError(errorMessage(err));
        } finally {
            setConfigImporting(false);
        }
    };

    // 3. Export Full Backup ZIP
    const handleExportFullBackup = () => {
        setBackupExporting(true);
        globalThis.open("/api/admin/backup/export", "_blank");
        setTimeout(() => setBackupExporting(false), 2000);
    };

    // 4. Handle ZIP Selection and Pre-validate
    const handleZipFileChange = (file: File) => {
        setSelectedZipFile(file);
        setValidatedManifest(null);
        setValidationError("");
        setRestoreSuccess("");
        setRestoreError("");
    };

    const handlePreValidate = async () => {
        if (!selectedZipFile) return;
        setValidating(true);
        setValidationError("");
        setValidatedManifest(null);
        try {
            const formData = new FormData();
            formData.append("backup", selectedZipFile);

            const res = await api<{ valid: boolean; manifest: BackupManifest }>(
                "/api/admin/backup/validate",
                {
                    method: "POST",
                    body: formData,
                },
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
    };

    // 5. Execute Full Restore
    const handleExecuteRestore = async () => {
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
            }>(
                "/api/admin/backup/restore",
                {
                    method: "POST",
                    body: formData,
                },
            );

            setRestoreSuccess(
                "系统数据已恢复。恢复前快照已自动保存，失败时可用于回滚。请重新加载页面，如被登出请重新登录。",
            );
            setRestoreModalOpen(false);
        } catch (err) {
            setRestoreError(errorMessage(err));
            setRestoreModalOpen(false);
        } finally {
            setRestoring(false);
        }
    };

    return (
        <div className="semantic-section">
            <SectionHeader
                title="备份与恢复"
                description="配置导入导出、全量 ZIP 打包备份、预验证与安全快照回滚"
                headingLevel={2}
            />

            {/* Security Isolation Banner */}
            <StatusBanner tone="info">
                <div className="flex items-start gap-3">
                    <HardDrive
                        size={20}
                        className="text-accent shrink-0 mt-0.5"
                    />
                    <div className="leading-relaxed">
                        <strong className="text-foreground">
                            密钥隔离与数据安全保障：
                        </strong>
                        <span className="text-muted">
                            系统加密主密钥
                            永不包含在数据库、备份文件或配置导出中。备份 ZIP
                            包含完整 <code>manifest.json</code>、<code>
                                database.sqlite
                            </code>{" "}
                            以及 <code>assets/</code> 资源目录。
                        </span>
                    </div>
                </div>
            </StatusBanner>

            {/* Module 1: Configuration Export / Import */}
            <Section
                title="配置导入导出"
                headingLevel={3}
                description="轻量导出系统设置、AI 提供商元数据及模型可见性（不包含用户私人数据、聊天历史或 API Key 密文）。新导入的 AI 提供商默认处于禁用状态，导入后必须在 AI 设置中手动配置 API Key 并刷新可用模型方可启用。"
            >
                {configError && (
                    <StatusBanner tone="error">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{configError}</span>
                        </div>
                    </StatusBanner>
                )}

                {configSuccess && (
                    <StatusBanner tone="success">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>{configSuccess}</span>
                        </div>
                    </StatusBanner>
                )}

                <SettingsCard>
                    <div className="admin-backup-content admin-backup-content--actions">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleExportConfig}
                        >
                            <Download size={16} />
                            <span>导出系统配置 (JSON)</span>
                        </Button>

                        <FilePicker
                            id="config-file-picker"
                            label="导入系统配置"
                            accept=".json,application/json"
                            buttonText={configImporting
                                ? "正在导入…"
                                : "导入系统配置 (JSON)"}
                            buttonVariant="outline"
                            icon={<Upload size={16} />}
                            disabled={configImporting}
                            selectedFileName={selectedConfigFileName}
                            onFileSelect={handleConfigFileChange}
                        />
                    </div>
                </SettingsCard>
            </Section>

            {/* Module 2: Full ZIP Backup & Safe Restore */}
            <Section
                title="全量 ZIP 备份与恢复"
                headingLevel={3}
                description="先验证备份，再创建当前快照并恢复；失败时自动回滚。"
            >
                <SettingsCard>
                    <div className="admin-backup-content">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="font-medium text-foreground text-sm">
                                安全恢复保障流程
                            </span>
                            <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                                <span>验证备份</span>
                                <span className="text-muted-foreground/40">
                                    →
                                </span>
                                <span>创建当前快照</span>
                                <span className="text-muted-foreground/40">
                                    →
                                </span>
                                <span>执行恢复</span>
                                <span className="text-muted-foreground/40">
                                    →
                                </span>
                                <span>失败自动回滚</span>
                            </div>
                        </div>
                        <details className="text-xs text-muted leading-relaxed cursor-pointer group">
                            <summary className="hover:text-foreground transition-colors select-none">
                                查看恢复管线技术细节 (Specification §18)
                            </summary>
                            <div className="mt-2.5 pt-2.5 border-t border-border/40 space-y-1.5 pl-1">
                                <div>
                                    1.{" "}
                                    <strong>格式与清单验证 (Validate):</strong>
                                    {" "}
                                    预检 ZIP 解压，核验 manifest.json
                                    及应用兼容性。
                                </div>
                                <div>
                                    2.{" "}
                                    <strong>
                                        数据库完整性核验 (Compatibility Check):
                                    </strong>{" "}
                                    通过 SQLite PRAGMA quick_check 与
                                    foreign_key_check。
                                </div>
                                <div>
                                    3.{" "}
                                    <strong>
                                        当前状态快照存档 (Current Snapshot):
                                    </strong>{" "}
                                    恢复动作前立即生成当前内存/物理快照。
                                </div>
                                <div>
                                    4.{" "}
                                    <strong>
                                        安全原子还原 (Atomic Restore):
                                    </strong>{" "}
                                    覆盖替换 SQLite 库与 assets
                                    静态资源；若中途出错自动无损回滚。
                                </div>
                            </div>
                        </details>
                    </div>
                </SettingsCard>

                {restoreError && (
                    <StatusBanner tone="error">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{restoreError}</span>
                        </div>
                    </StatusBanner>
                )}

                {restoreSuccess && (
                    <StatusBanner tone="success">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <div className="flex-1">{restoreSuccess}</div>
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

                {/* Step 1: Download Backup */}
                <SettingsCard>
                    <div className="admin-backup-content">
                        <h4 className="admin-step-title">
                            1. 创建全量备份
                        </h4>
                        <div>
                            <Button
                                type="button"
                                onClick={handleExportFullBackup}
                                disabled={backupExporting}
                            >
                                <Download size={16} />
                                <span>
                                    {backupExporting
                                        ? "正在生成备份…"
                                        : "下载完整备份 (ZIP)"}
                                </span>
                            </Button>
                        </div>
                    </div>
                </SettingsCard>
                {/* Step 2: Restore from Backup */}
                <SettingsCard>
                    <div className="admin-backup-content">
                        <h4 className="admin-step-title">
                            2. 从备份文件还原
                        </h4>

                        <div className="flex flex-wrap items-center gap-3">
                            <FilePicker
                                id="restore-file-picker"
                                label="选择备份文件"
                                accept=".zip,application/zip"
                                buttonText="选择备份文件 (ZIP)"
                                buttonVariant="outline"
                                icon={<Upload size={16} />}
                                selectedFileName={selectedZipFile
                                    ? selectedZipFile.name
                                    : null}
                                placeholder="未选择文件"
                                onFileSelect={handleZipFileChange}
                            />

                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePreValidate}
                                disabled={!selectedZipFile || validating}
                            >
                                <FileCheck size={16} />
                                <span>
                                    {validating
                                        ? "正在预检验证…"
                                        : "预检验证备份文件"}
                                </span>
                            </Button>
                        </div>

                        {validationError && (
                            <StatusBanner tone="error">
                                <div className="flex items-center gap-2">
                                    <AlertCircle
                                        size={16}
                                        className="shrink-0"
                                    />
                                    <span>预检失败: {validationError}</span>
                                </div>
                            </StatusBanner>
                        )}

                        {validatedManifest && (
                            <div className="admin-validated-card">
                                <div className="admin-validated-header">
                                    <CheckCircle2 size={18} />
                                    <span>
                                        备份验证通过 (SQLite
                                        数据库完整性正常，外键校验无违规)
                                    </span>
                                </div>

                                <div className="admin-manifest-grid">
                                    <div>
                                        备份生成时间：{new Date(
                                            validatedManifest.createdAt,
                                        ).toLocaleString("zh-CN")}
                                    </div>
                                    <div>
                                        用户总数：{validatedManifest.counts
                                            .users}
                                    </div>
                                    <div>
                                        应用数量：{validatedManifest.counts
                                            .webapps}
                                    </div>
                                    <div>
                                        便签总数：{validatedManifest.counts
                                            .notes}
                                    </div>
                                    <div>
                                        AI 提供商/模型：{validatedManifest
                                            .counts
                                            .aiProviders} /{" "}
                                        {validatedManifest.counts.aiModels}
                                    </div>
                                    <div>
                                        壁纸/图标资源：{validatedManifest.assets
                                            .wallpapersCount} /{" "}
                                        {validatedManifest.assets.iconsCount}
                                    </div>
                                </div>

                                <div>
                                    <Button
                                        ref={restoreTriggerRef}
                                        type="button"
                                        variant="destructive"
                                        onClick={() =>
                                            setRestoreModalOpen(true)}
                                    >
                                        <RotateCcw size={16} />
                                        <span>确认还原此备份…</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </SettingsCard>
            </Section>

            <Dialog
                open={restoreModalOpen}
                onOpenChange={(open) => {
                    if (!restoring) setRestoreModalOpen(open);
                }}
            >
                <DialogContent
                    className="max-w-md"
                    finalFocus={restoreTriggerRef}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <ShieldAlert size={20} aria-hidden="true" />
                            <span>警告：即将执行全量数据还原</span>
                        </DialogTitle>
                        <DialogDescription>
                            将使用「{selectedZipFile?.name}」覆盖当前系统的
                            SQLite 数据库、系统设置、图标和壁纸。
                            备份时间：{validatedManifest
                                ? new Date(validatedManifest.createdAt)
                                    .toLocaleString()
                                : "未知"}。操作前会在数据库旁保存当前完整 ZIP
                            快照；失败时尝试回滚。请确认目标文件与范围。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRestoreModalOpen(false)}
                            disabled={restoring}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleExecuteRestore}
                            disabled={restoring}
                        >
                            <RotateCcw size={16} aria-hidden="true" />
                            <span>
                                {restoring ? "正在还原中…" : "确认覆盖并还原"}
                            </span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
