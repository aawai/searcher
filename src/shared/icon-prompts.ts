export const ICON_STYLE_IDS = [
    "brand_soft3d",
    "light_ceramic",
    "dark_matte",
    "frosted_glass",
    "crisp_flat",
] as const;

export type BuiltinIconStyleId = (typeof ICON_STYLE_IDS)[number];

export const DEFAULT_ICON_STYLE_ID: BuiltinIconStyleId = "brand_soft3d";

export const ICON_CANDIDATE_COUNT_DEFAULT = 1 as const;
export const ICON_CANDIDATE_COUNT_MIN = 1 as const;
export const ICON_CANDIDATE_COUNT_MAX = 3 as const;

export const ICON_PROMPT_MAX_LENGTH = 4000;
export const ICON_STYLE_NAME_MAX_LENGTH = 40;
export const ICON_STYLE_PROMPT_MAX_LENGTH = 1000;
export const ICON_CUSTOM_STYLES_MAX_COUNT = 20;

export interface CustomIconStylePreset {
    id: string;
    name: string;
    prompt: string;
}

export interface BuiltinIconStylePreset {
    id: BuiltinIconStyleId;
    label: string;
    summary: string;
    prompt: string;
}

export interface IconGenerationPreferences {
    defaultStyle?: string;
    defaultCount?: 1 | 2 | 3;
    defaultProtocol?: "openai" | "gemini";
    referenceTemplate?: string;
    textTemplate?: string;
    customStyles?: CustomIconStylePreset[];
}

export const BUILTIN_ICON_STYLES: readonly BuiltinIconStylePreset[] = [
    {
        id: "brand_soft3d",
        label: "品牌柔光立体",
        summary: "品牌主色渐变满铺底 + 柔和微立体居中主体",
        prompt:
            "Rich subtle vertical gradient background derived from the brand's dominant color; centered crisp white or luminous tinted emblem with soft tactile 3D extrusion, smooth matte-satin surface, subtle top bevel highlight, and gentle soft contact shadow.",
    },
    {
        id: "light_ceramic",
        label: "纯净浅瓷",
        summary: "温润浅瓷白满铺底 + 真实品牌色矢量质感主体",
        prompt:
            "Clean warm-white ceramic square background (#F8F9FB to #EEF1F6 subtle top-to-bottom gradient); centered emblem rendered in the brand's true colors with crisp vector edges, gentle micro-depth, and soft ambient occlusion.",
    },
    {
        id: "dark_matte",
        label: "深色磨砂",
        summary: "深炭磨砂满铺底 + 提亮精修的品牌色主体",
        prompt:
            "Deep charcoal-slate matte square background (#1B1E26 to #12141A subtle gradient); centered emblem rendered in luminous refined brand colors with crisp clean edges and subtle top rim highlight.",
    },
    {
        id: "frosted_glass",
        label: "柔和玻璃",
        summary: "协调柔和渐变底 + 分层磨砂玻璃几何主体",
        prompt:
            "Soft pastel translucent-inspired gradient backdrop harmonized with the brand hue; layered frosted-glass geometric emblem with clean crisp edges, delicate specular rim, and calm studio shading.",
    },
    {
        id: "crisp_flat",
        label: "现代扁平",
        summary: "干净纯色或微双色满铺底 + 高辨识度平面几何主体",
        prompt:
            "Solid or whisper-subtle two-tone background; flat crisp geometric emblem with 2–3 harmonious colors, clean curves, zero noise, and high small-size legibility.",
    },
] as const;

export const DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE =
    `Redesign the attached app icon into a polished, cohesive square launcher icon for "{{siteName}}"{{#siteDomain}} ({{siteDomain}}){{/siteDomain}}.

Identity preservation:
- Keep the exact core symbol, silhouette, geometry, and signature brand color cue from the reference icon so it remains immediately recognizable.
- Clean up jagged edges, low-resolution artifacts, visual clutter, and awkward borders from the reference image.
- If the reference icon is a clean single lettermark or monogram, preserve that exact letterform as a bold geometric glyph rather than replacing it with an unrelated object.

Icon pack consistency (strict):
- Full-bleed square canvas: the background must fill 100% of the square edge-to-edge with no outer margin, no rounded-square frame, no drop shadow around the canvas, and no border.
- Centered focal mark occupying 58% to 66% of the canvas width and height, optically balanced in the center.
- Uniform soft top-left studio lighting (15° from top-left) so icons sit cohesively together in a desktop grid.
- Crisp readability at 48x48px and 32x32px: simplify micro-details into bold, clean surfaces.

Visual style:
{{stylePrompt}}
{{#description}}
Additional user intent:
{{description}}
{{/description}}
Output a single square icon filling the entire frame, without extra words, labels, watermarks, or multiple variants.`;

export const DEFAULT_TEXT_ICON_PROMPT_TEMPLATE =
    `A single production-ready square launcher app icon for "{{siteName}}"{{#siteDomain}} ({{siteDomain}}){{/siteDomain}}.
{{#description}}Product concept: {{description}}.{{/description}}

Composition & grid consistency:
- One bold, iconic centered emblem representing the product concept (2 to 4 clean geometric parts).
- Full-bleed square canvas filling 100% edge-to-edge; no inner rounded card, no outer frame, no mockup.
- Subject centered and scaled to 58%–66% of the canvas width with generous even breathing room.
- Uniform soft top-left lighting (15°) and strong figure-ground contrast, clearly legible at 48x48px.

Visual style:
{{stylePrompt}}

No sentences, captions, watermarks, UI screenshots, or multi-icon grids.`;

