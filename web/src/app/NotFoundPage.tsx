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
        <PageShell archetype="utility">
            <PageHeader
                title="页面不存在"
                actions={
                    <>
                        <Button
                            variant="default"
                            render={<Link to={routes.home} />}
                        >
                            返回首页
                        </Button>
                        {workspace && (
                            <Button
                                variant="outline"
                                render={<Link to={workspace.to} />}
                            >
                                返回{workspace.label}
                            </Button>
                        )}
                    </>
                }
            />
        </PageShell>
    );
}
