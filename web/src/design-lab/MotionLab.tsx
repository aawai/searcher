import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { Section } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { useEscapeLayer } from "../components/ui/escape-layer-stack.tsx";
import {
    runSharedElementTransition,
    supportsSharedElementTransition,
} from "../lib/shared-element.ts";
import "./motion-lab.css";

const CARDS = [
    {
        id: "reading",
        title: "阅读线索",
        summary: "把零散的阅读记录整理成下一步问题。",
    },
    {
        id: "research",
        title: "研究摘要",
        summary: "从来源出发，保留结论与证据的联系。",
    },
    {
        id: "ideas",
        title: "灵感整理",
        summary: "让一条简短想法获得更完整的讨论空间。",
    },
];

function FolderReference() {
    const [open, setOpen] = useState(false);
    const tile = useRef<HTMLButtonElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    const change = async (next: boolean) => {
        const source = next ? tile.current : popup.current;
        if (!source) return;
        await runSharedElementTransition({
            source,
            update: () => flushSync(() => setOpen(next)),
            findTarget: () => next ? popup.current : tile.current,
        });
        (next ? close.current : tile.current)?.focus();
    };
    useEscapeLayer(open, () => void change(false));
    return (
        <Section title="文件夹图块 ↔ 弹层">
            <p>同一文件夹展开与收起；只有文件夹参与几何变形。</p>
            {open
                ? (
                    <div ref={popup} className="motion-lab-object">
                        <h2>常用工具</h2>
                        <p>文件夹中的应用</p>
                        <Button ref={close} onClick={() => void change(false)}>
                            关闭
                        </Button>
                    </div>
                )
                : (
                    <Button
                        ref={tile}
                        variant="outline"
                        onClick={() => void change(true)}
                    >
                        打开常用工具文件夹
                    </Button>
                )}
        </Section>
    );
}

function NotesReference() {
    const [windowState, setWindowState] = useState<
        "closed" | "open" | "minimized"
    >("closed");
    const [selected, setSelected] = useState(false);
    const entry = useRef<HTMLButtonElement>(null);
    const note = useRef<HTMLDivElement>(null);
    const title = useRef<HTMLButtonElement>(null);
    const openNote = async () => {
        if (!entry.current) return;
        await runSharedElementTransition({
            source: entry.current,
            update: () =>
                flushSync(() => {
                    setWindowState("open");
                    setSelected(true);
                }),
            findTarget: () => note.current,
        });
        title.current?.focus();
    };
    return (
        <Section title="置顶条目 → 笔记窗口（实验）">
            <p>从关闭、已打开或最小化状态打开同一笔记；窗口不叠加入场动效。</p>
            <div className="motion-lab-notes-actions">
                <Button
                    variant="outline"
                    onClick={() => {
                        setWindowState("closed");
                        setSelected(false);
                    }}
                >
                    关闭窗口
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        setWindowState("open");
                        setSelected(false);
                    }}
                >
                    窗口已打开
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        setWindowState("minimized");
                        setSelected(false);
                    }}
                >
                    窗口已最小化
                </Button>
            </div>
            <p role="status">
                窗口状态：{windowState === "closed"
                    ? "关闭"
                    : windowState === "open"
                    ? "打开"
                    : "最小化"}
            </p>
            <Button
                ref={entry}
                variant="outline"
                onClick={() => void openNote()}
            >
                置顶笔记：旅行计划
            </Button>
            {windowState === "open" && (
                <div className="motion-lab-window">
                    <h2>笔记窗口</h2>
                    {selected
                        ? (
                            <div ref={note} className="motion-lab-object">
                                <Button ref={title} variant="ghost">
                                    旅行计划
                                </Button>
                                <p>这是一篇从刊头打开的笔记。</p>
                            </div>
                        )
                        : <p>窗口已打开，尚未选择该笔记。</p>}
                </div>
            )}
        </Section>
    );
}

export default function MotionLab() {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [reduced, setReduced] = useState(() =>
        matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const objects = useRef(new Map<string, HTMLElement>());
    const triggers = useRef(new Map<string, HTMLElement>());
    const close = useRef<HTMLButtonElement>(null);
    const supported = supportsSharedElementTransition();

    useEffect(() => {
        const media = matchMedia("(prefers-reduced-motion: reduce)");
        const change = () => setReduced(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);

    async function changeCard(id: string, open: boolean) {
        if (busy) return;
        const object = objects.current.get(id);
        if (!object) return;
        setBusy(true);
        try {
            await runSharedElementTransition({
                source: object,
                update: () => flushSync(() => setExpanded(open ? id : null)),
                // React retains the same keyed object across states.
                findTarget: () => objects.current.get(id) ?? null,
            });
        } finally {
            flushSync(() => setBusy(false));
            (open ? close.current : triggers.current.get(id))?.focus({
                preventScroll: true,
            });
        }
    }

    useEscapeLayer(expanded !== null, () => {
        if (expanded) void changeCard(expanded, false);
    });
    let mode = "instant (unsupported)";
    if (supported) mode = reduced ? "fade (reduced motion)" : "morph";

    return (
        <PageShell archetype="workbench" className="motion-lab-page">
            <PageHeader title="共享元素动效" />
            <Link to="/design-lab">返回设计实验室</Link>
            <Section title="同一对象，不同容器状态">
                <p>
                    打开卡片查看完整内容；关闭或按 Escape 返回。只有当前卡片参与
                    geometry morph，其余内容不做位移或缩放动画。
                </p>
                <p role="status">当前模式：{mode}</p>
                <div className="motion-lab-cards" aria-busy={busy}>
                    {CARDS.map((card) => {
                        const open = expanded === card.id;
                        return (
                            <article
                                key={card.id}
                                ref={(node) => {
                                    if (node) {
                                        objects.current.set(card.id, node);
                                    } else objects.current.delete(card.id);
                                }}
                                className="motion-lab-object"
                                data-expanded={open}
                                hidden={expanded !== null && !open}
                                aria-labelledby={`motion-${card.id}`}
                            >
                                <h2 id={`motion-${card.id}`}>{card.title}</h2>
                                <p>{card.summary}</p>
                                {open
                                    ? (
                                        <>
                                            <Button
                                                ref={close}
                                                variant="outline"
                                                disabled={busy}
                                                onClick={() =>
                                                    void changeCard(
                                                        card.id,
                                                        false,
                                                    )}
                                            >
                                                关闭
                                            </Button>
                                            <div className="motion-lab-detail">
                                                <h3>继续讨论</h3>
                                                <p>
                                                    这是原卡片的完整视图，不是另一份内容。
                                                    展开提供更多阅读空间，收起回到原来的卡片。
                                                </p>
                                                <p>
                                                    此处仅验证动效契约，不连接
                                                    AI 服务，也不改变生产页面。
                                                </p>
                                            </div>
                                        </>
                                    )
                                    : (
                                        <Button
                                            ref={(node) => {
                                                if (node) {
                                                    triggers.current.set(
                                                        card.id,
                                                        node,
                                                    );
                                                } else {triggers.current.delete(
                                                        card.id,
                                                    );}
                                            }}
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                                void changeCard(card.id, true)}
                                        >
                                            打开{card.title}
                                        </Button>
                                    )}
                            </article>
                        );
                    })}
                </div>
            </Section>
            <FolderReference />
            <NotesReference />
        </PageShell>
    );
}
