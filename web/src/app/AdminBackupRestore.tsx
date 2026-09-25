import { type ChangeEvent, type FormEvent, useState } from "react";
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Database,
    Download,
    FileCheck,
    FileJson,
    FolderArchive,
    HardDrive,
    Info,
    RefreshCw,
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
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";

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
        window.open("/api/admin/system/config/export", "_blank");
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
        window.open("/api/admin/backup/export", "_blank");
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

            const result = await api<
                {
                    manifest: BackupManifest;
                    snapshotCreated: boolean;
                    snapshotPath: string;
                }
            >(
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
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
                    备份与恢复 (Backup & Restore)
                </h2>
                <p
                    style={{
                        color: "var(--muted)",
                        margin: "4px 0 0",
                        fontSize: "14px",
                    }}
                >
                    遵循规范 §15 / §18：配置导入导出、全量打包
                    ZIP、预验证与安全快照回滚
                </p>
            </div>

            {/* Security Isolation Banner */}
            <div
                style={{
                    padding: "16px 20px",
                    borderRadius: "8px",
                    background:
                        "color-mix(in srgb, var(--accent) 12%, var(--surface))",
                    border:
                        "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    fontSize: "14px",
                }}
            >
                <HardDrive
                    size={22}
                    style={{
                        color: "var(--accent)",
                        flexShrink: 0,
                        marginTop: "2px",
                    }}
                />
                <div style={{ lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--foreground)" }}>
                        密钥隔离与数据安全保障：
                    </strong>
                    <span style={{ color: "var(--muted)" }}>
                        系统加密主密钥 (Encryption Key)
                        永不包含在数据库、备份文件或配置导出中。备份 ZIP
                        包含完整{" "}
                        <code>manifest.json</code>、<code>database.sqlite</code>
                        {" "}
                        以及 <code>assets/</code> 资源目录。
                    </span>
                </div>
            </div>

            {/* Module 1: Configuration Export / Import */}
            <section
                style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <FileJson size={18} style={{ color: "var(--accent)" }} />
                    <h3
                        style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}
                    >
                        配置导入 / 导出 (Configuration Export / Import)
                    </h3>
                </div>
                <p
                    style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "var(--muted)",
                        lineHeight: 1.5,
                    }}
                >
                    轻量导出系统设置、AI
                    提供商元数据及模型可见性（不包含用户私人数据、聊天历史或 API
                    Key 密文）。新导入的 AI 提供商默认处于禁用状态，导入后必须在
                    AI 设置中手动配置 API Key 并刷新可用模型方可启用。
                </p>

                {configError && (
                    <div
                        role="alert"
                        style={{
                            padding: "10px 14px",
                            borderRadius: "6px",
                            background:
                                "color-mix(in srgb, var(--danger) 15%, var(--surface))",
                            color: "var(--danger)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                        }}
                    >
                        <AlertCircle size={16} />
                        <span>{configError}</span>
                    </div>
                )}

                {configSuccess && (
                    <div
                        role="status"
                        style={{
                            padding: "10px 14px",
                            borderRadius: "6px",
                            background:
                                "color-mix(in srgb, var(--success) 15%, var(--surface))",
                            color: "var(--success)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                        }}
                    >
                        <CheckCircle2 size={16} />
                        <span>{configSuccess}</span>
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        marginTop: "8px",
                    }}
                >
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleExportConfig}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        <Download size={16} />
                        <span>导出系统配置 (JSON)</span>
                    </Button>

                    <label
                        className="button button--subtle"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: configImporting ? "not-allowed" : "pointer",
                            opacity: configImporting ? 0.6 : 1,
                        }}
                    >
                        <Upload size={16} />
                        <span>
                            {configImporting
                                ? "正在导入…"
                                : "导入系统配置 (JSON)"}
                        </span>
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleConfigFileChange}
                            disabled={configImporting}
                            style={{ display: "none" }}
                        />
                    </label>
                </div>
            </section>

            {/* Module 2: Full ZIP Backup & Safe Restore */}
            <section
                style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <FolderArchive
                        size={18}
                        style={{ color: "var(--accent)" }}
                    />
                    <h3
                        style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}
                    >
                        全量 ZIP 备份与恢复 (Full Backup / Restore)
                    </h3>
                </div>

                <div
                    style={{
                        padding: "16px",
                        borderRadius: "8px",
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "var(--muted)",
                    }}
                >
                    <div
                        style={{
                            fontWeight: 600,
                            color: "var(--foreground)",
                            marginBottom: "4px",
                        }}
                    >
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
                    <div
                        role="alert"
                        style={{
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background:
                                "color-mix(in srgb, var(--danger) 15%, var(--surface))",
                            color: "var(--danger)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "14px",
                        }}
                    >
                        <AlertCircle size={18} />
                        <span>{restoreError}</span>
                    </div>
                )}

                {restoreSuccess && (
                    <div
                        role="status"
                        style={{
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background:
                                "color-mix(in srgb, var(--success) 15%, var(--surface))",
                            color: "var(--success)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "14px",
                        }}
                    >
                        <CheckCircle2 size={18} />
                        <div style={{ flex: 1 }}>{restoreSuccess}</div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => window.location.reload()}
                        >
                            重新加载页面
                        </Button>
                    </div>
                )}

                {/* Step A: Download Backup */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                    }}
                >
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                        1. 创建全量备份 (Download Full Backup)
                    </div>
                    <div>
                        <Button
                            type="button"
                            onClick={handleExportFullBackup}
                            disabled={backupExporting}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
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

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--border)",
                        margin: 0,
                    }}
                />

                {/* Step B: Restore from Backup */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                        2. 从备份文件还原 (Restore from Backup)
                    </div>

                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "12px",
                        }}
                    >
                        <input
                            type="file"
                            accept=".zip,application/zip"
                            onChange={handleZipFileChange}
                            style={{ fontSize: "14px" }}
                        />

                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePreValidate}
                            disabled={!selectedZipFile || validating}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
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
                        <div
                            role="alert"
                            style={{
                                padding: "10px 14px",
                                borderRadius: "6px",
                                background:
                                    "color-mix(in srgb, var(--danger) 15%, var(--surface))",
                                color: "var(--danger)",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "13px",
                            }}
                        >
                            <AlertCircle size={16} />
                            <span>预检失败: {validationError}</span>
                        </div>
                    )}

                    {validatedManifest && (
                        <div
                            style={{
                                padding: "16px",
                                borderRadius: "8px",
                                background:
                                    "color-mix(in srgb, var(--success) 8%, var(--surface))",
                                border:
                                    "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "12px",
                                marginTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    color: "var(--success)",
                                    fontWeight: 600,
                                }}
                            >
                                <CheckCircle2 size={18} />
                                <span>
                                    备份验证通过 (SQLite
                                    数据库完整性正常，外键校验无违规)
                                </span>
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "10px",
                                    fontSize: "13px",
                                }}
                            >
                                <div>
                                    备份生成时间：{new Date(
                                        validatedManifest.createdAt,
                                    ).toLocaleString("zh-CN")}
                                </div>
                                <div>
                                    用户总数：{validatedManifest.counts.users}
                                </div>
                                <div>
                                    APP 数量：{validatedManifest.counts
                                        .webapps}
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

                            <div style={{ marginTop: "4px" }}>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => setRestoreModalOpen(true)}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                    }}
                                >
                                    <RotateCcw size={16} />
                                    <span>确认还原此备份…</span>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <Dialog
                open={restoreModalOpen}
                onOpenChange={(open) => {
                    if (!restoring) setRestoreModalOpen(open);
                }}
            >
                <DialogContent style={{ maxWidth: "480px" }}>
                    <DialogHeader>
                        <DialogTitle>
                            <ShieldAlert size={20} aria-hidden="true" />{" "}
                            警告：即将执行全量数据还原
                        </DialogTitle>
                        <DialogDescription>
                            将使用「{selectedZipFile?.name}」覆盖当前系统的
                            SQLite 数据库、系统设置、图标和壁纸。
                            备份时间：{validatedManifest
                                ? new Date(validatedManifest.createdAt)
                                    .toLocaleString()
                                : "未知"}。 操作前会在数据库旁保存当前完整 ZIP
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
                            {restoring ? "正在还原中…" : "确认覆盖并还原"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
