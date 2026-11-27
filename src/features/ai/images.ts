import sharp from "sharp";
import {
    buildIconPrompt,
    DEFAULT_ICON_STYLE_ID,
    ICON_CANDIDATE_COUNT_DEFAULT,
    ICON_CANDIDATE_COUNT_MAX,
    ICON_CANDIDATE_COUNT_MIN,
    resolveIconStyle,
} from "@shared/icon-prompts.ts";
import { fetchWithSafeLimit } from "../webapp-icons/fetcher.ts";
import { validateImageBytes } from "../webapp-icons/validator.ts";
import { normalizeBaseUrl, OpenAIClientError } from "./client.ts";

import type { ImageProtocol, LogoStyle } from "./types.ts";

export interface LogoCandidate {
    dataUrl: string;
    style: LogoStyle;
}

export interface ReferenceImageInput {
    bytes: Uint8Array;
    mimeType: string;
}

export interface GenerateLogoOptions {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    siteName: string;
    siteDomain?: string;
    description?: string;
    style: LogoStyle;
    stylePrompt?: string;
    template?: string;
    customPrompt?: string;
    referenceImage?: ReferenceImageInput;
    count?: number;
    imageProtocol: ImageProtocol;
    fetchFn?: typeof fetch;
}

export interface GenerateLogoResult {
    images: LogoCandidate[];
    promptUsed: string;
    usedReference: boolean;
}

const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;

export function buildLogoPrompt(input: {
    siteName: string;
    siteDomain?: string;
    description?: string;
    style?: LogoStyle;
    stylePrompt?: string;
    hasReference?: boolean;
    template?: string;
    candidateIndex?: number;
    candidateCount?: number;
}): string {
    const resolvedStylePrompt = input.stylePrompt ??
        resolveIconStyle(input.style ?? DEFAULT_ICON_STYLE_ID)?.prompt ??
        resolveIconStyle(DEFAULT_ICON_STYLE_ID)!.prompt;
    return buildIconPrompt({
        siteName: input.siteName,
        siteDomain: input.siteDomain,
        description: input.description,
        stylePrompt: resolvedStylePrompt,
        hasReference: Boolean(input.hasReference),
        template: input.template,
        candidateIndex: input.candidateIndex,
        candidateCount: input.candidateCount,
    });
}

export async function prepareReferenceImageForAi(
    bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mimeType: "image/png" }> {
    const pngBytes = await sharp(bytes, {
        limitInputPixels: 4096 * 4096,
        density: 192,
    })
        .resize(512, 512, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();
    return {
        bytes: new Uint8Array(pngBytes),
        mimeType: "image/png",
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function geminiGenerateContentUrl(baseUrl: string, modelId: string): string {
    const url = new URL(normalizeBaseUrl(baseUrl));
    const basePath = url.pathname.replace(/\/+$/, "").replace(
        /\/v1(?:beta)?(?:\/openai)?$/i,
        "",
    );
    url.pathname = `${basePath}/v1beta/models/${
        encodeURIComponent(modelId.trim().replace(/^models\//i, ""))
    }:generateContent`;
    return url.toString();
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_RESPONSE_BYTES) {
                throw new OpenAIClientError("图像生成响应超过大小限制");
            }
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }

    const payload = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        payload.set(chunk, offset);
        offset += chunk.length;
    }
    return payload;
}

function redactApiKey(text: string, apiKey: string): string {
    if (!apiKey) return text;
    return text.replaceAll(JSON.stringify(apiKey).slice(1, -1), "[redacted]")
        .replaceAll(apiKey, "[redacted]");
}

function providerErrorMessage(text: string, apiKey: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "";
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isRecord(parsed)) {
            const error = parsed.error;
            if (
                isRecord(error) &&
                typeof error.message === "string" &&
                error.message.trim()
            ) {
                return redactApiKey(error.message, apiKey).trim().slice(0, 500);
            }
            if (
                typeof parsed.message === "string" &&
                parsed.message.trim()
            ) {
                return redactApiKey(parsed.message, apiKey).trim().slice(
                    0,
                    500,
                );
            }
        }
    } catch {
        // Fall through to a compact text response.
    }
    return redactApiKey(trimmed, apiKey).replace(/\s+/g, " ").slice(0, 500);
}

