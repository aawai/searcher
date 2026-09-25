import { fetchWithSafeLimit } from "../webapp-icons/fetcher.ts";
import { validateImageBytes } from "../webapp-icons/validator.ts";
import { normalizeBaseUrl, OpenAIClientError } from "./client.ts";

export type LogoStyle = "minimal" | "geometric" | "gradient";
export interface LogoCandidate {
    dataUrl: string;
    style: LogoStyle;
}

const styleDescription: Record<LogoStyle, string> = {
    minimal:
        "flat minimalist vector-like mark, simple silhouette, clean negative space",
    geometric: "bold geometric mark, balanced forms, crisp edges",
    gradient: "subtle gradient mark, soft dimensionality, restrained color",
};

export async function generateLogoCandidates(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    siteName: string,
    style: LogoStyle,
    fetchFn: typeof fetch = fetch,
): Promise<LogoCandidate[]> {
    const target = `${normalizeBaseUrl(baseUrl)}/images/generations`;
    let response: Response;
    try {
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
                prompt:
                    `Create three distinct original app-icon concepts for a website named ${
                        JSON.stringify(siteName)
                    }. ${
                        styleDescription[style]
                    }. Square composition, no letters or text, no existing brand logos, not an official logo.`,
                n: 3,
                size: "1024x1024",
                response_format: "b64_json",
            }),
        });
    } catch {
        throw new OpenAIClientError(
            "图像 Provider 连接失败；确认其支持 /images/generations",
        );
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new OpenAIClientError(
            `图像生成失败: HTTP ${response.status}`,
            response.status,
        );
    }
    if (!response.body) throw new OpenAIClientError("图像 Provider 未返回内容");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 12 * 1024 * 1024) {
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
    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(payload));
    } catch {
        throw new OpenAIClientError("图像 Provider 返回格式无效");
    }
    if (
        !parsed || typeof parsed !== "object" || !("data" in parsed) ||
        !Array.isArray(parsed.data) || parsed.data.length < 2 ||
        parsed.data.length > 4
    ) {
        throw new OpenAIClientError("图像 Provider 必须返回 2–4 个候选");
    }
    const candidates: LogoCandidate[] = [];
    for (const item of parsed.data) {
        if (!item || typeof item !== "object") {
            throw new OpenAIClientError("图像候选格式无效");
        }
        let bytes: Uint8Array;
        if ("b64_json" in item && typeof item.b64_json === "string") {
            if (item.b64_json.length > 2_800_000) {
                throw new OpenAIClientError("图像候选超过大小限制");
            }
            try {
                bytes = Uint8Array.fromBase64(item.b64_json);
            } catch {
                throw new OpenAIClientError("图像候选 Base64 无效");
            }
        } else if ("url" in item && typeof item.url === "string") {
            try {
                bytes =
                    (await fetchWithSafeLimit(item.url, {
                        maxBytes: 2 * 1024 * 1024,
                    })).bytes;
            } catch {
                throw new OpenAIClientError("图像候选 URL 无法安全获取");
            }
        } else throw new OpenAIClientError("图像候选缺少图片数据");
        const validation = validateImageBytes(bytes);
        if (!validation.valid) throw new OpenAIClientError(validation.reason);
        candidates.push({
            dataUrl: `data:${validation.contentType};base64,${
                (validation.sanitizedBytes ?? bytes).toBase64()
            }`,
            style,
        });
    }
    return candidates;
}
