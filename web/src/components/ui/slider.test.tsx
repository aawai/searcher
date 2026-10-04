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

Deno.test("Slider: range value renders multiple thumbs with indexed labels", () => {
    const html = ReactDOMServer.renderToString(
        <Slider
            min={0}
            max={100}
            value={[20, 80]}
            aria-label="价格区间"
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 2);
    assertEquals(inputs[0].includes('aria-label="价格区间 (最小值)"'), true);
    assertEquals(inputs[1].includes('aria-label="价格区间 (最大值)"'), true);
});

Deno.test("Slider: custom getAriaLabel applies to multiple thumbs", () => {
    const html = ReactDOMServer.renderToString(
        <Slider
            min={0}
            max={100}
            value={[10, 50, 90]}
            getAriaLabel={(i) => `阶段 ${i + 1}`}
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 3);
    assertEquals(inputs[0].includes('aria-label="阶段 1"'), true);
    assertEquals(inputs[1].includes('aria-label="阶段 2"'), true);
    assertEquals(inputs[2].includes('aria-label="阶段 3"'), true);
});

Deno.test("Slider: custom getAriaValueText formats aria-valuetext", () => {
    const html = ReactDOMServer.renderToString(
        <Slider
            min={0}
            max={3}
            step={1}
            value={1}
            aria-label="可读性"
            getAriaValueText={(_fmt, val) => `均衡 · 24% (${val})`}
        />,
    );
    const inputs = extractRangeInputs(html);
    assertEquals(inputs.length, 1);
    assertEquals(inputs[0].includes('aria-valuetext="均衡 · 24% (1)"'), true);
});
