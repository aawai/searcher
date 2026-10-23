import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
    runSharedElementTransition,
    SHARED_ELEMENT_CLASS,
    type SharedElementEnv,
} from "./shared-element.ts";

type Styled = {
    style: { viewTransitionName: string } & Record<string, unknown>;
};

function element(): HTMLElement & Styled {
    const style = {
        viewTransitionName: "",
        removeProperty(name: string) {
            if (name === "view-transition-name") this.viewTransitionName = "";
        },
    };
    return { style } as unknown as HTMLElement & Styled;
}

function fakeEnv(supported: boolean) {
    const classes = new Set<string>();
    const log: string[] = [];
    let counter = 0;
    let finish: () => void = () => {};
    const env: SharedElementEnv = {
        root: {
            classList: {
                add: (name: string) => void classes.add(name),
                remove: (name: string) => void classes.delete(name),
            },
        } as unknown as HTMLElement,
        uniqueId: () => `id-${++counter}`,
        waitForElement: (find) => Promise.resolve(find()),
        startViewTransition: supported
            ? (callback) => {
                log.push("transition-start");
                const updated = Promise.resolve().then(callback);
                const finished = updated.then(() =>
                    new Promise<void>((resolve) => {
                        finish = resolve;
                    })
                );
                return { finished };
            }
            : undefined,
    };
    return { env, classes, log, finish: () => finish() };
}

Deno.test("shared element: without the API the update is applied at once, no names, no root class", async () => {
    const { env, classes } = fakeEnv(false);
    const source = element();
    const target = element();
    let applied = false;
    const result = await runSharedElementTransition({
        source,
        update: () => {
            applied = true;
        },
        findTarget: () => target,
    }, env);
    assertEquals(result, "instant");
    assert(applied);
    assertEquals(source.style.viewTransitionName, "");
    assertEquals(target.style.viewTransitionName, "");
    assertEquals(classes.size, 0);
});

Deno.test("shared element: exactly one element holds the name at the snapshot, then everything is cleaned up", async () => {
    const { env, classes, finish, log } = fakeEnv(true);
    const source = element();
    const target = element();
    const namesDuringUpdate: string[] = [];
    const run = runSharedElementTransition({
        source,
        update: () => {
            log.push("update");
            // Old state is snapshotted before the callback; source holds the name.
            namesDuringUpdate.push(source.style.viewTransitionName);
            assert(classes.has(SHARED_ELEMENT_CLASS));
        },
        findTarget: () => target,
    }, env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Update ran inside the transition, and the new target took over the name.
    assertEquals(log, ["transition-start", "update"]);
    assertNotEquals(namesDuringUpdate[0], "");
    assertEquals(target.style.viewTransitionName, namesDuringUpdate[0]);
    assertEquals(source.style.viewTransitionName, "");
    finish();
    assertEquals(await run, "morph");
    assertEquals(target.style.viewTransitionName, "");
    assertEquals(classes.size, 0);
});

Deno.test("shared element: every transition gets its own unique name", async () => {
    const names: string[] = [];
    for (let index = 0; index < 2; index++) {
        const { env, finish } = fakeEnv(true);
        const source = element();
        const target = element();
        const run = runSharedElementTransition({
            source,
            update: () => {
                names.push(source.style.viewTransitionName);
            },
            findTarget: () => target,
        }, { ...env, uniqueId: () => `run-${index}-${crypto.randomUUID()}` });
        await new Promise((resolve) => setTimeout(resolve, 0));
        finish();
        await run;
    }
    assertNotEquals(names[0], names[1]);
});

Deno.test("shared element: the same element can be source and target (in-place state change)", async () => {
    const { env, finish } = fakeEnv(true);
    const object = element();
    const seen: string[] = [];
    const run = runSharedElementTransition({
        source: object,
        update: () => {
            seen.push(object.style.viewTransitionName);
        },
        findTarget: () => object,
    }, env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEquals(object.style.viewTransitionName, seen[0]);
    finish();
    await run;
    assertEquals(object.style.viewTransitionName, "");
});

Deno.test("shared element: a failed update still cleans up and rejects", async () => {
    const { env, classes } = fakeEnv(true);
    const source = element();
    let failure: unknown;
    try {
        await runSharedElementTransition({
            source,
            update: () => {
                throw new Error("boom");
            },
            findTarget: () => null,
        }, env);
    } catch (error) {
        failure = error;
    }
    assert(failure instanceof Error);
    assertEquals(source.style.viewTransitionName, "");
    assertEquals(classes.size, 0);
});
