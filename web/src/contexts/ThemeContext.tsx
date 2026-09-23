import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import type { ThemeId } from "@shared/contracts.ts";
import { useAuth } from "./AuthContext.tsx";
import { apiFetch } from "../lib/api.ts";

interface ThemeContextType {
    theme: ThemeId;
    resolvedTheme: "light" | "dark" | "forest";
    setTheme: (theme: ThemeId) => Promise<void>;
    previewTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = (
    { children },
) => {
    const { user } = useAuth();
    const [theme, setThemeState] = useState<ThemeId>("system");
    const [resolvedTheme, setResolvedTheme] = useState<
        "light" | "dark" | "forest"
    >("light");

    const updateResolvedTheme = useCallback((currentTheme: ThemeId) => {
        if (currentTheme === "system") {
            const prefersDark =
                globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
            setResolvedTheme(prefersDark ? "dark" : "light");
        } else {
            setResolvedTheme(currentTheme);
        }
    }, []);

    useEffect(() => {
        const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            if (theme === "system") {
                updateResolvedTheme("system");
            }
        };
        media.addEventListener("change", handleChange);
        return () => media.removeEventListener("change", handleChange);
    }, [theme, updateResolvedTheme]);

    useEffect(() => {
        updateResolvedTheme(theme);
        document.documentElement.setAttribute("data-theme", resolvedTheme);
    }, [theme, resolvedTheme, updateResolvedTheme]);

    // Load preferences when user logs in, reset to system when logged out
    useEffect(() => {
        if (user) {
            apiFetch<{ theme: ThemeId }>("/api/preferences")
                .then((prefs) => {
                    if (prefs?.theme) {
                        setThemeState(prefs.theme);
                    }
                })
                .catch(() => {});
        } else {
            setThemeState("system");
        }
    }, [user]);

    const previewTheme = useCallback((newTheme: ThemeId) => {
        updateResolvedTheme(newTheme);
        const resolved = newTheme === "system"
            ? (globalThis.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
            : newTheme;
        document.documentElement.setAttribute("data-theme", resolved);
    }, [updateResolvedTheme]);

    const setTheme = useCallback(async (newTheme: ThemeId) => {
        const prev = theme;
        setThemeState(newTheme);
        previewTheme(newTheme);

        if (user) {
            try {
                await apiFetch("/api/preferences", {
                    method: "PATCH",
                    body: JSON.stringify({ theme: newTheme }),
                });
            } catch (err) {
                setThemeState(prev);
                previewTheme(prev);
                throw err;
            }
        }
    }, [theme, user, previewTheme]);

    return (
        <ThemeContext.Provider
            value={{ theme, resolvedTheme, setTheme, previewTheme }}
        >
            {children}
        </ThemeContext.Provider>
    );
};

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
