import { GalleryView, ImageAsset, ViewOptions } from './types';

/**
 * Masonry layout using CSS grid + computed row spans.
 *
 * Why not CSS columns? Columns fill top-to-bottom, which scrambles the order.
 * Grid keeps items in reading order (left-to-right), and we make it look like
 * masonry by letting each item span as many tiny rows as its height needs.
 *
 * The math: an item spanning n rows of height R with gap G occupies
 *     n*R + (n-1)*G   pixels.
 * Solving for the smallest n that fits content height H gives
 *     n = ceil((H + G) / (R + G)).
 */
export class MasonryView implements GalleryView {
    private grid: HTMLElement | null = null;
    private items: HTMLElement[] = [];
    private observer: ResizeObserver | null = null;
    private frame: number | null = null;
    private lastWidth: number | null = null;

    constructor(
        private readonly container: HTMLElement,
        private readonly options: ViewOptions,
    ) {}

    render(images: ImageAsset[]): void {
        const grid = this.container.createDiv({ cls: 'obs-gallery-masonry' });
        this.grid = grid;

        for (const image of images) {
            const item = grid.createDiv({ cls: 'obs-gallery-masonry-item' });

            // loading=lazy: the browser only fetches images near the viewport.
            // `is-loading` gives the <img> a placeholder aspect ratio in CSS so
            // un-loaded images don't all collapse to one row and load at once.
            const img = item.createEl('img', {
                cls: 'is-loading',
                attr: { src: image.url, alt: image.alt ?? image.name, loading: 'lazy', decoding: 'async' },
            });

            img.addEventListener('load', () => {
                img.removeClass('is-loading');
                this.scheduleLayout();
            });
            img.addEventListener('error', () => {
                // Replace the broken image with a visible placeholder.
                img.replaceWith(createDiv({ cls: 'obs-gallery-broken', text: `Could not load ${image.name}` }));
                this.scheduleLayout();
            });

            if (this.options.showCaptions) {
                item.createDiv({ text: image.caption ?? image.name, cls: 'obs-gallery-caption' });
            }
            this.items.push(item);
        }

        // Column width changes whenever the pane resizes, which changes every
        // image's height. Recompute on resize (the first draft never did).
        //
        // Only react to WIDTH changes. Our own layout pass changes the grid's
        // HEIGHT, which fires this observer again; without the guard every pass
        // would trigger a pointless second one. (We cannot compare column COUNT
        // instead: with `1fr` columns, any width change resizes every image.)
        this.observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width ?? 0;
            if (width === this.lastWidth) return;
            this.lastWidth = width;
            this.scheduleLayout();
        });
        this.observer.observe(grid);
    }

    /**
     * Coalesce many triggers (dozens of image loads, resize events) into at most
     * one layout pass per animation frame.
     */
    private scheduleLayout(): void {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.layout();
        });
    }

    private layout(): void {
        const grid = this.grid;
        if (!grid || !grid.isConnected) return;

        // Single source of truth is the CSS: read row height and gap from it.
        const style = getComputedStyle(grid);
        const rowHeight = parseFloat(style.gridAutoRows) || 10;
        const gap = parseFloat(style.rowGap) || 0;

        // Batch reads, THEN writes. Interleaving them forces the browser to
        // recalculate layout on every iteration ("layout thrashing").
        const spans = this.items.map(item =>
            Math.max(1, Math.ceil((item.offsetHeight + gap) / (rowHeight + gap))));

        // A CSS variable (consumed by `grid-row-end` in styles.css) instead of
        // an inline `style.gridRowEnd`: styling stays in the stylesheet.
        this.items.forEach((item, i) => item.setCssProps({ '--obs-gallery-span': String(spans[i]) }));
    }

    destroy(): void {
        this.observer?.disconnect();
        this.observer = null;
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.items = [];
        this.grid = null;
    }
}
