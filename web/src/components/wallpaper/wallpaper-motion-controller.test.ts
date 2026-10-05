import { assertEquals } from "@std/assert";
import {
    calculateWallpaperOverscan,
    formatOverscanInset,
} from "@shared/wallpaper-presentation.ts";
import { WallpaperMotionController } from "./wallpaper-motion-controller.ts";

class MockAnimation {
    public playState: "idle" | "running" | "paused" = "running";
    public currentTime: number | null = 0;
    public cancelled = false;

    constructor(public keyframes: unknown, public options: unknown) {}

    public play() {
        this.playState = "running";
    }

    public pause() {
        this.playState = "paused";
    }

    public cancel() {
        this.cancelled = true;
        this.playState = "idle";
    }
}

class MockElement {
    public style: {
        transform: string;
        opacity: string;
        [key: string]: string | ((name: string, val: string) => void);
        setProperty: (name: string, val: string) => void;
    } = {
        transform: "",
        opacity: "",
        setProperty(name: string, val: string) {
            this[name] = val;
        },
    };
    public animations: MockAnimation[] = [];

    public animate(keyframes: unknown, options: unknown): MockAnimation {
        const anim = new MockAnimation(keyframes, options);
        this.animations.push(anim);
        return anim;
    }

    public getAnimations(): MockAnimation[] {
        return this.animations.filter((a) => !a.cancelled);
    }
}

Deno.test("WallpaperMotionController: state machine precedence and transitions", () => {
    const img = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img });

    assertEquals(controller.getState(), "idle");

    // Running drift
    controller.update({
        motion: "drift",
        motionLevel: "standard",
        reducedMotion: false,
    });
    assertEquals(controller.getState(), "running");

    // Reduced motion takes highest precedence
    controller.update({
        motion: "drift",
        motionLevel: "standard",
        reducedMotion: true,
    });
    assertEquals(controller.getState(), "reduced");

    // Reduced motion is preserved when intent changes
    controller.update({
        motion: "zoom",
        motionLevel: "pronounced",
        reducedMotion: true,
    });
    assertEquals(controller.getState(), "reduced");

    // Recovering from reduced motion
    controller.update({
        motion: "zoom",
        motionLevel: "pronounced",
        reducedMotion: false,
    });
    assertEquals(controller.getState(), "running");

    controller.destroy();
    assertEquals(controller.getState(), "idle");
});

Deno.test("WallpaperMotionController: one-writer invariant across transitions and handoffs", () => {
    const img = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img });

    // 1. Start drift
    controller.update({
        motion: "drift",
        motionLevel: "soft",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 1);

    // 2. Same-mode retarget to pronounced -> still exactly 1 writer
    controller.update({
        motion: "drift",
        motionLevel: "pronounced",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 1);

    // 3. Handoff to zoom -> still exactly 1 writer
    controller.update({
        motion: "zoom",
        motionLevel: "pronounced",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 1);

    // 4. Handoff to off -> 0 active writers
    controller.update({
        motion: "off",
        motionLevel: "pronounced",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 0);

    controller.destroy();
});

Deno.test("WallpaperMotionController: same-mode retarget preserves normalized phase", () => {
    const img = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img });

    controller.update({
        motion: "drift",
        motionLevel: "subtle",
        reducedMotion: false,
    });

    const activeAnim = (img as unknown as MockElement).getAnimations()[0];
    // Advance time to 42% of 46s = 19320ms
    activeAnim.currentTime = 19320;

    // Retarget to pronounced
    controller.update({
        motion: "drift",
        motionLevel: "pronounced",
        reducedMotion: false,
    });

    const newAnim = (img as unknown as MockElement).getAnimations()[0];
    assertEquals(newAnim.currentTime, 19320);

    controller.destroy();
});

Deno.test("WallpaperMotionController: rapid-intent latest-wins without accumulating queued handoffs", () => {
    const img = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img });

    // Rapid sequence: subtle drift -> pronounced drift -> standard zoom -> pronounced drift
    controller.update({
        motion: "drift",
        motionLevel: "subtle",
        reducedMotion: false,
    });
    controller.update({
        motion: "drift",
        motionLevel: "pronounced",
        reducedMotion: false,
    });
    controller.update({
        motion: "zoom",
        motionLevel: "standard",
        reducedMotion: false,
    });
    controller.update({
        motion: "drift",
        motionLevel: "pronounced",
        reducedMotion: false,
    });

    // Invariant: exactly 1 active animation, latest intent wins
    const active = (img as unknown as MockElement).getAnimations();
    assertEquals(active.length, 1);
    assertEquals(controller.getIntent().motion, "drift");
    assertEquals(controller.getIntent().motionLevel, "pronounced");
    assertEquals(controller.getState(), "running");

    controller.destroy();
});

Deno.test("WallpaperMotionController: cross-mode handoff matrix maintains single writer", () => {
    const img = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img });

    // off -> drift
    controller.update({
        motion: "drift",
        motionLevel: "soft",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 1);

    // drift -> zoom
    controller.update({
        motion: "zoom",
        motionLevel: "soft",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 1);

    // zoom -> off
    controller.update({
        motion: "off",
        motionLevel: "soft",
        reducedMotion: false,
    });
    assertEquals((img as unknown as MockElement).getAnimations().length, 0);
    assertEquals(controller.getState(), "idle");

    controller.destroy();
});

Deno.test("WallpaperMotionController: overscan grow-before-motion and shrink-after-motion sequencing", async () => {
    const img = new MockElement() as unknown as HTMLElement;
    const overscan = new MockElement() as unknown as HTMLElement;
    const controller = new WallpaperMotionController({ image: img, overscan });

    const subtleOverscan = formatOverscanInset(
        calculateWallpaperOverscan({
            motion: "drift",
            motionLevel: "subtle",
            blur: 0,
        }).percentageX,
        0,
    );
    const pronouncedOverscan = formatOverscanInset(
        calculateWallpaperOverscan({
            motion: "drift",
            motionLevel: "pronounced",
            blur: 0,
        }).percentageX,
        0,
    );

    // 1. Start subtle drift
    controller.update({
        motion: "drift",
        motionLevel: "subtle",
        reducedMotion: false,
        blur: 0,
    });
    assertEquals(
        (overscan as unknown as MockElement).style["--wallpaper-overscan-x"],
        subtleOverscan,
    );

    // 2. Amplitude increase (subtle -> pronounced): overscan must expand BEFORE motion retargets
    controller.update({
        motion: "drift",
        motionLevel: "pronounced",
        reducedMotion: false,
        blur: 0,
    });
    assertEquals(
        (overscan as unknown as MockElement).style["--wallpaper-overscan-x"],
        pronouncedOverscan,
        "Overscan must immediately grow to target amplitude before motion retarget",
    );

    // 3. Amplitude decrease (pronounced -> subtle): overscan must hold wide envelope during retarget window
    controller.update({
        motion: "drift",
        motionLevel: "subtle",
        reducedMotion: false,
        blur: 0,
    });
    assertEquals(
        (overscan as unknown as MockElement).style["--wallpaper-overscan-x"],
        pronouncedOverscan,
        "Overscan must maintain wide envelope during retarget convergence",
    );

    // After retarget settling window (300ms + margin): overscan shrinks to subtle
    await new Promise((r) => setTimeout(r, 350));
    assertEquals(
        (overscan as unknown as MockElement).style["--wallpaper-overscan-x"],
        subtleOverscan,
        "Overscan must shrink only after motion convergence settles",
    );

    controller.destroy();
});
