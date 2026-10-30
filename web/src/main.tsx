import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { EscapeLayerProvider } from "./components/ui/escape-layer-stack.tsx";
import { installScrollActivity } from "./design-system/scroll-activity.ts";
import "./features/home-layouts/home-layouts.css";
import "./styles/global.css";
import "./components/ui/primitives.css";
import "./components/searcher/search.css";
import "./components/searcher/apps.css";
import "./components/searcher/document-colors.css";
import "./features/home-layouts/home-notes.css";
import "./components/searcher/conflict-dialog.css";
import "./components/searcher/launcher.css";
import "./components/searcher/semantic.css";
installScrollActivity();
const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(
    <React.StrictMode>
        <EscapeLayerProvider>
            <App />
        </EscapeLayerProvider>
    </React.StrictMode>,
);
