/**
 * Root-level build files of the installable app. The server serves them before
 * the SPA fallback; a missing file is a static 404, never the HTML shell.
 */
export const PWA_MANIFEST_PATH = "/manifest.webmanifest";
export const SERVICE_WORKER_PATH = "/sw.js";
export const PWA_ICONS_PATH = "/icons";
