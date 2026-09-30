import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "../ui/breadcrumb.tsx";

export function PageHeader(
    { items }: { items: { label: string; to?: string }[] },
) {
    return (
        <header className="mb-4 min-w-0">
            <Breadcrumb aria-label="页面层级">
                <BreadcrumbList>
                    {items.map((item, index) => (
                        <Fragment key={`${item.label}-${index}`}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                {item.to
                                    ? (
                                        <Link
                                            to={item.to}
                                            className="rounded-sm break-words transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
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
        </header>
    );
}
