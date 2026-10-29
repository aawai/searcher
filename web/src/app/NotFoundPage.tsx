import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { ActionGroup } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { routes } from "./routes.ts";
import type { PageHost } from "./page-host.tsx";
import "./narrow-form.css";

export function NotFoundPage(
    { parent }: { parent?: { label: string; to: string } },
) {
    const location = useLocation();
    return <NotFoundContent parent={parent} location={location} Link={Link} />;
}

export function NotFoundContent(
    { parent, location, Link }: {
        parent?: { label: string; to: string };
        location: PageHost["location"];
        Link: PageHost["Link"];
    },
) {
    const { pathname } = location;
    const workspace = parent ??
        (pathname === routes.settings() ||
                pathname.startsWith(`${routes.settings()}/`)
            ? { label: "设置", to: routes.settings() }
            : pathname === routes.admin() ||
                    pathname.startsWith(`${routes.admin()}/`)
            ? { label: "管理后台", to: routes.admin() }
            : undefined);
    return (
        <PageShell archetype="utility">
            <div className="narrow-form">
                <PageHeader
                    title="页面不存在"
                    description="链接可能有误，或页面已被移除。"
                />
                <ActionGroup>
                    <Button
                        variant="default"
                        render={<Link to={routes.home} viewTransition />}
                    >
                        返回首页
                    </Button>
                    {workspace && (
                        <Button
                            variant="outline"
                            render={<Link to={workspace.to} viewTransition />}
                        >
                            返回{workspace.label}
                        </Button>
                    )}
                </ActionGroup>
            </div>
        </PageShell>
    );
}
