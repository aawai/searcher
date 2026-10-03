import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { tableBlockConfig } from "@milkdown/kit/component/table-block";
import {
    bulletListAttr,
    imageSchema,
    orderedListAttr,
} from "@milkdown/kit/preset/commonmark";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import { Button } from "../ui/button.tsx";
import "./note-milkdown-editor.css";

export interface NoteMilkdownEditorHandle {
    getMarkdown(): string;
    replaceMarkdown(markdown: string): void;
    focus(): void;
}
export interface NoteMilkdownEditorProps {
    initialMarkdown: string;
    onMarkdownChange(markdown: string): void;
    onEditorBlur?(): void;
    disabled?: boolean;
}

export const NoteMilkdownEditor = forwardRef<
    NoteMilkdownEditorHandle,
    NoteMilkdownEditorProps
>(
    function NoteMilkdownEditor(props, ref) {
        const hostRef = useRef<HTMLDivElement>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const instanceRef = useRef<Crepe | null>(null);
        const sourceRef = useRef(props.initialMarkdown);
        const editedRef = useRef(false);
        const replacingRef = useRef(false);
        const callbacksRef = useRef(props);
        callbacksRef.current = props;
        const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
            undefined,
        );
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState("");
        const [attempt, setAttempt] = useState(0);

        function getMarkdown() {
            if (!editedRef.current || !instanceRef.current) {
                return sourceRef.current;
            }
            const markdown = instanceRef.current.getMarkdown();
            if (markdown !== sourceRef.current) {
                sourceRef.current = markdown;
                callbacksRef.current.onMarkdownChange(markdown);
            }
            return markdown;
        }
        function replaceMarkdown(markdown: string) {
            sourceRef.current = markdown;
            editedRef.current = false;
            const crepe = instanceRef.current;
            if (!crepe) return;
            replacingRef.current = true;
            try {
                // The synchronous replacement transaction is excluded below;
                // selection-only updates never publish normalized Markdown.
                crepe.editor.action(replaceAll(markdown));
            } finally {
                replacingRef.current = false;
            }
        }
        useImperativeHandle(ref, () => ({
            getMarkdown,
            replaceMarkdown,
            focus: () =>
                instanceRef.current?.editor.ctx.get(editorViewCtx).focus(),
        }), []);

        useEffect(() => {
            instanceRef.current?.setReadonly(Boolean(props.disabled));
        }, [props.disabled]);

        useEffect(() => {
            const host = hostRef.current;
            if (!host) return;
            let disposed = false;
            let ready = false;
            setLoading(true);
            setError("");
            // Each StrictMode setup owns a distinct root; destroying an old
            // asynchronous setup cannot clear the current editor's DOM.
            const root = document.createElement("div");
            host.append(root);
            const initial = sourceRef.current;
            // Crepe list NodeViews wrap native li elements. Give the wrapper
            // the list-item role, without exposing a duplicate inner item.
            const labelLists = () => {
                const role = (element: Element, value: string) => {
                    if (element.getAttribute("role") !== value) {
                        element.setAttribute("role", value);
                    }
                };
                root.querySelectorAll(".milkdown-list-item-block").forEach(
                    (item) => {
                        role(item, "listitem");
                        const inner = item.querySelector(":scope > li");
                        if (inner) role(inner, "presentation");
                    },
                );
            };
            const listObserver = new MutationObserver(labelLists);
            listObserver.observe(root, { childList: true, subtree: true });
            const crepe = new Crepe({
                root,
                defaultValue: initial,
                features: {
                    [Crepe.Feature.Cursor]: true,
                    [Crepe.Feature.ListItem]: true,
                    [Crepe.Feature.LinkTooltip]: true,
                    [Crepe.Feature.BlockEdit]: true,
                    [Crepe.Feature.Toolbar]: true,
                    [Crepe.Feature.Placeholder]: true,
                    [Crepe.Feature.CodeMirror]: true,
                    [Crepe.Feature.Table]: true,
                    [Crepe.Feature.ImageBlock]: false,
                    [Crepe.Feature.Latex]: false,
                    [Crepe.Feature.AI]: false,
                    [Crepe.Feature.TopBar]: false,
                },
                featureConfigs: {
                    [Crepe.Feature.Placeholder]: {
                        text: "输入正文，使用 / 插入内容…",
                        mode: "block",
                    },
                    [Crepe.Feature.Toolbar]: {
                        boldLabel: "粗体",
                        italicLabel: "斜体",
                        strikethroughLabel: "删除线",
                        codeLabel: "行内代码",
                        linkLabel: "链接",
                    },
                    [Crepe.Feature.LinkTooltip]: {
                        inputPlaceholder: "输入或粘贴链接…",
                    },
                    [Crepe.Feature.CodeMirror]: {
                        extensions: [CodeMirrorView.contentAttributes.of({
                            "aria-label": "代码块正文",
                            tabindex: "0",
                        })],
                        searchPlaceholder: "搜索语言…",
                        copyText: "复制",
                        noResultText: "无匹配语言",
                        previewToggleText: (previewOnlyMode) =>
                            previewOnlyMode ? "编辑" : "隐藏",
                    },
                    [Crepe.Feature.BlockEdit]: {
                        textGroup: {
                            label: "文本",
                            text: { label: "正文" },
                            h1: { label: "一级标题" },
                            h2: { label: "二级标题" },
                            h3: { label: "三级标题" },
                            h4: { label: "四级标题" },
                            h5: { label: "五级标题" },
                            h6: { label: "六级标题" },
                            quote: { label: "引用" },
                            divider: { label: "分割线" },
                        },
                        listGroup: {
                            label: "列表",
                            bulletList: { label: "无序列表" },
                            orderedList: { label: "有序列表" },
                            taskList: { label: "任务列表" },
                        },
                        advancedGroup: {
                            label: "高级",
                            codeBlock: { label: "代码块" },
                            table: { label: "表格" },
                            image: null,
                            math: null,
                        },
                    },
                },
            });
            crepe.editor.config((ctx) => {
                ctx.set(bulletListAttr.key, () => ({ role: "list" }));
                ctx.set(orderedListAttr.key, () => ({ role: "list" }));
                // MDAST represents an omitted image title as null. Match that
                // canonical shape instead of dropping title-less legacy images.
                ctx.update(imageSchema.key, (factory) => (context) => {
                    const schema = factory(context);
                    return {
                        ...schema,
                        attrs: {
                            ...schema.attrs,
                            title: {
                                ...schema.attrs?.title,
                                validate: "string|null",
                            },
                        },
                    };
                });
                ctx.update(tableBlockConfig.key, (config) => {
                    const labels = {
                        add_row: "添加行",
                        add_col: "添加列",
                        delete_row: "删除行",
                        delete_col: "删除列",
                        align_col_left: "左对齐",
                        align_col_center: "居中对齐",
                        align_col_right: "右对齐",
                        col_drag_handle: "移动列",
                        row_drag_handle: "移动行",
                    };
                    return {
                        ...config,
                        renderButton: (type) => {
                            const icon = config.renderButton(type);
                            const start = icon.indexOf(">");
                            return `${icon.slice(0, start + 1)}<title>${
                                labels[type]
                            }</title>${icon.slice(start + 1)}`;
                        },
                    };
                });
                ctx.update(editorViewOptionsCtx, (options) => ({
                    ...options,
                    attributes: {
                        "aria-label": "便签正文",
                        role: "textbox",
                        "aria-multiline": "true",
                    },
                    editable: () => !callbacksRef.current.disabled,
                }));
            }).use($prose(() =>
                new Plugin({
                    state: {
                        init: () => null,
                        apply: (transaction, value) => {
                            if (
                                ready && !disposed && !replacingRef.current &&
                                transaction.docChanged
                            ) editedRef.current = true;
                            return value;
                        },
                    },
                    view: () => ({
                        update: (view, previous) => {
                            if (
                                ready && !disposed && !replacingRef.current &&
                                !view.state.doc.eq(previous.doc)
                            ) getMarkdown();
                        },
                    }),
                })
            ));
            const creation = crepe.create();
            void creation.then(() => {
                if (disposed) return;
                instanceRef.current = crepe;
                if (sourceRef.current !== initial) {
                    replaceMarkdown(sourceRef.current);
                }
                crepe.setReadonly(Boolean(callbacksRef.current.disabled));
                ready = true;
                setLoading(false);
            }).catch((cause: unknown) => {
                if (disposed) return;
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "无法初始化便签编辑器",
                );
                setLoading(false);
            });
            return () => {
                disposed = true;
                ready = false;
                if (instanceRef.current === crepe) instanceRef.current = null;
                clearTimeout(blurTimer.current);
                listObserver.disconnect();
                root.remove();
                // Wait for create before destroy; Milkdown cannot destroy a
                // half-created editor. Observe cleanup failures explicitly.
                void creation.catch(() => undefined).then(() => crepe.destroy())
                    .catch((cause: unknown) =>
                        console.error("便签编辑器清理失败", cause)
                    );
            };
        }, [attempt]);

        useEffect(() => {
            const escape = (event: KeyboardEvent) => {
                if (event.key !== "Escape" || !instanceRef.current) return;
                const container = containerRef.current;
                const visible = container?.querySelector<HTMLElement>(
                    '.milkdown-slash-menu[data-show="true"], .milkdown-link-edit[data-show="true"], .milkdown-toolbar[data-show="true"]',
                );
                // Slash handles Escape at window capture; link edit handles it
                // on its input. Keep propagation so those owners can dismiss.
                if (visible || event.defaultPrevented) {
                    event.preventDefault();
                    if (visible?.matches(".milkdown-toolbar")) {
                        const view = instanceRef.current.editor.ctx.get(
                            editorViewCtx,
                        );
                        view.dispatch(
                            view.state.tr.setSelection(
                                TextSelection.create(
                                    view.state.doc,
                                    view.state.selection.from,
                                ),
                            ),
                        );
                        view.focus();
                    }
                }
            };
            document.addEventListener("keydown", escape, true);
            return () => document.removeEventListener("keydown", escape, true);
        }, []);

        return (
            <div
                ref={containerRef}
                className={`note-milkdown-editor${
                    loading ? " is-loading" : ""
                }${props.disabled ? " is-disabled" : ""}`}
                aria-busy={loading}
                onBlur={(event) => {
                    if (
                        event.relatedTarget instanceof Node &&
                        containerRef.current?.contains(event.relatedTarget)
                    ) return;
                    clearTimeout(blurTimer.current);
                    blurTimer.current = globalThis.setTimeout(() => {
                        if (
                            instanceRef.current &&
                            !containerRef.current?.contains(
                                document.activeElement,
                            )
                        ) callbacksRef.current.onEditorBlur?.();
                    }, 0);
                }}
            >
                {loading && (
                    <div className="note-milkdown-skeleton" aria-hidden="true">
                        <span className="note-milkdown-skeleton-line" />
                        <span className="note-milkdown-skeleton-line short" />
                    </div>
                )}
                {error && (
                    <div role="alert">
                        便签编辑器加载失败：{error}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAttempt((value) => value + 1)}
                        >
                            重试加载
                        </Button>
                    </div>
                )}
                <div ref={hostRef} className="note-milkdown-host" />
            </div>
        );
    },
);
