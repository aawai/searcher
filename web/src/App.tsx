import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import { HomePage } from "./HomePage.tsx";
import { AdminUsersPage } from "./features/admin/AdminUsersPage.tsx";

const NotFoundPage: React.FC = () => (
    <div
        style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
        }}
    >
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>404 - 页面未找到</h2>
        <p style={{ color: "var(--muted)" }}>您访问的页面不存在或已被移除</p>
        <a href="/" className="btn btn-primary">返回主页</a>
    </div>
);

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <ThemeProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route
                            path="/admin/users"
                            element={<AdminUsersPage />}
                        />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </BrowserRouter>
            </ThemeProvider>
        </AuthProvider>
    );
};
