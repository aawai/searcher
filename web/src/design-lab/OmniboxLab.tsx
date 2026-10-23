import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    FileText,
    Globe,
    Search,
    Sparkles,
    Terminal,
} from "lucide-react";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    SettingsGroup,
    SettingsRow,
    UndoToast,
} from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { SEARCH_QUICK_COMMANDS } from "../features/shortcuts/shortcut-catalog.ts";
import "./omnibox-lab.css";

type Group = "AI" | "我的" | "应用" | "网页" | "命令";
type Entry = {
    id: string;
    group: Group;
    title: string;
    detail: string;
    action: string;
};
type MockNote = { id: string; body: string; pinned: boolean; favorite: false };
const GROUPS: readonly Group[] = ["AI", "我的", "应用", "网页", "命令"];
const ICONS = {
    AI: Sparkles,
    我的: FileText,
    应用: ArrowUpRight,
    网页: Globe,
    命令: Terminal,
};
const PERSONAL: readonly Entry[] = [
    {
        id: "inspiration",
        group: "我的",
        title: "灵感",
        detail: "今天的灵感来源是散步",
        action: "打开笔记：灵感 · 今天的灵感来源是散步",
    },
    {
        id: "github",
        group: "应用",
        title: "GitHub",
        detail: "github.com",
        action: "打开应用：GitHub",
    },
];

