import { assertEquals } from "@std/assert";
import type { DocumentDto } from "@shared/documents.ts";
import { ApiError } from "../../lib/api.ts";
import {
    createHomeNoteTaskSaver,
    type HomeNoteTaskSaverDeps,
    TASK_SAVE_DEBOUNCE_MS,
} from "./home-note-task-saver.ts";

function paperFixture(overrides: Partial<DocumentDto> = {}): DocumentDto {
    return {
        id: "p1",
        title: null,
        displayTitle: "笔记",
        snippet: "",
        notebookId: null,
        isFavorite: false,
        color: "paper",
        isHomeFixed: true,
        homeSortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
        body: "",
        version: 1,
        ...overrides,
    };
}

interface Harness {
    deps: HomeNoteTaskSaverDeps;
    saves: Array<{ version: number; body: string }>;
    shown: Array<{ id: string; body: string }>;
    rendered: DocumentDto[];
    conflicts: DocumentDto[];
    failures: unknown[];
    delays: number[];
    inFlight: Array<{
        resolve: (document: DocumentDto) => void;
        reject: (error: unknown) => void;
    }>;
    runTimers: () => void;
}

function harness(): Harness {
    const saves: Harness["saves"] = [];
    const shown: Harness["shown"] = [];
    const rendered: Harness["rendered"] = [];
    const conflicts: Harness["conflicts"] = [];
    const failures: Harness["failures"] = [];
    const delays: Harness["delays"] = [];
    const inFlight: Harness["inFlight"] = [];
    const timers: Array<{ run: () => void; cancelled: boolean }> = [];
    const deps: HomeNoteTaskSaverDeps = {
        save(document, body) {
            saves.push({ version: document.version, body });
            const { promise, resolve, reject } = Promise.withResolvers<
                DocumentDto
            >();
            inFlight.push({ resolve, reject });
            return promise;
        },
        render: (document) => rendered.push(document),
        show: (id, body) => shown.push({ id, body }),
        conflict: (latest) => conflicts.push(latest),
        failed: (error) => failures.push(error),
        schedule(run, delayMs) {
            delays.push(delayMs);
            const timer = { run, cancelled: false };
            timers.push(timer);
            return () => {
                timer.cancelled = true;
            };
        },
    };
    return {
        deps,
        saves,
        shown,
        rendered,
        conflicts,
        failures,
        delays,
        inFlight,
        runTimers() {
            for (const timer of timers.splice(0)) {
                if (!timer.cancelled) timer.run();
            }
        },
    };
}

function conflictError(latest: DocumentDto): ApiError {
    return new ApiError(409, "version conflict", latest);
}

Deno.test("toggle shows the change at once and sends one PATCH after the debounce", () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    assertEquals(saver.toggle(paper, 0, true), true);
    assertEquals(h.shown, [{ id: "p1", body: "- [x] a\n- [ ] b\n" }]);
    assertEquals(h.saves, []);
    assertEquals(h.delays, [TASK_SAVE_DEBOUNCE_MS]);

    h.runTimers();
    assertEquals(h.saves, [{ version: 1, body: "- [x] a\n- [ ] b\n" }]);
});

Deno.test("toggles within the debounce window coalesce into one PATCH", () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 0, true);
    saver.toggle(paper, 1, true);
    saver.toggle(paper, 0, false);
    h.runTimers();

    assertEquals(h.saves, [{ version: 1, body: "- [ ] a\n- [x] b\n" }]);
});

Deno.test("a successful save renders the server document and later toggles use its version", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 0, true);
    h.runTimers();
    const saved = paperFixture({ body: "- [x] a\n- [ ] b\n", version: 2 });
    h.inFlight[0].resolve(saved);
    await Promise.resolve();
    assertEquals(h.rendered.at(-1), saved);

    saver.toggle(saved, 1, true);
    h.runTimers();
    assertEquals(h.saves[1], { version: 2, body: "- [x] a\n- [x] b\n" });
});

Deno.test("a 409 whose target row is unchanged replays the toggles on the latest body and retries once", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 0, true);
    h.runTimers();
    const latest = paperFixture({
        body: "- [ ] a\n- [ ] b\nnew line\n",
        version: 2,
    });
    h.inFlight[0].reject(conflictError(latest));
    await Promise.resolve();

    assertEquals(h.conflicts, []);
    assertEquals(h.saves[1], {
        version: 2,
        body: "- [x] a\n- [ ] b\nnew line\n",
    });
    const saved = paperFixture({
        body: "- [x] a\n- [ ] b\nnew line\n",
        version: 3,
    });
    h.inFlight[1].resolve(saved);
    await Promise.resolve();
    assertEquals(h.rendered.at(-1), saved);
});

Deno.test("a 409 whose target row changed rolls back to the latest server state and reports a conflict", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 1, true);
    h.runTimers();
    const latest = paperFixture({
        body: "- [ ] a\n- [ ] renamed\n",
        version: 2,
    });
    h.inFlight[0].reject(conflictError(latest));
    await Promise.resolve();

    assertEquals(h.saves.length, 1);
    assertEquals(h.rendered.at(-1), latest);
    assertEquals(h.conflicts, [latest]);
});

Deno.test("a second 409 after the retry reports a conflict instead of looping", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 0, true);
    h.runTimers();
    const first = paperFixture({ body: "- [ ] a\n- [ ] b\n", version: 2 });
    h.inFlight[0].reject(conflictError(first));
    await Promise.resolve();
    const second = paperFixture({ body: "- [ ] a\n- [ ] b\n", version: 3 });
    h.inFlight[1].reject(conflictError(second));
    await Promise.resolve();

    assertEquals(h.saves.length, 2);
    assertEquals(h.conflicts, [second]);
    assertEquals(h.rendered.at(-1), second);
});

Deno.test("toggles made while a PATCH is in flight are sent after it settles, on the new version", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n- [ ] b\n" });

    saver.toggle(paper, 0, true);
    h.runTimers();
    saver.toggle(paper, 1, true);
    h.runTimers();
    assertEquals(h.saves.length, 1);

    h.inFlight[0].resolve(
        paperFixture({ body: "- [x] a\n- [ ] b\n", version: 2 }),
    );
    await Promise.resolve();
    assertEquals(h.saves[1], { version: 2, body: "- [x] a\n- [x] b\n" });
});

Deno.test("a non-conflict failure rolls the card back to the last server state", async () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);
    const paper = paperFixture({ body: "- [ ] a\n" });

    saver.toggle(paper, 0, true);
    h.runTimers();
    const failure = new ApiError(500, "boom");
    h.inFlight[0].reject(failure);
    await Promise.resolve();

    assertEquals(h.rendered.at(-1), paper);
    assertEquals(h.failures, [failure]);
    assertEquals(h.conflicts, []);
});

Deno.test("toggle refuses an index that is not a task and leaves the view alone", () => {
    const h = harness();
    const saver = createHomeNoteTaskSaver(h.deps);

    assertEquals(saver.toggle(paperFixture({ body: "plain" }), 0, true), false);
    assertEquals(h.shown, []);
    assertEquals(h.delays, []);
});
