import { setIcon } from 'obsidian';
import { GalleryView, ImageAsset, ViewOptions } from './types';

/**
 * Accessible carousel.
 *
 * - Real <button>s with aria-labels (keyboard + screen-reader friendly)
 * - Arrow keys / Home / End when the carousel has focus
 * - Swipe on touch devices
 * - Only the current image and its neighbours are ever downloaded
 *
 * TEACHING NOTE on cleanup: listeners attached to elements WE create are
 * garbage-collected together with those elements, so they need no teardown.
 * Only things that reference the outside world (observers, timers, vault
 * events) need explicit cleanup. This view has none, so destroy() is trivial.
 *
 * LIFECYCLE CONTRACT: one instance == one render() call. When the image list
 * changes, GalleryRenderer destroys this view and builds a new one, so the
 * per-instance state below (including `requested`) can never go stale.
 */
export class CarouselView implements GalleryView {
    /** Past this many images, dots become unusably small; show "3 / 40" instead. */
    private static readonly MAX_DOTS = 12;
    /** Pointer coordinates are CSS pixels, so this is DPI-independent. */
    private static readonly SWIPE_THRESHOLD_PX = 50;
    /** A swipe must be clearly horizontal, or it is probably a vertical scroll. */
    private static readonly SWIPE_AXIS_RATIO = 1.5;

    private index = 0;
    private images: ImageAsset[] = [];
    // Typed arrays instead of `container.children[i]` (which is `Element`, with
    // no `.style` — the compile error in the first draft).
    private slides: HTMLElement[] = [];
    private imgEls: HTMLImageElement[] = [];
    private dots: HTMLButtonElement[] = [];
    private counter: HTMLElement | null = null;
    private readonly requested = new Set<number>();

    constructor(
        private readonly container: HTMLElement,
        private readonly options: ViewOptions,
        /** Slide to open first (clamped to the valid range). */
        private readonly initialIndex = 0,
        /** Lets the owner remember where the user was across redraws. */
        private readonly onIndexChange?: (index: number) => void,
    ) {}

    render(images: ImageAsset[]): void {
        this.images = images;
        const count = images.length;

        const root = this.container.createDiv({
            cls: 'obs-gallery-carousel',
            attr: {
                role: 'region',
                'aria-roledescription': 'carousel',
                'aria-label': 'Image gallery',
                tabindex: '0', // focusable so arrow keys work
            },
        });
        const stage = root.createDiv({ cls: 'obs-gallery-carousel-stage', attr: { 'aria-live': 'polite' } });

        images.forEach((image, i) => {
            const slide = stage.createDiv({
                cls: 'obs-gallery-carousel-slide',
                attr: { role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${count}` },
            });
            // No `src` yet — assigned lazily in load().
            const img = slide.createEl('img', { attr: { alt: image.alt ?? image.name, decoding: 'async' } });
            img.addEventListener('error', () => {
                img.replaceWith(createDiv({ cls: 'obs-gallery-broken', text: `Could not load ${image.name}` }));
            });
            if (this.options.showCaptions) {
                slide.createDiv({ text: image.caption ?? image.name, cls: 'obs-gallery-caption' });
            }
            this.slides.push(slide);
            this.imgEls.push(img);
        });

        if (count > 1) {
            this.createNavButton(stage, 'prev', 'Previous image', 'chevron-left', -1);
            this.createNavButton(stage, 'next', 'Next image', 'chevron-right', 1);
            this.createFooter(root, count);
            this.attachKeyboard(root);
            this.attachSwipe(stage);
        }

        this.show(Math.min(Math.max(this.initialIndex, 0), count - 1));
    }

    private createNavButton(parent: HTMLElement, side: 'prev' | 'next', label: string, icon: string, step: number): void {
        const button = parent.createEl('button', {
            cls: `obs-gallery-nav ${side}`,
            attr: { type: 'button', 'aria-label': label },
        });
        setIcon(button, icon);
        button.addEventListener('click', () => this.show(this.index + step));
    }

    private createFooter(root: HTMLElement, count: number): void {
        const footer = root.createDiv({ cls: 'obs-gallery-carousel-footer' });
        if (count <= CarouselView.MAX_DOTS) {
            for (let i = 0; i < count; i++) {
                const dot = footer.createEl('button', {
                    cls: 'obs-gallery-dot',
                    attr: { type: 'button', 'aria-label': `Go to image ${i + 1}` },
                });
                dot.addEventListener('click', () => this.show(i));
                this.dots.push(dot);
            }
        } else {
            this.counter = footer.createSpan({ cls: 'obs-gallery-counter' });
        }
    }

    private attachKeyboard(root: HTMLElement): void {
        root.addEventListener('keydown', (event: KeyboardEvent) => {
            let target: number | null = null;
            switch (event.key) {
                case 'ArrowLeft': target = this.index - 1; break;
                case 'ArrowRight': target = this.index + 1; break;
                case 'Home': target = 0; break;
                case 'End': target = this.images.length - 1; break;
            }
            if (target === null) return;
            event.preventDefault(); // don't also scroll the page
            this.show(target);
        });
    }

    private attachSwipe(stage: HTMLElement): void {
        let start: { x: number; y: number } | null = null;
        // Mouse users have the buttons; swipe is for touch/pen only.
        stage.addEventListener('pointerdown', e => {
            start = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
        });
        stage.addEventListener('pointercancel', () => { start = null; });
        stage.addEventListener('pointerup', e => {
            if (start === null) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            start = null;
            const farEnough = Math.abs(dx) >= CarouselView.SWIPE_THRESHOLD_PX;
            const horizontal = Math.abs(dx) > Math.abs(dy) * CarouselView.SWIPE_AXIS_RATIO;
            if (farEnough && horizontal) this.show(this.index + (dx < 0 ? 1 : -1));
        });
    }

    /** Request an image's bytes once, the first time it is needed. */
    private load(i: number): void {
        if (this.requested.has(i)) return;
        this.requested.add(i);
        this.imgEls[i].src = this.images[i].url;
    }

    private show(next: number): void {
        const count = this.slides.length;
        if (count === 0) return;
        // Double modulo handles negative numbers: wrap-around in both directions.
        this.index = ((next % count) + count) % count;

        this.slides.forEach((slide, i) => slide.toggleClass('is-active', i === this.index));

        // Current + both neighbours, so the next click feels instant.
        for (const offset of [-1, 0, 1]) this.load((this.index + offset + count) % count);

        this.dots.forEach((dot, i) => {
            dot.toggleClass('is-active', i === this.index);
            dot.setAttribute('aria-current', String(i === this.index));
        });
        this.counter?.setText(`${this.index + 1} / ${count}`);
        this.onIndexChange?.(this.index);
    }

    destroy(): void {
        this.slides = [];
        this.imgEls = [];
        this.dots = [];
        this.requested.clear();
    }
}
