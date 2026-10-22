import type * as React from "react";

function Table({ className, ...props }: React.ComponentProps<"table">) {
    return (
        <div
            data-slot="table-container"
            className="relative w-full overflow-x-auto"
        >
            <table data-slot="table" className={className} {...props} />
        </div>
    );
}

function TableHeader(props: React.ComponentProps<"thead">) {
    return <thead data-slot="table-header" {...props} />;
}

function TableBody(props: React.ComponentProps<"tbody">) {
    return <tbody data-slot="table-body" {...props} />;
}

function TableFooter(props: React.ComponentProps<"tfoot">) {
    return <tfoot data-slot="table-footer" {...props} />;
}

function TableRow(props: React.ComponentProps<"tr">) {
    return <tr data-slot="table-row" {...props} />;
}

function TableHead(props: React.ComponentProps<"th">) {
    return <th data-slot="table-head" {...props} />;
}

function TableCell(props: React.ComponentProps<"td">) {
    return <td data-slot="table-cell" {...props} />;
}

function TableCaption(props: React.ComponentProps<"caption">) {
    return <caption data-slot="table-caption" {...props} />;
}

export {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
};
