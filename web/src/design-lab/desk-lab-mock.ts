import type { DeskObject } from "../features/desk/desk-model.ts";

/** 静 (calm) / 用 (input) / 览 (overview): three distances to one desk. */
export type DeskStage = "calm" | "input" | "overview";

const PAPER_COLORS = ["paper", "amber", "rose", "sage", "sky"] as const;

const BASE: readonly DeskObject[] = [
    {
        id: "notes",
        kind: "notes",
        title: "笔记",
        detail: "128 篇 · 最近：读书笔记",
        preview: ["读书笔记", "周会记录", "旅行清单", "灵感"],
    },
    {
        id: "conversations",
        kind: "conversations",
        title: "AI 对话",
        detail: "12 个 · 最近：旅行计划",
        preview: ["旅行计划", "代码评审"],
    },
    {
        id: "apps",
        kind: "apps",
        title: "应用",
        detail: "8 个应用",
        preview: ["GitHub", "邮箱", "日历", "MDN", "Figma", "豆瓣"],
    },
    {
        id: "folder:work",
        kind: "folder",
        title: "工作",
        detail: "6 个应用",
        large: true,
        preview: ["Linear", "Slack", "Notion", "Jira"],
    },
    {
        id: "folder:read",
        kind: "folder",
        title: "阅读",
        detail: "4 个应用",
        preview: [],
    },
    {
        id: "paper:ideas",
        kind: "paper",
        title: "灵感",
        detail: "今天的灵感来源是散步",
        color: "amber",
        preview: [],
    },
    {
        id: "paper:todo",
        kind: "paper",
        title: "本周待办",
        detail: "2 项待办",
        color: "sage",
        preview: [],
    },
];

/**
 * Mock desk with `count` objects in canonical order (see `buildDeskObjects`).
 * No private data: the lab is a public bundle.
 */
export function mockDeskObjects(count: number): DeskObject[] {
    const objects = BASE.slice(0, Math.max(0, count));
    for (let index = objects.length; index < count; index++) {
        objects.push(
            index % 4 === 0
                ? {
                    id: `folder:${index}`,
                    kind: "folder",
                    title: `文件夹 ${index}`,
                    detail: `${3 + (index % 5)} 个应用`,
                    preview: [],
                }
                : {
                    id: `paper:${index}`,
                    kind: "paper",
                    title: `纸张 ${index}`,
                    detail: "一段固定到首页的笔记",
                    color: PAPER_COLORS[index % PAPER_COLORS.length],
                    preview: [],
                },
        );
    }
    return objects;
}
