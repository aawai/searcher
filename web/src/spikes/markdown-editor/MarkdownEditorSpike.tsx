import { useEffect, useRef, useState } from "react";
import { PageShell } from "../../components/searcher/PageShell.tsx";
import { PageHeader } from "../../components/searcher/PageHeader.tsx";
import { ActionGroup, Section } from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import type { SpikeEditor } from "./runtime.ts";
import "../../components/searcher/markdown.css";
import "./spike.css";

const initialMarkdown = `# Markdown 编辑验证

中文输入、**加粗**、*斜体*、~~删除线~~与 \`inline code\`。

## 二级标题

### 三级标题

- [ ] 待办
- [x] 已完成

| 名称 | 内容 |
| --- | --- |
| 笔记 | 保留表格 |

> 引用与 [链接](https://example.com)。

\`\`\`ts
const document = "Markdown";
\`\`\`

<!-- pagebreak -->

分页符之后的正文。
`;

function EditorSurface({ name }: { name: string }) {
    const root = useRef<HTMLDivElement>(null);
    const editor = useRef<SpikeEditor | null>(null);
    const [markdown, setMarkdown] = useState(initialMarkdown);
    const [source, setSource] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [changes, setChanges] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let instance: SpikeEditor | null = null;
        const host = document.createElement("div");
        root.current!.append(host);
        import("./runtime.ts").then(async ({ createSpikeEditor }) => {
            if (cancelled) return;
            instance = await createSpikeEditor(
                host,
                initialMarkdown,
                (value) => {
                    if (cancelled) return;
                    setMarkdown(value);
                    setChanges((count) => count + 1);
                },
            );
            if (cancelled) {
                await instance.destroy();
                return;
            }
            editor.current = instance;
            instance.view.dom.setAttribute("aria-label", `${name}正文`);
            instance.view.dom.setAttribute("role", "textbox");
            instance.view.dom.setAttribute("aria-multiline", "true");
            setMarkdown(instance.getMarkdown());
            setReady(true);
        }).catch((reason: unknown) => {
            if (!cancelled) setError(String(reason));
        });
        return () => {
            cancelled = true;
            editor.current = null;
            host.remove();
            if (instance) void instance.destroy();
        };
    }, [name]);

    function toggleSource() {
        if (!editor.current || editor.current.view.composing) return;
        try {
            if (source) editor.current.replace(markdown);
            else setMarkdown(editor.current.getMarkdown());
            setError("");
            setSource(!source);
        } catch (reason) {
            setError(String(reason));
        }
    }

    return (
        <Section title={name} className="markdown-spike-editor">
            <ActionGroup>
                <Button
                    variant="outline"
                    disabled={!ready}
                    onClick={toggleSource}
                >
                    {source ? "返回 Live Preview" : "源码模式"}
                </Button>
                <Button
                    variant="outline"
                    disabled={!ready || source}
                    onClick={() => editor.current?.undo()}
                >
                    撤销
                </Button>
                <Button
                    variant="outline"
                    disabled={!ready || source}
                    onClick={() => editor.current?.redo()}
                >
                    重做
                </Button>
            </ActionGroup>
            <p role="status">
                {ready
                    ? `编辑器就绪；正文变化 ${changes} 次`
                    : "正在加载编辑器"}
            </p>
            {error && <p role="alert">{error}</p>}
            <div
                ref={root}
                hidden={source}
                className="markdown markdown-spike-rich"
            />
            {source && (
                <Textarea
                    aria-label={`${name}源码`}
                    value={markdown}
                    rows={18}
                    onChange={(event) => setMarkdown(event.target.value)}
                />
            )}
            <details>
                <summary>Canonical Markdown</summary>
                <pre data-testid={`${name}-canonical`}>{markdown}</pre>
            </details>
        </Section>
    );
}

export default function MarkdownEditorSpike() {
    const [open, setOpen] = useState(false);
    const [second, setSecond] = useState(false);
    return (
        <PageShell archetype="utility" className="markdown-spike">
            <PageHeader
                items={[{ label: "Design Lab", to: "/design-lab" }, {
                    label: "M0A",
                }]}
                title="Shared Editor Feasibility Spike"
                description="仅验证编辑技术；不保存到服务器，不替换便签，也不实现 Documents 工作区。"
            />
            <ActionGroup>
                <Button onClick={() => setOpen(!open)}>
                    {open ? "卸载编辑器" : "打开编辑器"}
                </Button>
                <Button
                    variant="outline"
                    disabled={!open}
                    onClick={() => setSecond(!second)}
                >
                    {second ? "关闭第二实例" : "打开第二实例"}
                </Button>
            </ActionGroup>
            {open && <EditorSurface name="实例 A" />}
            {open && second && <EditorSurface name="实例 B" />}
        </PageShell>
    );
}
