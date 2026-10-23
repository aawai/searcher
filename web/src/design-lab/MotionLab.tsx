import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { Section } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { useEscapeLayer } from "../components/ui/escape-layer-stack.tsx";
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

export default function MotionLab() {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [reduced, setReduced] = useState(() =>
        matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const objects = useRef(new Map<string, HTMLElement>());
    const triggers = useRef(new Map<string, HTMLElement>());
    const close = useRef<HTMLButtonElement>(null);
    const running = useRef<ViewTransition | null>(null);
    const supported = typeof document.startViewTransition === "function";

    useEffect(() => {
        const media = matchMedia("(prefers-reduced-motion: reduce)");
        const change = () => setReduced(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);

    useEffect(() => () => {
        running.current?.skipTransition();
        document.documentElement.classList.remove("motion-lab-transition");
    }, []);

    async function changeCard(id: string, open: boolean) {
        if (busy) return;
        const focusTarget = () => {
            (open ? close.current : triggers.current.get(id))?.focus({
                preventScroll: true,
            });
        };
        if (!supported) {
            flushSync(() => setExpanded(open ? id : null));
            focusTarget();
            return;
        }
        const object = objects.current.get(id);
        if (!object) return;
        const root = document.documentElement;
        const name = `motion-card-${crypto.randomUUID()}`;
        object.style.viewTransitionName = name;
        root.classList.add("motion-lab-transition");
        setBusy(true);
        const transition = document.startViewTransition(() => {
            flushSync(() => setExpanded(open ? id : null));
            // React retains the same keyed object across states.
            objects.current.get(id)!.style.viewTransitionName = name;
        });
        running.current = transition;
        try {
            await transition.finished;
        } finally {
            object.style.removeProperty("view-transition-name");
            root.classList.remove("motion-lab-transition");
            running.current = null;
            flushSync(() => setBusy(false));
            focusTarget();
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
        </PageShell>
    );
}
