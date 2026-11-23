import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ImageOff } from "lucide-react";
import type { AccentPreference, ThemeId } from "@shared/contracts.ts";
import {
    type BotanicalSpecies,
    normalizeBotanicalSpecies,
} from "@shared/wallpaper.ts";
import { wallpaperPresentation } from "@shared/wallpaper-presentation.ts";
import { routes } from "../../app/routes.ts";
import { THEME_LABELS, toggleThemeScheme } from "../../design-system/theme.ts";
import { api } from "../../lib/api.ts";
import { ThemeCelestialIcon } from "./ThemeCelestialIcon.tsx";
import { accentLabel, AccentSwatches } from "./AccentSwatches.tsx";
import { ThemeChoices } from "./ThemeChoices.tsx";
import {
    BOTANICAL_SCENE_CHOICES,
    buildWallpaperHistoryItems,
    buildWallpaperSelectionPatch,
    type WallpaperHistoryRecord,
    type WallpaperPresentationMap,
} from "../wallpaper/wallpaper-choices.ts";
import { Button } from "../ui/button.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "../ui/popover.tsx";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.tsx";
import { Switch } from "../ui/switch.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** The system light / dark preference, live; 跟随系统 resolves against it. */
function usePrefersDark(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const media = globalThis.matchMedia(PREFERS_DARK_QUERY);
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        },
        () => globalThis.matchMedia(PREFERS_DARK_QUERY).matches,
    );
}

/**
 * Top-bar theme button: one click flips light and dark and keeps the contrast
 * level (`toggleThemeScheme`). The glyph shows the current theme; every
 * theme is two clicks away in the appearance popover beside it.
 */
export function ThemeToggle(
    { value, onValueChange }: {
        value: ThemeId;
        onValueChange: (next: ThemeId) => void;
    },
) {
    const next = toggleThemeScheme(value, usePrefersDark());
    const label = `切换到${THEME_LABELS[next]}`;
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="appearance-toggle"
                        onClick={() => onValueChange(next)}
                        aria-label={label}
                    />
                }
            >
                <ThemeCelestialIcon theme={value} />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Top-bar appearance entry: a palette chip (accent, its pressed shade,
 * foreground and muted ink) that opens the theme tiles, accent swatches,
 * botanical illustration toggle, and quick wallpaper switcher.
 */
