/**
 * Shared types and tiny helpers.
 *
 * TEACHING NOTE: Define each allowed value ONCE as a `const` tuple, then derive
 * the union type from it. The runtime list (used for validation and dropdowns)
 * and the compile-time type can never drift apart.
 */

export const VIEW_TYPES = ['masonry', 'carousel'] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const SORT_MODES = ['name', 'created', 'modified'] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const isViewType = (v: unknown): v is ViewType => VIEW_TYPES.includes(v as ViewType);
export const isSortMode = (v: unknown): v is SortMode => SORT_MODES.includes(v as SortMode);

/** One image ready to display. `url` comes from Obsidian's resource-path API. */
export interface ImageAsset {
    name: string;
    path: string;
    url: string;
    caption?: string;
    alt?: string;
}

/** Options every view needs. Views never read plugin settings directly. */
export interface ViewOptions {
    showCaptions: boolean;
}

/**
 * The contract each view implements. `destroy()` must release anything that
 * outlives the DOM (observers, animation frames, timers).
 */
export interface GalleryView {
    render(images: ImageAsset[]): void;
    destroy(): void;
}

/** Narrow `unknown` to a plain object. User-controlled data is always `unknown` first. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce an untrusted number into a safe integer range (data.json can be hand-edited). */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
