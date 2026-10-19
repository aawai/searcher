import { Link, useLocation } from "react-router-dom";
import { Button } from "../ui/button.tsx";
import { authPath } from "../../app/routes.ts";

export const GUEST_AI_UNAVAILABLE_MESSAGE = "登录后使用 AI 问答";

export function GuestAiUnavailable() {
    const location = useLocation();

    return (
        <>
            <span>{GUEST_AI_UNAVAILABLE_MESSAGE}</span>
            <Button
                variant="link"
                size="sm"
                render={<Link to={authPath("login", location)} />}
            >
                去登录
            </Button>
        </>
    );
}
