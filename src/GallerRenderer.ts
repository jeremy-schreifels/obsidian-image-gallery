import { MarkdownRenderChild, TAbstractFile, TFile, TFolder, debounce } from 'obsidian';
import type GalleryPlugin from './main';
import { GalleryConfig } from './config';
import { isImageFile, resolveImages } from './ImageResolver';
import { CarouselView } from './CarouselView';
import { MasonryView } from './MasonryView';
import { GalleryView, ImageAsset, SortMode } from './types';

/**
 * Owns one rendered `obs-gallery` block.
 */
export class GalleryRenderer extends MarkdownRenderChild {
    private images: ImageAsset[] = [];
    private warnings: string[] = [];
    private page = 0;
    private view: GalleryView | null = null;
    private pendingFocus: 'prev' | 'next' | null = null;
    /** Sort mode the current `images` list was built with (see settingsChanged). */
    private lastSort: SortMode | null = null;
    /**
     * Remember the carousel position by image PATH, not index: if files are
     * added or removed, the user stays on the same picture.
     */
    private carouselPath: string | null = null;

    /** Vault events can arrive in bursts (e.g. pasting 50 files); wait for quiet. */
    private readonly scheduleReload = debounce(() => this.fetchImages(), 300, true);

    constructor(
        private readonly plugin: GalleryPlugin,
        containerEl: HTMLElement,
        private readonly config: GalleryConfig,
        private readonly sourcePath: string,
    ) {
        super(containerEl);
    }

    onload(): void {
        this.plugin.galleries.add(this); // so settings changes can refresh us

        const { vault } = this.plugin.app;
        this.registerEvent(vault.on('create', file => this.onVaultChange(file)));
        this.registerEvent(vault.on('delete', file => this.onVaultChange(file)));
        this.registerEvent(vault.on('rename', file => this.onVaultChange(file)));

        this.fetchImages();
    }

    onunload(): void {
        this.plugin.galleries.delete(this);
        this.scheduleReload.cancel();
        this.destroyView();
    }

    /**
     * Scan the vault for images, then redraw. Use when the FILES may have
     * changed (first load, vault events). Cosmetic changes should call draw().
     */
    fetchImages(): void {
        const options = this.effectiveOptions();
        this.lastSort = options.sort;
        const result = resolveImages(this.plugin.app, {
            sources: this.config.sources,
            sort: options.sort,
            reverse: this.config.reverse,
            recursive: this.config.recursive,
            sourcePath: this.sourcePath,
        });
        this.images = result.images;
        this.warnings = result.warnings;
        this.draw();
    }

    /**
     * Called by the plugin after settings are saved. Most settings are purely
     * cosmetic, so a redraw is enough. Only the sort order changes WHICH images
     * come out in WHAT order, so only then do we pay for a vault scan.
     */
    settingsChanged(): void {
        if (this.effectiveOptions().sort !== this.lastSort) this.fetchImages();
        else this.draw();
    }

    /**
     * Per-block YAML wins over global settings, which win over defaults.
     * Computed on demand (not cached) so settings changes take effect.
     */
    private effectiveOptions() {
        const settings = this.plugin.settings;
        const config = this.config;
        return {
            view: config.view ?? settings.defaultView,
            sort: config.sort ?? settings.defaultSort,
            showCaptions: config.captions ?? settings.showCaptions,
            perPage: config.perPage ?? (settings.enablePagination ? settings.itemsPerPage : 0),
        };
    }

    private onVaultChange(file: TAbstractFile): void {
        // Ignore notes, plugins' data files, etc. Only images and folders matter.
        const relevant = file instanceof TFolder || (file instanceof TFile && isImageFile(file));
        if (relevant) this.scheduleReload();
    }

    private draw(): void {
        this.destroyView();
        const el = this.containerEl;
        el.empty();
        el.addClass('obs-gallery-wrapper');

        const options = this.effectiveOptions();
        // Caption clamping is driven by a CSS variable, not inline line-clamp styles.
        el.setCssProps({ '--obs-gallery-caption-lines': String(this.plugin.settings.captionMaxLines) });

        if (this.warnings.length > 0) {
            const list = el.createDiv({ cls: 'obs-gallery-warnings' });
            this.warnings.forEach(w => list.createDiv({ text: w }));
        }

        if (this.images.length === 0) {
            el.createDiv({ text: 'No images found.', cls: 'obs-gallery-empty' });
            return;
        }

        // A carousel only downloads 3 images at a time, so pagination would just
        // add a second, confusing layer of navigation. It applies to masonry only.
        const paginate = options.view === 'masonry' && options.perPage > 0 && this.images.length > options.perPage;
        const totalPages = paginate ? Math.ceil(this.images.length / options.perPage) : 1;
        // Clamp: the image count or page size may have changed since last draw.
        this.page = Math.min(Math.max(this.page, 0), totalPages - 1);

        const visible = paginate
            ? this.images.slice(this.page * options.perPage, (this.page + 1) * options.perPage)
            : this.images;

        const holder = el.createDiv({ cls: 'obs-gallery-view' });
        const viewOptions = { showCaptions: options.showCaptions };
        if (options.view === 'carousel') {
            const found = this.images.findIndex(image => image.path === this.carouselPath);
            this.view = new CarouselView(
                holder, viewOptions, Math.max(found, 0),
                index => { this.carouselPath = this.images[index]?.path ?? null; },
            );
        } else {
            this.view = new MasonryView(holder, viewOptions);
        }
        this.view.render(visible);

        if (paginate) this.renderPagination(totalPages);
    }

    private renderPagination(totalPages: number): void {
        const nav = this.containerEl.createEl('nav', {
            cls: 'obs-gallery-pagination',
            attr: { 'aria-label': 'Gallery pages' },
        });

        // TEACHING NOTE: a truly `disabled` button cannot hold keyboard focus, so
        // focus would be thrown away at the first/last page. `aria-disabled`
        // announces the same state to assistive tech while keeping focus put;
        // the click handlers simply ignore presses at the ends.
        const prev = nav.createEl('button', {
            text: 'Previous',
            attr: { type: 'button', 'aria-disabled': String(this.page === 0) },
        });
        prev.addEventListener('click', () => {
            if (this.page > 0) this.goToPage(this.page - 1, 'prev');
        });

        nav.createSpan({ text: `Page ${this.page + 1} of ${totalPages}` });

        const next = nav.createEl('button', {
            text: 'Next',
            attr: { type: 'button', 'aria-disabled': String(this.page === totalPages - 1) },
        });
        next.addEventListener('click', () => {
            if (this.page < totalPages - 1) this.goToPage(this.page + 1, 'next');
        });

        // We rebuild the DOM on every page change, which drops keyboard focus.
        // Put it back on the button the user just used.
        if (this.pendingFocus) {
            (this.pendingFocus === 'prev' ? prev : next).focus({ preventScroll: true });
            this.pendingFocus = null;
        }
    }

    private goToPage(page: number, focus: 'prev' | 'next'): void {
        this.page = page;
        this.pendingFocus = focus;
        this.draw();
        // Bring the top of the gallery back into view (the old content was taller).
        this.containerEl.scrollIntoView({ block: 'start' });
    }

    private destroyView(): void {
        this.view?.destroy();
        this.view = null;
    }
}
