import { assertEquals } from "@std/assert";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { hasUsableModel, usableModels } from "./useAiModels.ts";

const model = (patch: Partial<AiModelDto>) => ({
    id: "m",
    enabled: true,
    visibleToUsers: true,
    supportsText: true,
    providerEnabled: true,
    ...patch,
} as AiModelDto);

Deno.test("AI entry points need an enabled, visible, text-capable model from an enabled provider", () => {
    assertEquals(hasUsableModel([]), false);
    assertEquals(hasUsableModel([model({ enabled: false })]), false);
    assertEquals(hasUsableModel([model({ visibleToUsers: false })]), false);
    assertEquals(hasUsableModel([model({ supportsText: false })]), false);
    assertEquals(hasUsableModel([model({ providerEnabled: false })]), false);
    assertEquals(
        hasUsableModel([
            model({ enabled: false }),
            model({ visibleToUsers: false }),
            model({ providerEnabled: false }),
            model({}),
        ]),
        true,
    );
});

Deno.test("only usable models can be asked", () => {
    const usable = model({ id: "ok" });
    assertEquals(
        usableModels([
            model({ id: "off", enabled: false }),
            model({ id: "hidden", visibleToUsers: false }),
            model({ id: "disabled-provider", providerEnabled: false }),
            usable,
            model({ id: "image", supportsText: false }),
        ]),
        [usable],
    );
});
