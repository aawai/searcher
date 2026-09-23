import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import type { UserDto } from "@shared/contracts.ts";
import { apiFetch, setUnauthorizedHandler } from "../lib/api.ts";

interface AuthContextType {
    user: UserDto | null;
    loading: boolean;
    login: (user: UserDto) => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = (
    { children },
) => {
    const [user, setUser] = useState<UserDto | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            const data = await apiFetch<UserDto | { user: UserDto }>(
                "/api/auth/me",
            );
            if (data) {
                if ("user" in data && data.user) {
                    setUser(data.user);
                } else if ("id" in data) {
                    setUser(data as UserDto);
                }
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(() => {
            setUser(null);
        });
        refreshUser();
        return () => {
            setUnauthorizedHandler(null);
        };
    }, [refreshUser]);

    const login = useCallback((newUser: UserDto) => {
        setUser(newUser);
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiFetch("/api/auth/logout", { method: "POST" });
            setUser(null);
        } catch (err) {
            // Failed logout keeps user logged in
            throw err;
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, login, logout, refreshUser }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