async function readJsonResponse(
    response: Response,
    errorPrefix: string,
    apiKey: string,
): Promise<unknown> {
    const payload = await readResponseBytes(response);
    const text = new TextDecoder().decode(payload);

    if (!response.ok) {
        const detail = providerErrorMessage(text, apiKey);
        throw new OpenAIClientError(
            `${errorPrefix}: HTTP ${response.status}${
                detail ? ` - ${detail}` : ""
            }`,
            response.status,
            redactApiKey(text, apiKey).slice(0, 4096),
        );
    }
    if (!text.trim()) {
        throw new OpenAIClientError("图像服务商未返回内容");
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new OpenAIClientError("图像服务商返回格式无效");
    }
}

const CANDIDATE_PREVIEW_SIZE = 256;

async function compressCandidateImage(
    bytes: Uint8Array,
): Promise<Uint8Array> {
    try {
        const webp = await sharp(bytes, {
            limitInputPixels: 4096 * 4096,
            density: 192,
        })
            .resize(CANDIDATE_PREVIEW_SIZE, CANDIDATE_PREVIEW_SIZE, {
                fit: "cover",
                withoutEnlargement: true,
            })
            .webp({ quality: 88, effort: 4 })
            .toBuffer();
        return new Uint8Array(webp);
    } catch {
        throw new OpenAIClientError("图像候选格式无效");
    }
}

async function candidateFromBase64(
    encoded: string,
    style: LogoStyle,
): Promise<LogoCandidate> {
    if (encoded.length > MAX_IMAGE_BASE64_LENGTH) {
        throw new OpenAIClientError("图像候选超过大小限制");
    }

    let bytes: Uint8Array;
    try {
        bytes = Uint8Array.fromBase64(encoded);
    } catch {
        throw new OpenAIClientError("图像候选 Base64 无效");
    }

    const validation = validateImageBytes(bytes);
    if (!validation.valid) throw new OpenAIClientError(validation.reason);
    const compressed = await compressCandidateImage(
        validation.sanitizedBytes ?? bytes,
    );
    return {
        dataUrl: `data:image/webp;base64,${compressed.toBase64()}`,
        style,
    };
}

async function candidateFromOpenAIItem(
    item: unknown,
    style: LogoStyle,
): Promise<LogoCandidate> {
    if (!isRecord(item)) {
        throw new OpenAIClientError("图像候选格式无效");
    }

    if (typeof item.b64_json === "string") {
        return await candidateFromBase64(item.b64_json, style);
    }

    if (typeof item.url === "string") {
        let bytes: Uint8Array;
        try {
            bytes = (await fetchWithSafeLimit(item.url, {
                maxBytes: 2 * 1024 * 1024,
            })).bytes;
        } catch {
            throw new OpenAIClientError("图像候选 URL 无法安全获取");
        }
        const validation = validateImageBytes(bytes);
        if (!validation.valid) throw new OpenAIClientError(validation.reason);
        const compressed = await compressCandidateImage(
            validation.sanitizedBytes ?? bytes,
        );
        return {
            dataUrl: `data:image/webp;base64,${compressed.toBase64()}`,
            style,
        };
    }

    throw new OpenAIClientError("图像候选缺少图片数据");
}

async function extractOpenAICandidate(
    parsed: unknown,
    style: LogoStyle,
): Promise<LogoCandidate> {
    if (
        !isRecord(parsed) ||
        !Array.isArray(parsed.data) ||
        parsed.data.length === 0
    ) {
        throw new OpenAIClientError("图像服务商未返回图片候选");
    }

    return await candidateFromOpenAIItem(parsed.data[0], style);
}

async function extractGeminiCandidate(
    parsed: unknown,
    style: LogoStyle,
): Promise<LogoCandidate> {
    if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
        throw new OpenAIClientError("Gemini 图像响应缺少 candidates");
    }

    for (const candidate of parsed.candidates) {
        if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
        const parts = candidate.content.parts;
        if (!Array.isArray(parts)) continue;

        for (const part of parts) {
            if (!isRecord(part)) continue;
            const inlineData = isRecord(part.inlineData)
                ? part.inlineData
                : isRecord(part.inline_data)
                ? part.inline_data
                : undefined;
            if (!inlineData || typeof inlineData.data !== "string") continue;
            return await candidateFromBase64(inlineData.data, style);
        }
    }

    throw new OpenAIClientError(
        "Gemini 图像响应未包含 inlineData 图片",
    );
}