export function AppearancePicker(
    {
        theme,
        accent,
        botanicalScene,
        wallpaper,
        wallpaperPresentations,
        canLoadWallpaperHistory,
        historyOwnerKey,
        onThemeChange,
        onAccentChange,
        onBotanicalSceneChange,
        onWallpaperChange,
    }: {
        theme: ThemeId;
        accent: AccentPreference;
        botanicalScene: BotanicalSpecies | null;
        wallpaper: string;
        wallpaperPresentations: WallpaperPresentationMap;
        canLoadWallpaperHistory: boolean;
        historyOwnerKey: string | null;
        onThemeChange: (next: ThemeId) => void;
        onAccentChange: (next: AccentPreference) => void;
        onBotanicalSceneChange: (next: BotanicalSpecies | null) => void;
        onWallpaperChange: (next: {
            wallpaper: string;
            wallpaperPresentations?: WallpaperPresentationMap;
        }) => void;
    },
) {
    const [open, setOpen] = useState(false);
    const [lastBotanicalSpecies, setLastBotanicalSpecies] = useState<
        BotanicalSpecies
    >(botanicalScene ?? "auto");
    useEffect(() => {
        if (botanicalScene) {
            setLastBotanicalSpecies(botanicalScene);
        }
    }, [botanicalScene]);

    const [recentWallpapers, setRecentWallpapers] = useState<
        WallpaperHistoryRecord[]
    >([]);
    useEffect(() => {
        setRecentWallpapers([]);
    }, [historyOwnerKey]);

    useEffect(() => {
        if (!open || !canLoadWallpaperHistory) return;
        let cancelled = false;
        void api<WallpaperHistoryRecord[]>("/api/wallpaper").then((records) => {
            if (!cancelled) {
                setRecentWallpapers(records.slice(0, 5));
            }
        }).catch(() => {
            // Gracefully tolerate network failure
        });
        return () => {
            cancelled = true;
        };
    }, [open, canLoadWallpaperHistory, historyOwnerKey]);

    const quickWallpapers = buildWallpaperHistoryItems(
        wallpaper,
        recentWallpapers,
    );
    const label = `外观：${THEME_LABELS[theme]}，${accentLabel(accent)}`;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <PopoverTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="appearance-picker-trigger"
                                    aria-label={label}
                                />
                            }
                        />
                    }
                >
                    <span
                        className="appearance-picker-chip"
                        data-accent={accent}
                        aria-hidden="true"
                    >
                        <span
                            className="appearance-picker-chip-dot"
                            data-tone="accent"
                        />
                        <span
                            className="appearance-picker-chip-dot"
                            data-tone="foreground"
                        />
                        <span
                            className="appearance-picker-chip-dot"
                            data-tone="accent-active"
                        />
                        <span
                            className="appearance-picker-chip-dot"
                            data-tone="muted"
                        />
                    </span>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
            <PopoverContent
                className="appearance-picker"
                side="bottom"
                align="end"
                collisionPadding={16}
            >
                <PopoverTitle className="sr-only">外观</PopoverTitle>
                <section className="appearance-picker-section">
                    <p className="appearance-picker-heading" aria-hidden="true">
                        主题
                    </p>
                    <ThemeChoices value={theme} onValueChange={onThemeChange} />
                </section>
                <section className="appearance-picker-section">
                    <p className="appearance-picker-heading" aria-hidden="true">
                        强调色
                        <span>{accentLabel(accent)}</span>
                    </p>
                    <AccentSwatches
                        value={accent}
                        onValueChange={onAccentChange}
                    />
                </section>
                <section className="appearance-picker-section">
                    <div className="appearance-picker-heading appearance-picker-heading--control">
                        <span aria-hidden="true">内置插画</span>
                        <Switch
                            size="sm"
                            checked={botanicalScene !== null}
                            onCheckedChange={(checked) => {
                                onBotanicalSceneChange(
                                    checked ? lastBotanicalSpecies : null,
                                );
                            }}
                            aria-label="启用内置插画"
                            data-testid="appearance-picker-scene-switch"
                        />
                    </div>
                    <RadioGroup
                        variant="segmented"
                        className="appearance-picker-botanical"
                        value={botanicalScene ?? ""}
                        onValueChange={(next) => {
                            const species = normalizeBotanicalSpecies(next);
                            if (!species) return;
                            setLastBotanicalSpecies(species);
                            if (species !== botanicalScene) {
                                onBotanicalSceneChange(species);
                            }
                        }}
                        aria-label="插画枝型"
                    >
                        {BOTANICAL_SCENE_CHOICES.map(([id, text]) => (
                            <RadioGroupItem
                                key={id}
                                value={id}
                                data-testid={`appearance-picker-scene-${id}`}
                            >
                                {text}
                            </RadioGroupItem>
                        ))}
                    </RadioGroup>
                </section>
                {quickWallpapers.length > 0 && (
                    <section className="appearance-picker-section">
                        <p
                            className="appearance-picker-heading"
                            aria-hidden="true"
                        >
                            壁纸
                            <span>{wallpaper ? "已启用" : "已停用"}</span>
                        </p>
                        <RadioGroup
                            className="appearance-picker-wallpapers"
                            value={wallpaper}
                            onValueChange={(next) => {
                                if (next === "") {
                                    if (wallpaper !== "") {
                                        onWallpaperChange({ wallpaper: "" });
                                    }
                                    return;
                                }
                                const record = quickWallpapers.find((item) =>
                                    item.url === next
                                );
                                if (!record || record.url === wallpaper) return;
                                onWallpaperChange(
                                    buildWallpaperSelectionPatch(
                                        record,
                                        wallpaperPresentations,
                                    ),
                                );
                            }}
                            aria-label="快捷壁纸"
                        >
                            <RadioGroupItem
                                value=""
                                className="appearance-picker-wallpaper-item appearance-picker-wallpaper-item--none"
                                aria-label="不使用壁纸"
                                title="不使用壁纸"
                                data-testid="appearance-picker-wallpaper-none"
                            >
                                <ImageOff
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </RadioGroupItem>
                            {quickWallpapers.map((record, index) => {
                                const pres = wallpaperPresentation(
                                    record.url,
                                    wallpaperPresentations,
                                );
                                const focalX = record.focalX ??
                                    pres.composition.focalX ?? 0.5;
                                const focalY = record.focalY ??
                                    pres.composition.focalY ?? 0.5;
                                const itemLabel = `壁纸 ${index + 1}`;
                                return (
                                    <RadioGroupItem
                                        key={record.id}
                                        value={record.url}
                                        className="appearance-picker-wallpaper-item"
                                        aria-label={itemLabel}
                                        title={itemLabel}
                                        data-testid={`appearance-picker-wallpaper-${record.id}`}
                                    >
                                        <img
                                            className="appearance-picker-wallpaper-thumb"
                                            src={record.url}
                                            alt=""
                                            loading="lazy"
                                            style={{
                                                objectPosition: `${
                                                    (focalX * 100).toFixed(1)
                                                }% ${
                                                    (focalY * 100).toFixed(1)
                                                }%`,
                                            }}
                                        />
                                    </RadioGroupItem>
                                );
                            })}
                        </RadioGroup>
                    </section>
                )}
                <section className="appearance-picker-section">
                    <Link
                        className="appearance-picker-more"
                        to={routes.settings("appearance")}
                        viewTransition
                        onClick={() => setOpen(false)}
                    >
                        更多外观设置
                        <ChevronRight
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                    </Link>
                </section>
            </PopoverContent>
        </Popover>
    );
}
