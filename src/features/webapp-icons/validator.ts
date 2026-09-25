/**
 * Validates image binary formats and sanitizes SVGs for Web App icons.
 * Supports: PNG, JPEG, WebP, AVIF, ICO, SVG (sanitized).
 */

import { validateRasterMagicBytes } from "../wallpaper/service.ts";
import { sanitizeSvg } from "./svg.ts";

export type ImageValidationResult =
    | {
        valid: true;
        contentType:
            | "image/png"
            | "image/jpeg"
            | "image/webp"
            | "image/avif"
            | "image/x-icon"
            | "image/svg+xml";
        sanitizedBytes?: Uint8Array;
    }
    | { valid: false; reason: string };

export function validateImageBytes(bytes: Uint8Array): ImageValidationResult {
    if (bytes.length < 4) {
        return { valid: false, reason: "文件内容过短，不是有效的图片" };
    }

    // 1. Try raster check (PNG, JPEG, WebP, AVIF)
    const raster = validateRasterMagicBytes(bytes);
    if (raster.valid) {
        return { valid: true, contentType: raster.contentType };
    }

    // 2. ICO format: starts with 00 00 01 00
    if (
        bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 &&
        bytes[3] === 0x00
    ) {
        return { valid: true, contentType: "image/x-icon" };
    }

    // 3. SVG check
    const textStart = new TextDecoder().decode(
        bytes.slice(0, Math.min(bytes.length, 1024)),
    ).trim();
    if (
        textStart.includes("<svg") ||
        textStart.includes("<?xml") && textStart.includes("<svg")
    ) {
        try {
            const rawSvg = new TextDecoder().decode(bytes);
            const sanitized = sanitizeSvg(rawSvg);
            const sanitizedBytes = new TextEncoder().encode(sanitized);
            return {
                valid: true,
                contentType: "image/svg+xml",
                sanitizedBytes,
            };
        } catch (e) {
            return {
                valid: false,
                reason: e instanceof Error
                    ? e.message
                    : "无效或危险的 SVG 图片",
            };
        }
    }

    return {
        valid: false,
        reason: "不支持的图片格式，仅支持 PNG、JPEG、WebP、AVIF、ICO 与 SVG",
    };
}
