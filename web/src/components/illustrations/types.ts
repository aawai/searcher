export const ILLUSTRATION_NAMES = [
    "empty-documents",
    "empty-apps",
    "empty-ask",
    "empty-trash",
    "no-results",
    "not-found",
    "auth-required",
    "load-error",
] as const;

export type LegacyIllustrationName = "auth-or-error";

export type IllustrationName =
    | (typeof ILLUSTRATION_NAMES)[number]
    | LegacyIllustrationName;

export interface IllustrationMeta {
    readonly name: (typeof ILLUSTRATION_NAMES)[number];
    readonly title: string;
    readonly description: string;
    readonly interactionHint: string;
}

export const ILLUSTRATION_CATALOG: readonly IllustrationMeta[] = [
    {
        name: "empty-documents",
        title: "空文档 / 笔记",
        description: "文档工作区尚未选中或创建笔记时的引导状态",
        interactionHint: "悬停笔尖轻探，点击点墨晕染，连点三次盖下篆刻闲章",
    },
    {
        name: "empty-apps",
        title: "空应用库 / 文件夹",
        description: "应用库或文件夹尚未添加任何应用时的引导状态",
        interactionHint: "悬停或点击唤醒首格初芽轻摆舒展",
    },
    {
        name: "empty-ask",
        title: "AI 问答初始态",
        description: "新对话欢迎页或尚未配置可用 AI 模型时",
        interactionHint: "悬停或点击转动黄铜星盘，折射蕨叶光脉",
    },
    {
        name: "empty-trash",
        title: "回收站为空",
        description: "回收站中没有已删除应用或笔记时的洁净状态",
        interactionHint: "点击素陶钵轻晃回弹并闪现洁净微光",
    },
    {
        name: "no-results",
        title: "无匹配结果",
        description: "应用搜索、筛选或列表检索未命中任何条目时",
        interactionHint: "移动指针体验放大镜视差与镜底探头草虫",
    },
    {
        name: "not-found",
        title: "页面不存在 / 404",
        description: "访问不存在的路径或页面已被移除时的迷途提示",
        interactionHint: "罗盘磁针实时指向页面中的“返回首页”按钮",
    },
    {
        name: "auth-required",
        title: "未登录 / 访问受限",
        description: "需要登录身份或缺乏管理员权限时的门禁提示",
        interactionHint: "悬停或点击轻晃悬垂的书斋黄铜钥匙",
    },
    {
        name: "load-error",
        title: "加载异常 / 重试",
        description: "路由分片或数据请求失败时的恢复引导状态",
        interactionHint: "悬停或点击唤醒折枝金缮微光与侧芽轻弹",
    },
];

export function isIllustrationName(raw: unknown): raw is IllustrationName {
    if (typeof raw !== "string") return false;
    return raw === "auth-or-error" ||
        (ILLUSTRATION_NAMES as readonly string[]).includes(raw);
}

export type IllustrationVariantProps = {
    name: IllustrationName;
    size?: "sm" | "md" | "lg";
    className?: string;
};
