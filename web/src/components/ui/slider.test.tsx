import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { Slider } from "./slider.tsx";

function extractRangeInputs(html: string): string[] {
    const matches = html.match(/<input[^>]*type="range"[^>]*>/g) ?? [];
    return matches;
}

Deno.test("Slider: scalar value renders exactly 1 thumb with accessible label", () => {
    const html = ReactDOMServer.renderToString(
        <Slider
            min={0}
            max={1}
            step={0.05}
            value={0.5}
            aria-label="搜索框透明度"
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    assertEquals(inputs[0].includes('aria-label="搜索框透明度"'), true);
    assertEquals(inputs[0].includes('aria-valuenow="0.5"'), true);
});

Deno.test("Slider: scalar defaultValue renders exactly 1 thumb", () => {
    const html = ReactDOMServer.renderToString(
        <Slider
            min={0}
            max={100}
            defaultValue={50}
            aria-label="音量"
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    assertEquals(inputs[0].includes('aria-label="音量"'), true);
});
