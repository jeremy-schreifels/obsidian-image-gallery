import { parseYaml } from 'obsidian';
import {
    SORT_MODES, VIEW_TYPES, SortMode, ViewType,
    errorMessage, isRecord,
} from './types';

/**
 * Block configuration: parsing + validation.
 * Documented schema (one way to do each thing):
 *
 *   sources:                      # or the shorthand `path: Some/Folder`
 *     - Attachments/Garden        # a folder
 *     - Attachments/hero.jpg      # a single file
 *     - "[[photo.png|My caption]]"  # a wiki-link (optional |caption)
 *     - path: Attachments/b.jpg   # object form allows caption / alt text
 *       caption: Back garden
 *       alt: Rows of tomato plants
 *   view: masonry | carousel
 *   sort: name | created | modified
 *   reverse: false
 *   recursive: false              # include sub-folders of folder sources
 *   captions: true
 *   perPage: 24                   # masonry only; 0 disables pagination
 *
 * ORDERING: images appear in the order the sources are written. `sort` applies
 * only to the files INSIDE each folder source; it never reorders explicit
 * files or moves one source's images among another's. So
 *   [hero.jpg, Folder A, Folder B]  ->  hero.jpg, A (sorted), B (sorted).
 */

export interface SourceEntry {
    /** Vault path or wiki-link text, exactly as the user wrote it. */
    target: string;
    caption?: string;
    alt?: string;
}

export interface GalleryConfig {
    sources: SourceEntry[];
    view?: ViewType;
    sort?: SortMode;
    reverse: boolean;
    recursive: boolean;
    captions?: boolean;
    perPage?: number;
}

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

const KNOWN_KEYS = ['sources', 'path', 'view', 'sort', 'reverse', 'recursive', 'captions', 'perPage'];
const MAX_SOURCES = 100;
const MAX_PER_PAGE = 200;

export function parseGalleryConfig(source: string): GalleryConfig {
    let raw: unknown;
    try {
        raw = parseYaml(source);
    } catch (error) {
        throw new ConfigError(`Invalid YAML: ${errorMessage(error)}`);
    }

    // An empty block yields null/undefined — the original code crashed here.
    if (!isRecord(raw)) {
        throw new ConfigError('Add at least one source, e.g. "path: Attachments/Garden".');
    }

    for (const key of Object.keys(raw)) {
        if (!KNOWN_KEYS.includes(key)) {
            throw new ConfigError(`Unknown option "${key}". Valid options: ${KNOWN_KEYS.join(', ')}.`);
        }
    }

    const entries: unknown[] = [];
    if (raw.path !== undefined) entries.push(raw.path);
    if (raw.sources !== undefined) {
        if (!Array.isArray(raw.sources)) throw new ConfigError('"sources" must be a list.');
        entries.push(...(raw.sources as unknown[]));
    }
    if (entries.length === 0) throw new ConfigError('Provide "path" or "sources".');
    if (entries.length > MAX_SOURCES) throw new ConfigError(`Too many sources (maximum ${MAX_SOURCES}).`);

    return {
        sources: entries.map(parseSource),
        view: optionalEnum(raw, 'view', VIEW_TYPES),
        sort: optionalEnum(raw, 'sort', SORT_MODES),
        reverse: optionalBool(raw, 'reverse') ?? false,
        recursive: optionalBool(raw, 'recursive') ?? false,
        captions: optionalBool(raw, 'captions'),
        perPage: optionalPerPage(raw),
    };
}

function parseSource(entry: unknown, index: number): SourceEntry {
    if (typeof entry === 'string') return { target: requireText(entry, `sources[${index}]`) };

    if (isRecord(entry)) {
        return {
            target: requireText(entry.path, `sources[${index}].path`),
            caption: optionalText(entry.caption, `sources[${index}].caption`),
            alt: optionalText(entry.alt, `sources[${index}].alt`),
        };
    }
    throw new ConfigError(`sources[${index}] must be a path string or an object with a "path".`);
}

function requireText(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ConfigError(`${label} must be a non-empty text value.`);
    }
    return value.trim();
}

function optionalText(value: unknown, label: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new ConfigError(`${label} must be text.`);
    return value;
}

function optionalBool(raw: Record<string, unknown>, key: string): boolean | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new ConfigError(`"${key}" must be true or false.`);
    return value;
}

function optionalEnum<T extends string>(
    raw: Record<string, unknown>, key: string, allowed: readonly T[],
): T | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (!allowed.includes(value as T)) {
        throw new ConfigError(`"${key}" must be one of: ${allowed.join(', ')}.`);
    }
    return value as T;
}

function optionalPerPage(raw: Record<string, unknown>): number | undefined {
    const value = raw.perPage;
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_PER_PAGE) {
        throw new ConfigError(`"perPage" must be a whole number from 0 to ${MAX_PER_PAGE}.`);
    }
    return value;
}
