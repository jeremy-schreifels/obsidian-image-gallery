import { App, TFile, TFolder, Vault, normalizePath } from 'obsidian';
import { SourceEntry } from './config';
import { ImageAsset, SortMode } from './types';

/**
 * Turns user-written sources into a flat, de-duplicated list of images.
 *
 * Pure "vault in, data out": no DOM here. Keeping data logic away from
 * rendering logic makes both easier to reason about and to test.
 */

// SVG is safe here: browsers never execute scripts inside an <img>.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);

/** Safety valve: a runaway folder must not freeze the editor. */
const MAX_IMAGES = 2000;

// Matches [[file.png]], ![[file.png]] and [[file.png|caption]]
const WIKILINK = /^!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/;

export interface ResolveOptions {
    sources: SourceEntry[];
    sort: SortMode;
    reverse: boolean;
    recursive: boolean;
    /** Note containing the block; needed to resolve relative wiki-links. */
    sourcePath: string;
}

export interface ResolveResult {
    images: ImageAsset[];
    /** Non-fatal problems (missing path etc.). Shown to the user, not thrown. */
    warnings: string[];
}

export const isImageFile = (file: TFile): boolean =>
    IMAGE_EXTENSIONS.has(file.extension.toLowerCase());

export function resolveImages(app: App, options: ResolveOptions): ResolveResult {
    const images: ImageAsset[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>(); // de-duplicate by vault path
    const compare = makeComparator(options.sort, options.reverse);

    const add = (file: TFile, caption?: string, alt?: string): void => {
        if (seen.has(file.path)) return;
        if (images.length >= MAX_IMAGES) return;
        seen.add(file.path);
        images.push({
            name: file.basename,
            path: file.path,
            // vault.getResourcePath(file) is the supported API; it also appends
            // an mtime query so edited images aren't served from a stale cache.
            url: app.vault.getResourcePath(file),
            caption,
            alt,
        });
    };

    // Every source is honoured, in the order written. (The first draft used
    // `.find()` and silently dropped all but the first source.)
    for (const source of options.sources) {
        const wiki = WIKILINK.exec(source.target);
        let caption = source.caption;
        let entry;

        if (wiki) {
            entry = app.metadataCache.getFirstLinkpathDest(wiki[1].trim(), options.sourcePath);
            if (caption === undefined && wiki[2]?.trim()) caption = wiki[2].trim();
        } else {
            // normalizePath fixes backslashes, doubled/trailing slashes, etc.
            entry = app.vault.getAbstractFileByPath(normalizePath(source.target));
        }

        if (!entry) {
            warnings.push(`Not found: ${source.target}`);
        } else if (entry instanceof TFile) {
            if (isImageFile(entry)) add(entry, caption, source.alt);
            else warnings.push(`Not a supported image: ${source.target}`);
        } else if (entry instanceof TFolder) {
            const files: TFile[] = [];
            if (options.recursive) {
                Vault.recurseChildren(entry, child => {
                    if (child instanceof TFile) files.push(child);
                });
            } else {
                for (const child of entry.children) if (child instanceof TFile) files.push(child);
            }
            // Sort only within a folder, so explicit file order stays as written.
            files.filter(isImageFile).sort(compare).forEach(file => add(file));
        }
    }

    if (images.length >= MAX_IMAGES) {
        warnings.push(`Showing the first ${MAX_IMAGES} images only.`);
    }
    return { images, warnings };
}

function makeComparator(sort: SortMode, reverse: boolean): (a: TFile, b: TFile) => number {
    const direction = reverse ? -1 : 1;
    return (a, b) => {
        let diff: number;
        switch (sort) {
            case 'created': diff = a.stat.ctime - b.stat.ctime; break;
            case 'modified': diff = a.stat.mtime - b.stat.mtime; break;
            // `numeric: true` makes "img2" sort before "img10".
            default: diff = a.basename.localeCompare(b.basename, undefined, { numeric: true, sensitivity: 'base' });
        }
        // Tie-breaker keeps ordering stable and deterministic.
        if (diff === 0) diff = a.path.localeCompare(b.path, undefined, { numeric: true });
        return diff * direction;
    };
}