const CANDIDATE_VARIATIONS = [
    "Keep the most faithful, balanced proportions and clean silhouette.",
    "Offer a subtle refinement in negative space and surface contrast while keeping the same brand identity and icon pack rules.",
    "Offer a slightly bolder geometric proportion while keeping the exact same brand identity, color harmony, and icon pack rules.",
] as const;

export function resolveIconStyle(
    styleId: string | undefined,
    customStyles?: readonly CustomIconStylePreset[],
): { id: string; label: string; prompt: string; isCustom: boolean } | null {
    const id = styleId?.trim() || DEFAULT_ICON_STYLE_ID;
    const builtin = BUILTIN_ICON_STYLES.find((item) => item.id === id);
    if (builtin) {
        return {
            id: builtin.id,
            label: builtin.label,
            prompt: builtin.prompt,
            isCustom: false,
        };
    }
    const custom = customStyles?.find((item) => item.id === id);
    if (custom) {
        return {
            id: custom.id,
            label: custom.name,
            prompt: custom.prompt,
            isCustom: true,
        };
    }
    return null;
}

function sanitizeInlineMetadata(value?: string): string {
    if (!value) return "";
    return value.replace(/[\r\n]+/g, " ").trim();
}

export function renderIconPromptTemplate(
    template: string,
    vars: {
        siteName: string;
        siteDomain?: string;
        description?: string;
        stylePrompt: string;
    },
): string {
    const siteName = sanitizeInlineMetadata(vars.siteName);
    const siteDomain = sanitizeInlineMetadata(vars.siteDomain);
    const description = vars.description?.trim() ?? "";
    const stylePrompt = vars.stylePrompt.trim();

    let result = template;
    result = result.replace(
        /\{\{#siteDomain\}\}([\s\S]*?)\{\{\/siteDomain\}\}/g,
        (_, inner: string) => (siteDomain ? inner : ""),
    );
    result = result.replace(
        /\{\{#description\}\}([\s\S]*?)\{\{\/description\}\}/g,
        (_, inner: string) => (description ? inner : ""),
    );

    result = result
        .replaceAll("{{siteName}}", siteName)
        .replaceAll("{{siteDomain}}", siteDomain)
        .replaceAll("{{description}}", description)
        .replaceAll("{{stylePrompt}}", stylePrompt);

    return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildIconPrompt(input: {
    siteName: string;
    siteDomain?: string;
    description?: string;
    stylePrompt: string;
    hasReference: boolean;
    template?: string;
    candidateIndex?: number;
    candidateCount?: number;
}): string {
    const chosenTemplate = input.template?.trim() ||
        (input.hasReference
            ? DEFAULT_REFERENCE_ICON_PROMPT_TEMPLATE
            : DEFAULT_TEXT_ICON_PROMPT_TEMPLATE);
    const basePrompt = renderIconPromptTemplate(chosenTemplate, {
        siteName: input.siteName,
        siteDomain: input.siteDomain,
        description: input.description,
        stylePrompt: input.stylePrompt,
    });
    const count = input.candidateCount ?? 1;
    const index = input.candidateIndex ?? 1;
    if (count > 1 && index >= 1 && index <= CANDIDATE_VARIATIONS.length) {
        return `${basePrompt}\n\nCandidate ${index} of ${count}: ${
            CANDIDATE_VARIATIONS[index - 1]
        }`;
    }
    return basePrompt;
}

export function normalizeIconGenerationPreferences(
    raw: unknown,
): IconGenerationPreferences | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const result: IconGenerationPreferences = {};

    if (typeof r.defaultStyle === "string" && r.defaultStyle.trim()) {
        result.defaultStyle = r.defaultStyle.trim().slice(0, 64);
    }
    if (
        r.defaultCount === 1 || r.defaultCount === 2 || r.defaultCount === 3
    ) {
        result.defaultCount = r.defaultCount;
    }
    if (r.defaultProtocol === "openai" || r.defaultProtocol === "gemini") {
        result.defaultProtocol = r.defaultProtocol;
    }
    if (
        typeof r.referenceTemplate === "string" && r.referenceTemplate.trim()
    ) {
        result.referenceTemplate = r.referenceTemplate.trim().slice(
            0,
            ICON_PROMPT_MAX_LENGTH,
        );
    }
    if (typeof r.textTemplate === "string" && r.textTemplate.trim()) {
        result.textTemplate = r.textTemplate.trim().slice(
            0,
            ICON_PROMPT_MAX_LENGTH,
        );
    }
    if (Array.isArray(r.customStyles)) {
        const seenIds = new Set<string>();
        const cleanedStyles: CustomIconStylePreset[] = [];
        for (const item of r.customStyles) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                continue;
            }
            const s = item as Record<string, unknown>;
            const id = typeof s.id === "string" ? s.id.trim().slice(0, 64) : "";
            const name = typeof s.name === "string"
                ? s.name.trim().slice(0, ICON_STYLE_NAME_MAX_LENGTH)
                : "";
            const prompt = typeof s.prompt === "string"
                ? s.prompt.trim().slice(0, ICON_STYLE_PROMPT_MAX_LENGTH)
                : "";
            if (!id || !name || !prompt || seenIds.has(id)) continue;
            seenIds.add(id);
            cleanedStyles.push({ id, name, prompt });
            if (cleanedStyles.length >= ICON_CUSTOM_STYLES_MAX_COUNT) break;
        }
        if (cleanedStyles.length > 0) {
            result.customStyles = cleanedStyles;
        }
    }

    return Object.keys(result).length > 0 ? result : undefined;
}
