export interface SystemSettingsDto {
    auditRetentionDays: number;
    allowRegistration: boolean;
    defaultEngine: "google" | "bing" | "baidu" | "duckduckgo";
    defaultTheme: "system" | "light" | "dark";
    defaultSearchTarget: "same" | "new";
}

export interface SystemOverviewDto {
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    totalWebApps: number;
    totalNotes: number;
    totalAiProviders: number;
    totalAiModels: number;
    totalAuditLogs: number;
    settings: SystemSettingsDto;
}

export interface SystemAiModelExportDto {
    modelId: string;
    displayName: string;
    enabled: boolean;
    visibleToUsers: boolean;
    isDefault: boolean;
}

export interface SystemAiProviderExportDto {
    name: string;
    baseUrl: string;
    enabled: boolean;
    models: SystemAiModelExportDto[];
}

export interface ConfigExportDto {
    version: "1.0.0";
    exportedAt: number;
    settings: SystemSettingsDto;
    systemAiProviders: SystemAiProviderExportDto[];
}

export interface ConfigImportResultDto {
    settings: SystemSettingsDto;
    importedProvidersCount: number;
    createdProvidersCount: number;
    updatedProvidersCount: number;
    importedModelsCount: number;
}

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
