import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "../ui/breadcrumb.tsx";
import { ActionGroup } from "./semantic.tsx";

export function PageHeader(
    { items = [], title, titleLevel = 1, description, actions, navigation }: {
        titleLevel?: 1 | 2;
        /** Breadcrumbs only for direct-entry pages three or more levels deep. */
        items?: { label: string; to?: string }[];
        title?: string;
        description?: string;
        actions?: ReactNode;
        navigation?: ReactNode;
    },
) {
    const Title = titleLevel === 1 ? "h1" : "h2";
    return (
        <header className="page-header">
            {items.length > 0 && (
                <Breadcrumb aria-label="页面层级">
                    <BreadcrumbList>
                        {items.map((item, index) => (
                            <Fragment key={item.to ?? item.label}>
                                {index > 0 && <BreadcrumbSeparator />}
                                <BreadcrumbItem>
                                    {item.to
                                        ? (
                                            <Link
                                                to={item.to}
                                                className="page-breadcrumb-link"
                                            >
                                                {item.label}
                                            </Link>
                                        )
                                        : (
                                            <BreadcrumbPage>
                                                {item.label}
                                            </BreadcrumbPage>
                                        )}
                                </BreadcrumbItem>
                            </Fragment>
                        ))}
                    </BreadcrumbList>
                </Breadcrumb>
            )}
            {(title || actions) && (
                <div className="page-header-main">
                    <div>
                        {title && <Title className="page-title">{title}</Title>}
                        {description && (
                            <p className="page-description">{description}</p>
                        )}
                    </div>
                    {actions && <ActionGroup>{actions}</ActionGroup>}
                </div>
            )}
            {navigation}
        </header>
    );
}
