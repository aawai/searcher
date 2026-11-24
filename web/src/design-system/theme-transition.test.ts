import { assert, assertEquals } from "@std/assert";
import {
    runThemeIrisTransition,
    THEME_IRIS_CLASS,
    type ThemeTransitionEnv,
} from "./theme-transition.ts";

function createClassList() {
    const set = new Set<string>();
    return {
        set,
        add(token: string) {
            set.add(token);
        },
        remove(token: string) {
            set.delete(token);
        },
        contains(token: string) {
            return set.has(token);
        },
    };
}

Deno.test("runThemeIrisTransition: falls back to instant synchronous switch when unsupported or under reduced motion", async () => {
    const calls: string[] = [];
    const rootClass = createClassList();
    const baseEnv: ThemeTransitionEnv = {
        root: { classList: rootClass } as unknown as HTMLElement,
        reducedMotion: false,
        viewportWidth: 1440,
        viewportHeight: 900,
        startViewTransition: undefined,
        animateRoot: () => calls.push("animate"),
        dispatchSync: () => calls.push("sync"),
        flush: (fn) => fn(),
    };

    const unsupported = await runThemeIrisTransition(
        null,
        () => calls.push("apply"),
        baseEnv,
    );
    assertEquals(unsupported, "instant");
    assertEquals(calls, ["apply", "sync"]);
    assertEquals(rootClass.contains(THEME_IRIS_CLASS), false);

    calls.length = 0;
    const reduced = await runThemeIrisTransition(
        null,
        () => calls.push("apply"),
        {
            ...baseEnv,
            reducedMotion: true,
            startViewTransition: (update) => {
                update();
                return {
                    ready: Promise.resolve(),
                    finished: Promise.resolve(),
                };
            },
        },
    );
    assertEquals(reduced, "instant");
    assertEquals(calls, ["apply", "sync"]);
});

Deno.test("runThemeIrisTransition: runs radial clip-path animation, flushes sync before snapshot, and cleans root class on double click", async () => {
    const rootClass = createClassList();
    const order: string[] = [];
    const animations: Array<{
        keyframes: Keyframe[];
        options: KeyframeAnimationOptions;
    }> = [];

    const origin = {
        getBoundingClientRect: () => ({
            left: 1300,
            top: 12,
            width: 36,
            height: 36,
        }),
    } as unknown as HTMLElement;

    const ready1 = Promise.withResolvers<void>();
    const fin1 = Promise.withResolvers<void>();
    const ready2 = Promise.withResolvers<void>();
    const fin2 = Promise.withResolvers<void>();
    let count = 0;

    const env: ThemeTransitionEnv = {
        root: { classList: rootClass } as unknown as HTMLElement,
        reducedMotion: false,
        viewportWidth: 1440,
        viewportHeight: 900,
        startViewTransition: (update) => {
            count++;
            order.push(`vt-start-${count}`);
            update();
            return count === 1
                ? { ready: ready1.promise, finished: fin1.promise }
                : { ready: ready2.promise, finished: fin2.promise };
        },
        animateRoot: (keyframes, options) => {
            animations.push({ keyframes, options });
        },
        dispatchSync: () => order.push("sync"),
        flush: (fn) => fn(),
    };

    const p1 = runThemeIrisTransition(origin, () => order.push("apply1"), env);
    assert(rootClass.contains(THEME_IRIS_CLASS));

    // Rapid second toggle aborts the first transition cleanly without stripping active class early
    const p2 = runThemeIrisTransition(origin, () => order.push("apply2"), env);
    ready1.reject(new DOMException("Aborted", "AbortError"));
    fin1.resolve();
    const r1 = await p1;
    assertEquals(r1, "instant");
    assert(rootClass.contains(THEME_IRIS_CLASS));

    ready2.resolve();
    await Promise.resolve();
    assertEquals(animations.length, 1);
    assertEquals(
        animations[0].options.pseudoElement,
        "::view-transition-new(root)",
    );

    fin2.resolve();
    const r2 = await p2;
    assertEquals(r2, "iris");
    assertEquals(rootClass.contains(THEME_IRIS_CLASS), false);
    assertEquals(order, [
        "vt-start-1",
        "apply1",
        "sync",
        "vt-start-2",
        "apply2",
        "sync",
    ]);
});
