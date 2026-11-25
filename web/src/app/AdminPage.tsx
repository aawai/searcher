import { Link, useLocation } from "react-router-dom";
import { adminTab, routes } from "./routes.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { EmptyState } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { AdminShell } from "./AdminShell.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import { AdminOverview } from "./AdminOverview.tsx";
import { AdminSystemSettings } from "./AdminSystemSettings.tsx";
import { AdminBackupRestore } from "./AdminBackupRestore.tsx";
import { AdminUsersView } from "../features/admin/AdminUsersView.tsx";
import { AdminAuditView } from "../features/admin/AdminAuditView.tsx";
import { useAppState } from "./state.tsx";
import "./admin.css";

export function AdminPage() {
    const { user: currentUser } = useAppState();
    const location = useLocation();
    const activeTab = adminTab(location.pathname);

    if (!activeTab) {
        return (
            <NotFoundPage parent={{ label: "管理后台", to: routes.admin() }} />
        );
    }

    if (currentUser?.role !== "admin") {
        return (
            <PageShell archetype="management">
                <PageHeader title="管理后台" />
                <EmptyState
                    illustration="auth-or-error"
                    title="无权访问"
                    description="管理后台仅限管理员访问。"
                    action={currentUser
                        ? (
                            <Button
                                variant="default"
                                render={<Link to={routes.home} />}
                            >
                                返回首页
                            </Button>
                        )
                        : (
                            <Button
                                variant="default"
                                render={<Link to={routes.login} />}
                            >
                                前往登录
                            </Button>
                        )}
                />
            </PageShell>
        );
    }

    return (
        <AdminShell activeTab={activeTab}>
            {activeTab === "overview" && <AdminOverview />}
            {activeTab === "users" && <AdminUsersView />}
            {activeTab === "settings" && <AdminSystemSettings />}
            {activeTab === "audit" && <AdminAuditView />}
            {activeTab === "backup" && <AdminBackupRestore />}
        </AdminShell>
    );
}