async function generateOpenAICandidate(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    style: LogoStyle,
    fetchFn: typeof fetch,
    referenceImage?: ReferenceImageInput,
): Promise<LogoCandidate> {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const target = referenceImage
        ? `${normalizedBase}/images/edits`
        : `${normalizedBase}/images/generations`;
    let response: Response;
    try {
        if (referenceImage) {
            const form = new FormData();
            form.append("model", modelId);
            form.append("prompt", prompt);
            form.append("n", "1");
            form.append("size", "1024x1024");
            form.append("response_format", "b64_json");
            form.append(
                "image",
                new Blob([new Uint8Array(referenceImage.bytes)], {
                    type: referenceImage.mimeType,
                }),
                "reference.png",
            );
            response = await fetchFn(target, {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(60_000),
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                body: form,
            });
        } else {
            response = await fetchFn(target, {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(60_000),
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    prompt,
                    n: 1,
                    size: "1024x1024",
                    response_format: "b64_json",
                }),
            });
        }
    } catch (error) {
        throw new OpenAIClientError(
            `图像 Provider 连接失败；确认其支持 ${
                referenceImage ? "/images/edits" : "/images/generations"
            }: ${
                redactApiKey(
                    error instanceof Error ? error.message : String(error),
                    apiKey,
                )
            }`,
        );
    }

    return await extractOpenAICandidate(
        await readJsonResponse(response, "图像生成失败", apiKey),
        style,
    );
}

async function generateGeminiCandidate(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    style: LogoStyle,
    fetchFn: typeof fetch,
    referenceImage?: ReferenceImageInput,
): Promise<LogoCandidate> {
    const target = geminiGenerateContentUrl(baseUrl, modelId);
    const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
    > = referenceImage
        ? [
            {
                inlineData: {
                    mimeType: referenceImage.mimeType,
                    data: referenceImage.bytes.toBase64(),
                },
            },
            { text: prompt },
        ]
        : [{ text: prompt }];

    let response: Response;
    try {
        response = await fetchFn(target, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(60_000),
            headers: {
                ...(new URL(target).hostname ===
                        "generativelanguage.googleapis.com"
                    ? { "x-goog-api-key": apiKey }
                    : { Authorization: "Bearer " + apiKey }),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts,
                }],
                generationConfig: {
                    responseModalities: ["IMAGE"],
                },
            }),
        });
    } catch (error) {
        throw new OpenAIClientError(
            `Gemini 图像 Provider 连接失败: ${
                redactApiKey(
                    error instanceof Error ? error.message : String(error),
                    apiKey,
                )
            }`,
        );
    }

    return extractGeminiCandidate(
        await readJsonResponse(response, "Gemini 图像生成失败", apiKey),
        style,
    );
}

export async function generateLogoCandidates(
    options: GenerateLogoOptions,
): Promise<GenerateLogoResult> {
    const {
        baseUrl,
        apiKey,
        modelId,
        siteName,
        siteDomain,
        description,
        style,
        stylePrompt,
        template,
        customPrompt,
        referenceImage,
        imageProtocol,
        fetchFn = fetch,
    } = options;

    const count = Math.min(
        ICON_CANDIDATE_COUNT_MAX,
        Math.max(
            ICON_CANDIDATE_COUNT_MIN,
            Math.floor(options.count ?? ICON_CANDIDATE_COUNT_DEFAULT),
        ),
    );
    const trimmedCustom = customPrompt?.trim();
    const generator = imageProtocol === "gemini"
        ? generateGeminiCandidate
        : generateOpenAICandidate;

    const prompts = Array.from({ length: count }, (_, index) =>
        trimmedCustom ||
        buildLogoPrompt({
            siteName,
            siteDomain,
            description,
            style,
            stylePrompt,
            hasReference: Boolean(referenceImage),
            template,
            candidateIndex: index + 1,
            candidateCount: count,
        }));

    const images = await Promise.all(
        prompts.map((prompt) =>
            generator(
                baseUrl,
                apiKey,
                modelId,
                prompt,
                style,
                fetchFn,
                referenceImage,
            )
        ),
    );

    return {
        images,
        promptUsed: prompts[0] ?? "",
        usedReference: Boolean(referenceImage),
    };
}
