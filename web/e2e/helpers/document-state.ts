import type { Page } from "playwright";
import type { DocumentDto } from "../../../src/shared/documents.ts";

/** Poll the real server; Playwright waitForFunction does not await async predicates. */
export async function waitForDocument(
    page: Page,
    id: string,
    accepts: (document: DocumentDto) => boolean,
): Promise<DocumentDto> {
    const deadline = performance.now() + 10_000;
    let latest: DocumentDto | undefined;
    while (performance.now() < deadline) {
        latest = await page.evaluate(async (id) => {
            const response = await fetch(`/api/documents/${id}`);
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data as DocumentDto;
        }, id);
        if (accepts(latest)) return latest;
        await page.evaluate(() => new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
        }));
    }
    throw new Error(`Document ${id} did not converge: version=${latest?.version}, body tail=${latest?.body.slice(-200)}`);
}