export function OmniboxLab() {
    const [loggedIn, setLoggedIn] = useState(true);
    const [models, setModels] = useState(true);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [action, setAction] = useState("尚未执行操作");
    const [notes, setNotes] = useState<MockNote[]>([]);
    const [undoId, setUndoId] = useState<string | null>(null);
    const composing = useRef(false);
    const aiAvailable = loggedIn && models;
    const text = query.trim();
    const slash = text.startsWith("/");
    const matches = (value: string) =>
        !text || value.toLowerCase().includes(text.toLowerCase());
    const entries: Entry[] = [];
    if (!slash) {
        if (aiAvailable) {
            entries.push({
                id: "ask",
                group: "AI",
                title: text ? `询问 AI：${text}` : "询问 AI",
                detail: "Alt + Enter",
                action: `AI 问答：${text || "新会话"}`,
            });
        }
        if (loggedIn) {
            entries.push(
                ...PERSONAL.filter((entry) =>
                    matches(`${entry.title} ${entry.detail}`)
                ),
            );
        }
        if (loggedIn && matches("散步路线")) {
            entries.push({
                id: "history",
                group: "网页",
                title: "散步路线",
                detail: "搜索历史",
                action: "历史搜索：散步路线",
            });
        }
        entries.push({
            id: "web",
            group: "网页",
            title: text ? `搜索网页：${text}` : "搜索网页",
            detail: "Bing · 默认搜索",
            action: `网页搜索：${text || "空查询"}`,
        });
    }
    entries.push(
        ...SEARCH_QUICK_COMMANDS.filter((command) =>
            (command.target.type !== "mode" || aiAvailable) &&
            (!text ||
                (slash &&
                    `${command.prefix} ${command.action}`.toLowerCase()
                        .includes(text.toLowerCase())))
        ).map((command): Entry => ({
            id: `command-${command.id}`,
            group: "命令",
            title: `${command.prefix} ${command.action}`,
            detail: "快捷命令",
            action: `执行命令：${command.prefix} ${command.action}`,
        })),
    );
    const active = entries.find((entry) => entry.id === selected);
    const activeId = open && active ? `omnibox-option-${active.id}` : undefined;
    useEffect(() => {
        if (activeId) {
            document.getElementById(activeId)?.scrollIntoView({
                block: "nearest",
            });
        }
    }, [activeId]);

    function execute(label: string) {
        setAction(label);
        setSelected(null);
        setOpen(false);
    }
    function changeContext(change: () => void) {
        change();
        setSelected(null);
        setUndoId(null);
    }
    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (
            composing.current || event.nativeEvent.isComposing ||
            event.keyCode === 229
        ) return;
        if (event.key === "Tab") return;
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setSelected(null);
            return;
        }
        if (
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        ) {
            event.preventDefault();
            setOpen(true);
            const index = entries.findIndex((entry) => entry.id === selected);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            let next = index + direction;
            if (index < 0) next = direction === 1 ? 0 : entries.length - 1;
            else next = (next + entries.length) % entries.length;
            setSelected(entries[next]?.id ?? null);
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (
            event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        ) {
            if (aiAvailable) execute(`AI 问答：${text || "新会话"}`);
            return;
        }
        if (
            (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
        ) {
            execute(`新标签页网页搜索：${text || "空查询"}`);
            return;
        }
        if (
            event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
        ) {
            if (!loggedIn || !text) return;
            const note: MockNote = {
                id: crypto.randomUUID(),
                body: text,
                pinned: false,
                favorite: false,
            };
            setNotes((current) => [...current, note]);
            setUndoId(note.id);
            setQuery("");
            setSelected(null);
            setAction(`已创建笔记：${text}（未固定、未收藏）`);
            setOpen(false);
            return;
        }
        if (
            !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        ) execute(active?.action ?? `网页搜索：${text || "空查询"}`);
    }
    const undoNote = notes.find((note) => note.id === undoId);
    return (
        <PageShell archetype="workbench" className="omnibox-lab-page">
            <PageHeader title="统一输入框" />
            <Link to="/design-lab">返回设计实验室</Link>
            <p className="omnibox-lab-caption">
                交互原型 · 仅使用模拟数据，不发起搜索或保存到账号。
            </p>
            <SettingsGroup>
                <SettingsRow title="模拟登录">
                    <label className="omnibox-lab-toggle">
                        <Switch
                            aria-label="模拟登录"
                            checked={loggedIn}
                            onCheckedChange={(value) =>
                                changeContext(() => setLoggedIn(value))}
                        />
                    </label>
                </SettingsRow>
                <SettingsRow title="可用模型">
                    <label className="omnibox-lab-toggle">
                        <Switch
                            aria-label="可用模型"
                            checked={models}
                            onCheckedChange={(value) =>
                                changeContext(() => setModels(value))}
                        />
                    </label>
                </SettingsRow>
            </SettingsGroup>
            <section className="omnibox-lab-search" aria-label="统一搜索原型">
                <div className="omnibox-lab-input-row">
                    <Search size="1em" aria-hidden="true" />
                    <Input
                        id="omnibox-input"
                        role="combobox"
                        aria-label="搜索或记录"
                        aria-autocomplete="list"
                        aria-expanded={open}
                        aria-controls="omnibox-results"
                        aria-activedescendant={activeId}
                        aria-describedby="omnibox-count"
                        placeholder="搜索、提问、记下灵感，或输入 /"
                        value={query}
                        onFocus={() => setOpen(true)}
                        onBlur={() => {
                            setOpen(false);
                            setSelected(null);
                        }}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setSelected(null);
                            setOpen(true);
                        }}
                        onKeyDown={onKeyDown}
                        onCompositionStart={() => {
                            composing.current = true;
                        }}
                        onCompositionEnd={() => {
                            composing.current = false;
                        }}
                    />
                </div>
                <div
                    id="omnibox-results"
                    role="listbox"
                    aria-label="搜索建议"
                    hidden={!open}
                    className="omnibox-lab-results"
                >
                    {GROUPS.map((group) => {
                        const items = entries.filter((entry) =>
                            entry.group === group
                        );
                        if (!items.length) return null;
                        const Icon = ICONS[group];
                        return (
                            <div
                                key={group}
                                role="group"
                                aria-labelledby={`omnibox-group-${group}`}
                            >
                                <h2
                                    id={`omnibox-group-${group}`}
                                    className="omnibox-lab-group"
                                >
                                    {group}
                                </h2>
                                {items.map((entry) => (
                                    <div
                                        key={entry.id}
                                        id={`omnibox-option-${entry.id}`}
                                        role="option"
                                        aria-selected={active?.id === entry.id}
                                        className="omnibox-lab-option"
                                        onMouseDown={(event) =>
                                            event.preventDefault()}
                                        onClick={() => execute(entry.action)}
                                    >
                                        <Icon size="1em" aria-hidden="true" />
                                        <span className="omnibox-lab-entry">
                                            <span>{entry.title}</span>
                                            <span className="omnibox-lab-detail">
                                                {entry.detail}
                                            </span>
                                        </span>
                                        {active?.id === entry.id && (
                                            <span aria-hidden="true">↵</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                    {!entries.length && (
                        <p className="omnibox-lab-caption">没有匹配的命令</p>
                    )}
                </div>
            </section>
            <p
                id="omnibox-count"
                role="status"
                aria-live="polite"
                className="omnibox-lab-caption"
            >
                {open
                    ? `${entries.length} 条建议，${
                        active ? `已选择 ${active.title}` : "未选择建议"
                    }`
                    : "建议已收起"}
            </p>
            <section aria-label="模拟操作结果" className="omnibox-lab-output">
                <h2>操作结果</h2>
                <p role="status" aria-live="polite">{action}</p>
            </section>
            {loggedIn && notes.length > 0 && (
                <section aria-label="本次记录" className="omnibox-lab-output">
                    <h2>本次记录</h2>
                    <ul>
                        {notes.map((note) => (
                            <li key={note.id}>
                                {note.body} ·{" "}
                                {note.pinned ? "已固定" : "未固定"} · 未收藏
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <UndoToast
                open={Boolean(undoNote)}
                message="已创建笔记，未固定、未收藏"
                onUndo={() => {
                    setNotes((current) =>
                        current.filter((note) => note.id !== undoId)
                    );
                    setUndoId(null);
                    setAction("已撤销创建笔记");
                    document.getElementById("omnibox-input")?.focus();
                }}
                onClose={() => setUndoId(null)}
                actions={
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setNotes((current) =>
                                current.map((note) =>
                                    note.id === undoId
                                        ? { ...note, pinned: true }
                                        : note
                                )
                            );
                            setUndoId(null);
                            setAction("已固定到首页");
                        }}
                    >
                        固定到首页
                    </Button>
                }
            />
        </PageShell>
    );
}
