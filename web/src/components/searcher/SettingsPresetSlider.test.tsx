import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import {
    type PresetSliderStage,
    SettingsPresetSlider,
} from "./SettingsPresetSlider.tsx";

const TEST_STAGES: readonly PresetSliderStage<string>[] = [
    { id: "none", label: "无", detail: "0%" },
    { id: "clear", label: "清透", detail: "12%" },
    { id: "balanced", label: "均衡", detail: "24%" },
    { id: "quiet", label: "沉静", detail: "36%" },
    { id: "focus", label: "专注", detail: "48%" },
];

function extractRangeInputs(html: string): string[] {
    return html.match(/<input[^>]*type="range"[^>]*>/g) ?? [];
}

Deno.test("SettingsPresetSlider: renders range input with semantic snap points and aria-valuetext", () => {
    const html = ReactDOMServer.renderToString(
        <SettingsPresetSlider
            stages={TEST_STAGES}
            value="balanced"
            aria-label="可读性"
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    const input = inputs[0];
    assertEquals(input.includes('min="0"'), true);
    assertEquals(input.includes('max="4"'), true);
    assertEquals(input.includes('step="1"'), true);
    assertEquals(input.includes('aria-valuenow="2"'), true);
    assertEquals(input.includes('aria-valuetext="均衡 · 24%"'), true);
    assertEquals(html.includes('data-stage-count="5"'), true);
    assertEquals(
        html.includes('class="settings-preset-slider__mark" style='),
        false,
    );
});
Deno.test("SettingsPresetSlider: stages without detail format aria-valuetext with label only", () => {
    const motionStages: readonly PresetSliderStage<string>[] = [
        { id: "subtle", label: "轻微" },
        { id: "soft", label: "柔和" },
        { id: "standard", label: "标准" },
        { id: "pronounced", label: "明显" },
    ];
    const html = ReactDOMServer.renderToString(
        <SettingsPresetSlider
            stages={motionStages}
            value="standard"
            aria-label="动态程度"
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    assertEquals(inputs[0].includes('aria-valuenow="2"'), true);
    assertEquals(inputs[0].includes('aria-valuetext="标准"'), true);
});

Deno.test("SettingsPresetSlider: disabled prop disables root, input, and marks", () => {
    const html = ReactDOMServer.renderToString(
        <SettingsPresetSlider
            stages={TEST_STAGES}
            value="clear"
            disabled
            aria-label="可读性"
        />,
    );
    assertEquals(html.includes('data-disabled="true"'), true);
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    assertEquals(inputs[0].includes("disabled"), true);
});
