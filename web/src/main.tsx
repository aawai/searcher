import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./features/home-layouts/home-layouts.css";
import "./styles/global.css";
import "./components/searcher/launcher.css";
const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
