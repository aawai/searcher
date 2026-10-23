import { assertEquals } from "@std/assert";
import type { AiModelDto } from "../../../../src/features/ai/types.ts";
import { hasUsableModel, usableModels } from "./useAiModels.ts";

const model = (patch: Partial<AiModelDto>) => ({
    id: "m",
    enabled: true,
    supportsText: true,
    ...patch,
} as AiModelDto);

Deno.test("AI entry points need an enabled, text-capable model", () => {
    assertEquals(hasUsableModel([]), false);
    assertEquals(hasUsableModel([model({ enabled: false })]), false);
    assertEquals(hasUsableModel([model({ supportsText: false })]), false);
    assertEquals(
        hasUsableModel([model({ enabled: false }), model({})]),
        true,
    );
});

Deno.test("only usable models can be asked", () => {
    const usable = model({ id: "ok" });
    assertEquals(
        usableModels([
            model({ id: "off", enabled: false }),
            usable,
            model({ id: "image", supportsText: false }),
        ]),
        [usable],
    );
});
