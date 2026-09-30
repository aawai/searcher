import { type ChangeEvent, useRef, useState } from "react";
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
import { Button } from "../components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import {
    ActionGroup,
    Section,
    SectionHeader,
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

export function AdminBackupRestore() {
    const configFileRef = useRef<HTMLInputElement>(null);
    const restoreTriggerRef = useRef<HTMLButtonElement>(null);
    // Config export/import state
    const [configImporting, setConfigImporting] = useState(false);
    const [configSuccess, setConfigSuccess] = useState("");
    const [configError, setConfigError] = useState("");
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
    const handleConfigFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
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
            e.target.value = "";
        }
    };

    // 3. Export Full Backup ZIP
    const handleExportFullBackup = () => {
        setBackupExporting(true);
        globalThis.open("/api/admin/backup/export", "_blank");
        setTimeout(() => setBackupExporting(false), 2000);
    };

    // 4. Handle ZIP Selection and Pre-validate
    const handleZipFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedZipFile(file);
            setValidatedManifest(null);
            setValidationError("");
            setRestoreSuccess("");
            setRestoreError("");
        }
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
                title="备份与恢复 (Backup & Restore)"
                description="遵循规范 §15 / §18：配置导入导出、全量打包 ZIP、预验证与安全快照回滚"
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
                            系统加密主密钥 (Encryption Key)
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
                title="配置导入 / 导出 (Configuration Export / Import)"
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

                <ActionGroup>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleExportConfig}
                    >
                        <Download size={16} />
                        <span>导出系统配置 (JSON)</span>
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        disabled={configImporting}
                        onClick={() => configFileRef.current?.click()}
                    >
                        <Upload size={16} />
                        <span>
                            {configImporting
                                ? "正在导入…"
                                : "导入系统配置 (JSON)"}
                        </span>
                    </Button>
                    <input
                        ref={configFileRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleConfigFileChange}
                        disabled={configImporting}
                        className="sr-only"
                    />
                </ActionGroup>
            </Section>

            {/* Module 2: Full ZIP Backup & Safe Restore */}
            <Section
                title="全量 ZIP 备份与恢复 (Full Backup / Restore)"
                description="遵循规范 §18 安全还原管线：预检格式清单、PRAGMA 完整性核验、当前快照存档与安全原子替换。"
            >
                <div className="admin-pipeline-card">
                    <div className="admin-pipeline-title">
                        恢复执行管线规范 (Specification §18 Safe Restore
                        Pipeline):
                    </div>
                    <div>
                        1. <strong>格式与清单验证 (Validate):</strong>{" "}
                        预检 ZIP 解压，核验 manifest.json 及应用兼容性。
                    </div>
                    <div>
                        2.{" "}
                        <strong>数据库完整性核验 (Compatibility Check):</strong>
                        {" "}
                        通过 SQLite PRAGMA quick_check 与 foreign_key_check。
                    </div>
                    <div>
                        3. <strong>当前状态快照存档 (Current Snapshot):</strong>
                        {" "}
                        恢复动作前立即生成当前内存/物理快照。
                    </div>
                    <div>
                        4. <strong>安全原子还原 (Atomic Restore):</strong>{" "}
                        覆盖替换 SQLite 库与 assets
                        静态资源；若中途出错自动无损回滚。
                    </div>
                </div>

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

                {/* Step A: Download Backup */}
                <div className="admin-step-block">
                    <h4 className="admin-step-title">
                        1. 创建全量备份 (Download Full Backup)
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

                {/* Step B: Restore from Backup */}
                <div className="admin-step-block">
                    <h4 className="admin-step-title">
                        2. 从备份文件还原 (Restore from Backup)
                    </h4>

                    <div className="admin-file-input-group">
                        <input
                            type="file"
                            accept=".zip,application/zip"
                            onChange={handleZipFileChange}
                            className="admin-file-input"
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
                                <AlertCircle size={16} className="shrink-0" />
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
                                    用户总数：{validatedManifest.counts.users}
                                </div>
                                <div>
                                    APP 数量：{validatedManifest.counts.webapps}
                                </div>
                                <div>
                                    便签总数：{validatedManifest.counts.notes}
                                </div>
                                <div>
                                    AI 提供商/模型：{validatedManifest.counts
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
                                    onClick={() => setRestoreModalOpen(true)}
                                >
                                    <RotateCcw size={16} />
                                    <span>确认还原此备份…</span>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
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
