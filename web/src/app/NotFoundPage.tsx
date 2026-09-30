import { PageShell } from "../components/searcher/PageShell.tsx";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { routes } from "./routes.ts";

export function NotFoundPage(
    { parent }: { parent?: { label: string; to: string } },
) {
    const { pathname } = useLocation();
    const workspace = parent ??
        (pathname === routes.settings() ||
                pathname.startsWith(`${routes.settings()}/`)
            ? { label: "设置", to: routes.settings() }
            : pathname === routes.admin() ||
                    pathname.startsWith(`${routes.admin()}/`)
            ? { label: "管理后台", to: routes.admin() }
            : undefined);
    return (
        <PageShell archetype="utility" className="page">
            <PageHeader
                items={[
                    { label: "首页", to: routes.home },
                    ...(workspace ? [workspace] : []),
                    { label: "页面不存在" },
                ]}
                title="页面不存在"
                description="当前页面不存在，请检查地址或返回上层页面。"
            />
            <div className="space-y-4">
                <p className="text-sm font-medium text-[var(--muted)]">404</p>

                <div className="flex flex-wrap gap-2">
                    <Button render={<Link to={routes.home} />}>返回首页</Button>
                    {workspace && (
                        <Button render={<Link to={workspace.to} />}>
                            返回{workspace.label}
                        </Button>
                    )}
                </div>
            </div>
        </PageShell>
    );
}
