import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import {
    Check,
    CheckCircle2,
    Download,
    FileArchive,
    FileCheck,
    FileJson,
    HardDriveDownload,
    KeyRound,
    RefreshCw,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    Upload,
} from "lucide-react";
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
import { StatusBanner } from "../components/searcher/semantic.tsx";
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import { AdminPanelHeader } from "./AdminShell.tsx";
import "../features/admin/admin-ops.css";

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

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatManifestTime(timestamp: number): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
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

export function AdminBackupRestore() {
    const configInputRef = useRef<HTMLInputElement>(null);
    const configTriggerRef = useRef<HTMLButtonElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);
    const restoreTriggerRef = useRef<HTMLButtonElement>(null);

    const [configBusy, setConfigBusy] = useState(false);
    const [configSuccess, setConfigSuccess] = useState("");
    const [configError, setConfigError] = useState("");
    const [configFileName, setConfigFileName] = useState("");
    const [pendingImport, setPendingImport] = useState<
        PendingConfigImport | null
    >(null);

    const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
    const [isDraggingZip, setIsDraggingZip] = useState(false);
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

    const zipBusy = validating || restoring;
    const step1State: "active" | "done" = selectedZipFile ? "done" : "active";
    const step2State: "pending" | "active" | "done" = validatedManifest
        ? "done"
        : selectedZipFile
        ? "active"
        : "pending";
    const step3State: "pending" | "active" | "done" = restoreSuccess
        ? "done"
        : validatedManifest
        ? "active"
        : "pending";

    function openConfigPicker() {
        if (configInputRef.current) {
            configInputRef.current.value = "";
            configInputRef.current.click();
        }
    }

    function openZipPicker() {
        if (zipBusy) return;
        if (zipInputRef.current) {
            zipInputRef.current.value = "";
            zipInputRef.current.click();
        }
    }

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

    function handleConfigInputChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) void handleConfigFileChange(file);
        e.target.value = "";
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

    function clearSelectedZip() {
        setSelectedZipFile(null);
        setValidatedManifest(null);
        setValidationError("");
        setValidationWarnings([]);
        setRestoreSuccess("");
        setRestoreError("");
        setRestoreWarnings([]);
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

    function handleZipInputChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) handleZipFileChange(file);
        e.target.value = "";
    }

    function handleZipDragOver(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        if (!zipBusy) setIsDraggingZip(true);
    }

    function handleZipDragLeave(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDraggingZip(false);
        }
    }

    function handleZipDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDraggingZip(false);
        if (zipBusy) return;
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (
            !file.name.toLowerCase().endsWith(".zip") &&
            file.type !== "application/zip" &&
            file.type !== "application/x-zip-compressed"
        ) {
            setValidationError("请选择扩展名为 .zip 的备份文件");
            return;
        }
        handleZipFileChange(file);
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
        <div className="admin-ops-section">
            <AdminPanelHeader
                title="备份"
                description="导出完整实例快照、执行校验还原，或迁移轻量系统配置"
            />

            <div className="admin-backup-grid">
                <section
                    className="admin-surface admin-ops-card"
                    aria-labelledby="admin-backup-export-heading"
                >
                    <header className="admin-ops-card-head">
                        <div className="admin-ops-card-head-main">
                            <span
                                className="admin-ops-icon-chip"
                                data-tone="accent"
                                aria-hidden="true"
                            >
                                <HardDriveDownload size="1.1em" />
                            </span>
                            <div className="admin-ops-card-titles">
                                <h3
                                    id="admin-backup-export-heading"
                                    className="admin-ops-card-title"
                                >
                                    下载完整备份
                                </h3>
                                <p className="admin-ops-card-desc">
                                    导出一致性实例快照（ZIP），不中断当前服务
                                </p>
                            </div>
                        </div>
                        <span className="admin-pill" data-tone="success">
                            <span
                                className="admin-pill-dot"
                                aria-hidden="true"
                            />
                            <span>安全只读</span>
                        </span>
                    </header>

                    <div className="admin-ops-card-body admin-ops-card-body--padded">
                        <ul className="admin-ops-checklist">
                            <li>
                                <Check
                                    className="admin-ops-check-icon"
                                    aria-hidden="true"
                                />
                                <div className="admin-ops-check-text">
                                    <span className="admin-ops-check-label">
                                        SQLite 数据库
                                    </span>
                                    <span className="admin-ops-check-meta">
                                        用户账户、应用、笔记、AI 配置与审计记录
                                    </span>
                                </div>
                            </li>
                            <li>
                                <Check
                                    className="admin-ops-check-icon"
                                    aria-hidden="true"
                                />
                                <div className="admin-ops-check-text">
                                    <span className="admin-ops-check-label">
                                        系统设置
                                    </span>
                                    <span className="admin-ops-check-meta">
                                        全局注册策略、审计保留期与默认偏好
                                    </span>
                                </div>
                            </li>
                            <li>
                                <Check
                                    className="admin-ops-check-icon"
                                    aria-hidden="true"
                                />
                                <div className="admin-ops-check-text">
                                    <span className="admin-ops-check-label">
                                        壁纸与图标资产
                                    </span>
                                    <span className="admin-ops-check-meta">
                                        本地存储的壁纸原图与应用图标文件
                                    </span>
                                </div>
                            </li>
                        </ul>

                        <div className="admin-ops-callout">
                            <KeyRound
                                className="admin-ops-callout-icon"
                                aria-hidden="true"
                            />
                            <span>
                                备份不含 <code>ENCRYPTION_KEY</code>
                                。跨部署恢复时须提供原实例密钥，否则既有 AI
                                服务商 API Key 无法解密。
                            </span>
                        </div>

                        <div className="admin-ops-card-actions">
                            <Button
                                variant="default"
                                render={
                                    <a
                                        href="/api/admin/backup/export"
                                        download
                                    />
                                }
                            >
                                <Download size="1em" aria-hidden="true" />
                                <span>下载备份（ZIP）</span>
                            </Button>
                        </div>
                    </div>
                </section>

                <section
                    className="admin-surface admin-ops-card admin-danger-surface"
                    aria-labelledby="admin-backup-restore-heading"
                >
                    <header className="admin-ops-card-head">
                        <div className="admin-ops-card-head-main">
                            <span
                                className="admin-ops-icon-chip"
                                data-tone="danger"
                                aria-hidden="true"
                            >
                                <ShieldAlert size="1.1em" />
                            </span>
                            <div className="admin-ops-card-titles">
                                <h3
                                    id="admin-backup-restore-heading"
                                    className="admin-ops-card-title"
                                >
                                    从备份还原
                                </h3>
                                <p className="admin-ops-card-desc">
                                    校验完整性后覆盖当前数据库与资产
                                </p>
                            </div>
                        </div>
                        <span className="admin-pill" data-tone="danger">
                            <span
                                className="admin-pill-dot"
                                aria-hidden="true"
                            />
                            <span>高风险覆盖操作</span>
                        </span>
                    </header>

                    <div className="admin-ops-card-body admin-ops-card-body--padded">
                        <ol
                            className="admin-ops-steps"
                            aria-label="备份还原步骤"
                        >
                            <li
                                className="admin-ops-step"
                                data-state={step1State}
                                aria-current={step1State === "active"
                                    ? "step"
                                    : undefined}
                            >
                                <span
                                    className="admin-ops-step-num"
                                    aria-hidden="true"
                                >
                                    {step1State === "done"
                                        ? <Check size="0.8em" />
                                        : "1"}
                                </span>
                                <span className="admin-ops-step-label">
                                    选择文件
                                </span>
                            </li>
                            <li
                                className="admin-ops-step"
                                data-state={step2State}
                                aria-current={step2State === "active"
                                    ? "step"
                                    : undefined}
                            >
                                <span
                                    className="admin-ops-step-num"
                                    aria-hidden="true"
                                >
                                    {step2State === "done"
                                        ? <Check size="0.8em" />
                                        : "2"}
                                </span>
                                <span className="admin-ops-step-label">
                                    预检校验
                                </span>
                            </li>
                            <li
                                className="admin-ops-step"
                                data-state={step3State}
                                aria-current={step3State === "active"
                                    ? "step"
                                    : undefined}
                            >
                                <span
                                    className="admin-ops-step-num"
                                    aria-hidden="true"
                                >
                                    {step3State === "done"
                                        ? <Check size="0.8em" />
                                        : "3"}
                                </span>
                                <span className="admin-ops-step-label">
                                    确认还原
                                </span>
                            </li>
                        </ol>

                        <input
                            ref={zipInputRef}
                            id="backup-restore-file"
                            type="file"
                            accept=".zip,application/zip"
                            onChange={handleZipInputChange}
                            disabled={zipBusy}
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden="true"
                        />

                        {!selectedZipFile
                            ? (
                                <div
                                    className="admin-ops-dropzone"
                                    data-dragging={isDraggingZip || undefined}
                                    data-disabled={zipBusy || undefined}
                                    onDragEnter={handleZipDragOver}
                                    onDragOver={handleZipDragOver}
                                    onDragLeave={handleZipDragLeave}
                                    onDrop={handleZipDrop}
                                    onClick={(e) => {
                                        if (
                                            (e.target as HTMLElement).closest(
                                                "button",
                                            )
                                        ) return;
                                        openZipPicker();
                                    }}
                                >
                                    <Upload
                                        className="admin-ops-dropzone-icon"
                                        aria-hidden="true"
                                    />
                                    <p className="admin-ops-dropzone-title">
                                        拖入 ZIP 备份文件，或点击选择
                                    </p>
                                    <p className="admin-ops-dropzone-hint">
                                        支持 Searcher 导出的 .zip 快照（上限 50
                                        MiB）
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={zipBusy}
                                        onClick={openZipPicker}
                                    >
                                        选择 ZIP 文件
                                    </Button>
                                </div>
                            )
                            : (
                                <div className="admin-ops-file-card">
                                    <div className="admin-ops-file-info">
                                        <span
                                            className="admin-ops-icon-chip"
                                            aria-hidden="true"
                                        >
                                            <FileArchive size="1.05em" />
                                        </span>
                                        <div className="admin-ops-file-meta">
                                            <span className="admin-ops-file-name">
                                                {selectedZipFile.name}
                                            </span>
                                            <span className="admin-ops-file-size">
                                                {formatFileSize(
                                                    selectedZipFile.size,
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="admin-ops-file-actions">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={zipBusy}
                                            onClick={openZipPicker}
                                        >
                                            更换
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={zipBusy}
                                            onClick={clearSelectedZip}
                                        >
                                            清除
                                        </Button>
                                    </div>
                                </div>
                            )}

                        {validationError && (
                            <StatusBanner
                                id="backup-validate-error"
                                tone="error"
                                density="compact"
                            >
                                预检失败：{validationError}
                            </StatusBanner>
                        )}

                        {selectedZipFile && !validatedManifest && (
                            <div className="admin-ops-action-row">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handlePreValidate}
                                    disabled={zipBusy}
                                    aria-describedby={validationError
                                        ? "backup-validate-error"
                                        : undefined}
                                >
                                    <FileCheck size="1em" aria-hidden="true" />
                                    <span>
                                        {validating ? "正在验证…" : "预检备份"}
                                    </span>
                                </Button>
                            </div>
                        )}

                        {validatedManifest && (
                            <>
                                <div
                                    className="admin-ops-verified-strip"
                                    role="status"
                                >
                                    <CheckCircle2
                                        size="1em"
                                        aria-hidden="true"
                                    />
                                    <span>
                                        校验通过 · 数据库完整性与资产检查正常
                                    </span>
                                </div>

                                {validationWarnings.length > 0 && (
                                    <StatusBanner
                                        tone="warning"
                                        density="compact"
                                    >
                                        {validationWarnings.join(" ")}
                                    </StatusBanner>
                                )}

                                <dl className="admin-ops-manifest-grid">
                                    <div className="admin-ops-manifest-cell">
                                        <dt>生成时间</dt>
                                        <dd>
                                            {formatManifestTime(
                                                validatedManifest.createdAt,
                                            )}
                                        </dd>
                                    </div>
                                    <div className="admin-ops-manifest-cell">
                                        <dt>用户</dt>
                                        <dd>
                                            {validatedManifest.counts.users}
                                        </dd>
                                    </div>
                                    <div className="admin-ops-manifest-cell">
                                        <dt>应用</dt>
                                        <dd>
                                            {validatedManifest.counts.webapps}
                                        </dd>
                                    </div>
                                    <div className="admin-ops-manifest-cell">
                                        <dt>笔记</dt>
                                        <dd>
                                            {validatedManifest.counts.documents}
                                        </dd>
                                    </div>
                                    <div className="admin-ops-manifest-cell">
                                        <dt>AI 服务商 · 模型</dt>
                                        <dd>
                                            {validatedManifest.counts
                                                .aiProviders} ·{" "}
                                            {validatedManifest.counts.aiModels}
                                        </dd>
                                    </div>
                                    <div className="admin-ops-manifest-cell">
                                        <dt>壁纸 · 图标</dt>
                                        <dd>
                                            {validatedManifest.assets
                                                .wallpapersCount} ·{" "}
                                            {validatedManifest.assets
                                                .iconsCount}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="admin-ops-restore-box">
                                    <p className="admin-ops-reassurance">
                                        <ShieldCheck
                                            className="admin-ops-reassurance-icon"
                                            aria-hidden="true"
                                        />
                                        <span>
                                            还原前会自动保存当前实例快照，失败时尝试回滚。
                                        </span>
                                    </p>

                                    {restoreError && (
                                        <StatusBanner
                                            tone="error"
                                            density="compact"
                                        >
                                            {restoreError}
                                        </StatusBanner>
                                    )}
                                    {restoreWarnings.length > 0 && (
                                        <StatusBanner
                                            tone="warning"
                                            density="compact"
                                        >
                                            {restoreWarnings.join(" ")}
                                        </StatusBanner>
                                    )}
                                    {restoreSuccess && (
                                        <StatusBanner
                                            tone="success"
                                            density="compact"
                                        >
                                            {restoreSuccess}
                                        </StatusBanner>
                                    )}

                                    <div className="admin-ops-action-row">
                                        <Button
                                            ref={restoreTriggerRef}
                                            type="button"
                                            variant="destructive"
                                            disabled={restoring}
                                            onClick={() =>
                                                setRestoreModalOpen(true)}
                                        >
                                            <RotateCcw
                                                size="1em"
                                                aria-hidden="true"
                                            />
                                            <span>
                                                {restoring
                                                    ? "正在还原…"
                                                    : "还原此备份…"}
                                            </span>
                                        </Button>

                                        {restoreSuccess && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    globalThis.location
                                                        .reload()}
                                            >
                                                <RefreshCw
                                                    size="1em"
                                                    aria-hidden="true"
                                                />
                                                <span>重新加载页面</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </section>
            </div>

            <section
                className="admin-surface admin-ops-card"
                aria-labelledby="admin-backup-config-heading"
            >
                <header className="admin-ops-card-head">
                    <div className="admin-ops-card-head-main">
                        <span
                            className="admin-ops-icon-chip"
                            aria-hidden="true"
                        >
                            <FileJson size="1.1em" />
                        </span>
                        <div className="admin-ops-card-titles">
                            <h3
                                id="admin-backup-config-heading"
                                className="admin-ops-card-title"
                            >
                                系统配置导入与导出（JSON）
                            </h3>
                            <p className="admin-ops-card-desc">
                                仅包含系统设置与系统级 AI
                                服务商结构，不含用户数据与 API Key
                            </p>
                        </div>
                    </div>
                </header>

                {(configSuccess || configError) && (
                    <div className="admin-ops-config-feedback">
                        {configSuccess && (
                            <StatusBanner tone="success" density="compact">
                                {configSuccess}
                            </StatusBanner>
                        )}
                        {configError && (
                            <StatusBanner
                                id="config-import-error"
                                tone="error"
                                density="compact"
                            >
                                {configError}
                            </StatusBanner>
                        )}
                    </div>
                )}

                <div className="admin-ops-config-split">
                    <div className="admin-ops-config-pane">
                        <h4 className="admin-ops-config-pane-title">
                            导出配置
                        </h4>
                        <p className="admin-ops-config-pane-desc">
                            生成轻量 JSON
                            文件，适合版本记录或将当前系统策略快速复制到新实例。
                        </p>
                        <div className="admin-ops-action-row">
                            <Button
                                variant="outline"
                                render={
                                    <a
                                        href="/api/admin/system/config/export"
                                        download
                                    />
                                }
                            >
                                <Download size="1em" aria-hidden="true" />
                                <span>导出 JSON</span>
                            </Button>
                        </div>
                    </div>

                    <div className="admin-ops-config-pane">
                        <h4 className="admin-ops-config-pane-title">
                            导入配置
                        </h4>
                        <p className="admin-ops-config-pane-desc">
                            选择配置文件后会先执行差异预览，确认将影响的设置与服务商后再写入。
                        </p>
                        <div className="admin-ops-action-row">
                            <input
                                ref={configInputRef}
                                id="config-import-file"
                                type="file"
                                accept=".json,application/json"
                                onChange={handleConfigInputChange}
                                disabled={configBusy}
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                            <Button
                                ref={configTriggerRef}
                                type="button"
                                variant="outline"
                                disabled={configBusy}
                                aria-describedby={configError
                                    ? "config-import-error"
                                    : undefined}
                                onClick={openConfigPicker}
                            >
                                <Upload size="1em" aria-hidden="true" />
                                <span>
                                    {configBusy ? "正在读取…" : "导入 JSON"}
                                </span>
                            </Button>
                            {configFileName && !pendingImport && (
                                <span className="admin-ops-file-size">
                                    {configFileName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

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
