import { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { ConfigError, parseGalleryConfig } from './config';
import { GalleryRenderer } from './GalleryRenderer';
import { GallerySettingTab, GallerySettings, sanitizeSettings } from './settings';
import { errorMessage } from './types';

/**
 * Entry point. Deliberately thin: wire things together, nothing more.
 * Parsing lives in config.ts, data in ImageResolver.ts, drawing in the views.
 */
export default class GalleryPlugin extends Plugin {
    settings!: GallerySettings;

    /**
     * Every live gallery on screen. Renderers add/remove themselves in
     * onload/onunload, so a settings change can refresh them all without
     * the user reopening notes.
     */
    readonly galleries = new Set<GalleryRenderer>();

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new GallerySettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor(
            'obs-gallery',
            (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                try {
                    const config = parseGalleryConfig(source);
                    // addChild ties the renderer's lifecycle to this block.
                    ctx.addChild(new GalleryRenderer(this, el, config, ctx.sourcePath));
                } catch (error) {
                    el.createDiv({
                        // `text:` is inserted as plain text, never parsed as HTML.
                        text: error instanceof ConfigError
                            ? `Gallery configuration error: ${error.message}`
                            : `Gallery error: ${errorMessage(error)}`,
                        cls: 'obs-gallery-error',
                        attr: { role: 'alert' },
                    });
                }
            },
        );
    }

    async loadSettings(): Promise<void> {
        this.settings = sanitizeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.galleries.forEach(gallery => gallery.settingsChanged());
    }
}
