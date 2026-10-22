import React, { type ReactNode } from "react";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { LoadingState } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";

export interface RouteErrorBoundaryProps {
    children: ReactNode;
    locationKey?: string;
}

interface RouteErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    lastLocationKey?: string;
}

export class RouteErrorBoundary extends React.Component<
    RouteErrorBoundaryProps,
    RouteErrorBoundaryState
> {
    constructor(props: RouteErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            lastLocationKey: props.locationKey,
        };
    }

    static getDerivedStateFromError(
        error: Error,
    ): Partial<RouteErrorBoundaryState> {
        return { hasError: true, error };
    }

    static getDerivedStateFromProps(
        props: RouteErrorBoundaryProps,
        state: RouteErrorBoundaryState,
    ): Partial<RouteErrorBoundaryState> | null {
        if (state.lastLocationKey !== props.locationKey) {
            return {
                hasError: false,
                error: null,
                lastLocationKey: props.locationKey,
            };
        }
        return null;
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Route chunk loading failed:", error, errorInfo);
    }
    handleRetry = () => {
        globalThis.location.reload();
    };

    override render() {
        if (this.state.hasError) {
            return (
                <PageShell
                    archetype="utility"
                    role="alert"
                    aria-live="assertive"
                    data-testid="route-error-boundary"
                >
                    <PageHeader
                        title="页面加载失败"
                        description="网络不稳定或应用已更新，此页面的模块未能加载。"
                        actions={
                            <>
                                <Button
                                    type="button"
                                    variant="default"
                                    onClick={this.handleRetry}
                                    data-testid="route-retry-button"
                                >
                                    重新加载页面
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        globalThis.location.href = "/";
                                    }}
                                >
                                    返回首页
                                </Button>
                            </>
                        }
                    />
                </PageShell>
            );
        }

        return this.props.children;
    }
}

export function RouteLoadingFallback() {
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label="页面内容加载中…"
            data-testid="route-loading-fallback"
        >
            <LoadingState announce={false}>页面加载中…</LoadingState>
        </div>
    );
}
