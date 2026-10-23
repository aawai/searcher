/** Root class that scopes the shared-element rules in styles/global.css. */
export const SHARED_ELEMENT_CLASS = "shared-element-transition";

const TARGET_TIMEOUT_MS = 2000;

export interface SharedElementEnv {
    root: HTMLElement;
    /** `undefined` where View Transitions are unsupported. */
    startViewTransition:
        | ((update: () => Promise<void>) => { finished: Promise<unknown> })
        | undefined;
    uniqueId: () => string;
    /** Resolves the element once `find` returns it, or null after a timeout. */
    waitForElement: (
        find: () => HTMLElement | null,
    ) => Promise<HTMLElement | null>;
}

function waitForElement(
    find: () => HTMLElement | null,
): Promise<HTMLElement | null> {
    const found = find();
    if (found) return Promise.resolve(found);
    return new Promise((resolve) => {
        const finish = (element: HTMLElement | null) => {
            observer.disconnect();
            clearTimeout(timer);
            resolve(element);
        };
        const observer = new MutationObserver(() => {
            const element = find();
            if (element) finish(element);
        });
        const timer = setTimeout(() => finish(find()), TARGET_TIMEOUT_MS);
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

function browserEnv(): SharedElementEnv {
    return {
        root: document.documentElement,
        startViewTransition: typeof document.startViewTransition === "function"
            ? (update) => document.startViewTransition(update)
            : undefined,
        uniqueId: () => crypto.randomUUID(),
        waitForElement,
    };
}

export function supportsSharedElementTransition(): boolean {
    return typeof document.startViewTransition === "function";
}

/**
 * Moves one object from its current container to another with the View
 * Transition shared-element contract (docs/design/VISUAL_LANGUAGE.md · 动效):
 * a fresh `view-transition-name` per run, held by exactly one element in each
 * snapshot. Reduced motion is handled by the CSS scoped to SHARED_ELEMENT_CLASS.
 *
 * `update` must commit the new state before it returns or resolves (flushSync);
 * `findTarget` then yields the object's new container. Where the API is
 * missing the update simply runs and nothing animates.
 */
export async function runSharedElementTransition(
    options: {
        source: HTMLElement;
        update: () => void | Promise<unknown>;
        findTarget: () => HTMLElement | null;
    },
    env: SharedElementEnv = browserEnv(),
): Promise<"morph" | "instant"> {
    const { source, update, findTarget } = options;
    if (!env.startViewTransition) {
        await update();
        return "instant";
    }
    const name = `shared-${env.uniqueId()}`;
    let target: HTMLElement | null = null;
    source.style.viewTransitionName = name;
    env.root.classList.add(SHARED_ELEMENT_CLASS);
    try {
        const transition = env.startViewTransition(async () => {
            await update();
            target = await env.waitForElement(findTarget);
            // The name is unique per snapshot: hand it over, never duplicate it.
            if (target !== source) {
                source.style.removeProperty("view-transition-name");
            }
            if (target) target.style.viewTransitionName = name;
        });
        await transition.finished;
        return "morph";
    } finally {
        source.style.removeProperty("view-transition-name");
        (target as HTMLElement | null)?.style.removeProperty(
            "view-transition-name",
        );
        env.root.classList.remove(SHARED_ELEMENT_CLASS);
    }
}
