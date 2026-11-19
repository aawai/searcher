import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { Button } from "../ui/button.tsx";
import { DialogFooter } from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Switch } from "../ui/switch.tsx";
import { FormField, SearchField, SecretInput } from "./semantic.tsx";

Deno.test("SearchField: renders clear button only when non-empty and enabled", () => {
    const emptyHtml = ReactDOMServer.renderToString(
        <SearchField
            value=""
            onValueChange={() => {}}
            placeholder="搜索"
            aria-label="筛选"
        />,
    );
    assertEquals(emptyHtml.includes('type="search"'), true);
    assertEquals(emptyHtml.includes('aria-label="清除搜索"'), false);

    const filledHtml = ReactDOMServer.renderToString(
        <SearchField
            value="hello"
            onValueChange={() => {}}
            placeholder="搜索"
            clearLabel="清空筛选"
            aria-label="筛选"
        />,
    );
    assertEquals(filledHtml.includes('aria-label="清空筛选"'), true);

    const disabledHtml = ReactDOMServer.renderToString(
        <SearchField
            value="hello"
            onValueChange={() => {}}
            placeholder="搜索"
            disabled
            aria-label="筛选"
        />,
    );
    assertEquals(disabledHtml.includes('aria-label="清除搜索"'), false);
});

Deno.test("SecretInput: toggles password input type and accessible pressed label", () => {
    const hiddenHtml = ReactDOMServer.renderToString(
        <SecretInput placeholder="输入密码" aria-label="密码" />,
    );
    assertEquals(hiddenHtml.includes('type="password"'), true);
    assertEquals(hiddenHtml.includes('aria-pressed="false"'), true);
    assertEquals(hiddenHtml.includes('aria-label="显示密码"'), true);

    const visibleHtml = ReactDOMServer.renderToString(
        <SecretInput
            defaultVisible
            placeholder="输入密钥"
            showLabel="显示密钥"
            hideLabel="隐藏密钥"
            aria-label="密钥"
        />,
    );
    assertEquals(visibleHtml.includes('type="text"'), true);
    assertEquals(visibleHtml.includes('aria-pressed="true"'), true);
    assertEquals(visibleHtml.includes('aria-label="隐藏密钥"'), true);
});

Deno.test("UI variants: Button ghost-danger, Switch sm, and DialogFooter bordered", () => {
    const buttonHtml = ReactDOMServer.renderToString(
        <Button variant="ghost-danger">删除</Button>,
    );
    assertEquals(buttonHtml.includes("button--ghost-danger"), true);

    const switchHtml = ReactDOMServer.renderToString(
        <Switch size="sm" aria-label="紧凑开关" />,
    );
    assertEquals(switchHtml.includes('data-size="sm"'), true);

    const footerHtml = ReactDOMServer.renderToString(
        <DialogFooter bordered>操作</DialogFooter>,
    );
    assertEquals(footerHtml.includes('data-bordered="true"'), true);
});

Deno.test("FormField: renders label, trailing accessory, hint and alert error with messageId", () => {
    const hintHtml = ReactDOMServer.renderToString(
        <FormField
            label="用户名"
            labelFor="u-input"
            labelEnd="3/32"
            hint="字母或数字"
            messageId="u-hint"
        >
            <Input id="u-input" placeholder="输入用户名" aria-describedby="u-hint" />
        </FormField>,
    );
    assertEquals(hintHtml.includes('for="u-input"'), true);
    assertEquals(hintHtml.includes("3/32"), true);
    assertEquals(hintHtml.includes('id="u-hint"'), true);
    assertEquals(hintHtml.includes('role="alert"'), false);

    const errorHtml = ReactDOMServer.renderToString(
        <FormField
            label="密码"
            labelFor="p-input"
            error="密码过短"
            messageId="p-err"
        >
            <Input
                id="p-input"
                placeholder="输入密码"
                aria-invalid="true"
                aria-describedby="p-err"
            />
        </FormField>,
    );
    assertEquals(errorHtml.includes('role="alert"'), true);
    assertEquals(errorHtml.includes('data-tone="danger"'), true);
    assertEquals(errorHtml.includes("密码过短"), true);
});
