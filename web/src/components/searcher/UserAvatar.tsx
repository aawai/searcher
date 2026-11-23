import { useEffect, useState } from "react";
import type { UserDto } from "@shared/contracts.ts";
import { cn } from "../../lib/utils.ts";

export interface UserAvatarProps {
    user: Pick<UserDto, "displayName" | "username" | "avatarUrl">;
    className?: string;
    alt?: string;
}

export function UserAvatar({ user, className, alt }: UserAvatarProps) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const avatarUrl = user.avatarUrl ?? null;

    useEffect(() => {
        setFailedUrl(null);
    }, [avatarUrl]);

    const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl;
    const initial = (user.displayName || user.username || "?")
        .slice(0, 1)
        .toUpperCase();

    if (showImage && avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={alt ?? ""}
                className={cn("user-avatar-img", className)}
                decoding="async"
                onError={() => setFailedUrl(avatarUrl)}
            />
        );
    }

    return <>{initial}</>;
}
