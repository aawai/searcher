import { assert, assertEquals } from "@std/assert";
import {
    avatarCropToViewState,
    clampAvatarPan,
    viewStateToAvatarCrop,
} from "./avatar-crop.ts";

Deno.test("clampAvatarPan prevents blank margins on landscape, portrait, and zoomed images", () => {
    // 800x400 on 280px stage at zoom=1 -> renderedWidth=560, renderedHeight=280 -> maxPanX=140, maxPanY=0
    const p1 = clampAvatarPan(999, -50, 1, 280, 800, 400);
    assertEquals(p1, { zoom: 1, offsetX: 140, offsetY: 0 });

    // 400x800 on 280px stage at zoom=2 -> renderedWidth=560, renderedHeight=1120 -> maxPanX=140, maxPanY=420
    const p2 = clampAvatarPan(-500, 999, 2, 280, 400, 800);
    assertEquals(p2, { zoom: 2, offsetX: -140, offsetY: 420 });
});

Deno.test("viewStateToAvatarCrop and avatarCropToViewState round-trip accurately", () => {
    const cases = [
        { w: 800, h: 400, view: { zoom: 1.8, offsetX: -65, offsetY: 22 } },
        { w: 400, h: 800, view: { zoom: 2.5, offsetX: 40, offsetY: -120 } },
        { w: 512, h: 512, view: { zoom: 1, offsetX: 0, offsetY: 0 } },
    ];

    for (const c of cases) {
        const crop = viewStateToAvatarCrop(c.view, 280, c.w, c.h);
        const back = avatarCropToViewState(crop, 280, c.w, c.h);
        assert(Math.abs(back.zoom - c.view.zoom) < 1e-6);
        assert(Math.abs(back.offsetX - c.view.offsetX) < 1e-4);
        assert(Math.abs(back.offsetY - c.view.offsetY) < 1e-4);
    }
});
