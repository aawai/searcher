import { useReducer, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { ActionGroup, Section } from "../../components/searcher/semantic.tsx";
import { DesktopCanvas, useDesktopSafeRect } from "./DesktopCanvas.tsx";
import { DesktopWindow } from "./DesktopWindow.tsx";
import { desktopReducer, initialDesktopState } from "./desktop-state.ts";
import type { WindowKind } from "./desktop-geometry.ts";

const titles = { apps: "Apps 示例", notes: "Notes 示例", note: "Note 示例" };

export function DesktopDemo() {
    const [state, dispatch] = useReducer(desktopReducer, initialDesktopState);
    const sequence = useRef(0);
    const rect = useDesktopSafeRect();
    return (
        <Section
            title="Desktop Window Manager"
            description="独立窗口引擎示例；不连接业务数据，不保存窗口状态。仅标题栏启动拖动，桌面支持八向调整尺寸。"
        >
            <ActionGroup>
                {(Object.keys(titles) as WindowKind[]).map((kind) => (
                    <Button
                        key={kind}
                        variant="outline"
                        onClick={() =>
                            dispatch({
                                type: "OPEN",
                                id: `demo-${++sequence.current}`,
                                kind,
                                rect,
                            })}
                    >
                        打开 {titles[kind]}
                    </Button>
                ))}
                {state.windows.filter((window) => window.mode === "minimized")
                    .map((window) => (
                        <Button
                            key={window.id}
                            variant="ghost"
                            onClick={() =>
                                dispatch({
                                    type: "RESTORE",
                                    id: window.id,
                                    rect,
                                })}
                        >
                            恢复 {titles[window.kind]} {window.id}
                        </Button>
                    ))}
            </ActionGroup>
            <DesktopCanvas rect={rect} dispatch={dispatch}>
                {state.windows.map((window) => (
                    <DesktopWindow
                        key={window.id}
                        window={window}
                        title={`${titles[window.kind]} ${window.id}`}
                        rect={rect}
                        active={state.activeId === window.id}
                        dispatch={dispatch}
                    >
                        <DemoContent />
                    </DesktopWindow>
                ))}
            </DesktopCanvas>
        </Section>
    );
}

function DemoContent() {
    const [count, setCount] = useState(0);
    return (
        <div className="desktop-demo-content">
            <Input aria-label="窗口示例输入" placeholder="输入不会拖动窗口" />
            <Button variant="outline" onClick={() => setCount(count + 1)}>
                示例按钮 {count}
            </Button>
            <p>
                窗口内容独立交互。可同时打开多个窗口验证焦点、层级、最小化和恢复。
            </p>
        </div>
    );
}
