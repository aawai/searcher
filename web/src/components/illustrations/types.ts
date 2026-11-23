export const ILLUSTRATION_NAMES = [
    "empty-documents",
    "empty-apps",
    "empty-ask",
    "empty-trash",
    "no-results",
    "auth-or-error",
] as const;

export type IllustrationName = (typeof ILLUSTRATION_NAMES)[number];

export interface IllustrationMeta {
    readonly name: IllustrationName;
    readonly title: string;
    readonly description: string;
}

export const ILLUSTRATION_CATALOG: readonly IllustrationMeta[] = [
    {
        name: "empty-documents",
        title: "空文档 / 笔记",
        description: "文档工作区尚未选中或创建笔记时的引导状态",
    },
    {
        name: "empty-apps",
        title: "空应用库 / 文件夹",
        description: "应用库或文件夹尚未添加任何应用时的引导状态",
    },
    {
        name: "empty-ask",
        title: "AI 问答初始态",
        description: "新对话欢迎页或尚未配置可用 AI 模型时",
    },
    {
        name: "empty-trash",
        title: "回收站为空",
        description: "回收站中没有已删除应用或笔记时的洁净状态",
    },
    {
        name: "no-results",
        title: "无匹配结果",
        description: "应用搜索、筛选或列表检索未命中任何条目时",
    },
    {
        name: "auth-or-error",
        title: "未登录 / 异常 / 404",
        description: "需要登录、页面不存在或路由加载失败时的状态提示",
    },
];

export function isIllustrationName(raw: unknown): raw is IllustrationName {
    return typeof raw === "string" &&
        (ILLUSTRATION_NAMES as readonly string[]).includes(raw);
}

export type IllustrationVariantProps = {
    name: IllustrationName;
    size?: "sm" | "md" | "lg";
    className?: string;
};
