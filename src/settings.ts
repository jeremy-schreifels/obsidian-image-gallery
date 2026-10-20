import { App, PluginSettingTab, Setting, debounce } from 'obsidian';
import type GalleryPlugin from './main';
import {
    SORT_MODES, VIEW_TYPES, SortMode, ViewType,
    clampInt, isRecord, isSortMode, isViewType,
} from './types';

export interface GallerySettings {
    defaultView: ViewType;
    defaultSort: SortMode;
    showCaptions: boolean;
    captionMaxLines: number;
    enablePagination: boolean;
    itemsPerPage: number;
}

export const DEFAULT_SETTINGS: GallerySettings = {
    defaultView: 'masonry',
    defaultSort: 'name',
    showCaptions: true,
    captionMaxLines: 2,
    // On by default: with hundreds of photos, rendering everything is the
    // slowest thing this plugin can do. Users can turn it off.
    enablePagination: true,
    itemsPerPage: 24,
};

/**
 * data.json is a plain text file users can hand-edit (or that an older version
 * wrote). Never spread it straight into your settings: validate every field
 * and fall back to the default for anything missing or malformed.
 */
export function sanitizeSettings(raw: unknown): GallerySettings {
    const data = isRecord(raw) ? raw : {};
    const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
    return {
        defaultView: isViewType(data.defaultView) ? data.defaultView : DEFAULT_SETTINGS.defaultView,
        defaultSort: isSortMode(data.defaultSort) ? data.defaultSort : DEFAULT_SETTINGS.defaultSort,
        showCaptions: bool(data.showCaptions, DEFAULT_SETTINGS.showCaptions),
        captionMaxLines: clampInt(data.captionMaxLines, 1, 5, DEFAULT_SETTINGS.captionMaxLines),
        enablePagination: bool(data.enablePagination, DEFAULT_SETTINGS.enablePagination),
        itemsPerPage: clampInt(data.itemsPerPage, 6, 100, DEFAULT_SETTINGS.itemsPerPage),
    };
}

const LABELS: Record<string, string> = {
    masonry: 'Masonry', carousel: 'Carousel',
    name: 'Name', created: 'Date created', modified: 'Date modified',
};
const toOptions = (values: readonly string[]) =>
    Object.fromEntries(values.map(v => [v, LABELS[v] ?? v]));

export class GallerySettingTab extends PluginSettingTab {
    // Sliders fire onChange continuously while dragging. Saving (and re-rendering
    // every open gallery) on each tick would be wasteful, so wait for a pause.
    private readonly queueSave = debounce(() => void this.plugin.saveSettings(), 300, true);

    constructor(app: App, private readonly plugin: GalleryPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        const settings = this.plugin.settings;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Default view')
            .setDesc('Used when a gallery block does not specify a view.')
            .addDropdown(dropdown => dropdown
                .addOptions(toOptions(VIEW_TYPES))
                .setValue(settings.defaultView)
                .onChange(value => {
                    if (isViewType(value)) settings.defaultView = value;
                    this.queueSave();
                }));

        new Setting(containerEl)
            .setName('Default sort order')
            .setDesc('How images inside a folder are ordered. Names are sorted naturally (img2 before img10).')
            .addDropdown(dropdown => dropdown
                .addOptions(toOptions(SORT_MODES))
                .setValue(settings.defaultSort)
                .onChange(value => {
                    if (isSortMode(value)) settings.defaultSort = value;
                    this.queueSave();
                }));

        new Setting(containerEl)
            .setName('Show captions')
            .setDesc('Display a caption below each image (the file name unless you set one).')
            .addToggle(toggle => toggle
                .setValue(settings.showCaptions)
                .onChange(value => {
                    settings.showCaptions = value;
                    this.queueSave();
                }));

        // Sliders enforce valid ranges, so there is no "type abc and nothing
        // happens" failure mode like the original text boxes had.
        new Setting(containerEl)
            .setName('Caption max lines')
            .setDesc('Truncate longer captions after this many lines.')
            .addSlider(slider => slider
                .setLimits(1, 5, 1)
                .setValue(settings.captionMaxLines)
                .setDynamicTooltip()
                .onChange(value => {
                    settings.captionMaxLines = value;
                    this.queueSave();
                }));

        new Setting(containerEl)
            .setName('Enable pagination')
            .setDesc('Split large masonry galleries into pages. Carousels load images on demand and ignore this.')
            .addToggle(toggle => toggle
                .setValue(settings.enablePagination)
                .onChange(async value => {
                    settings.enablePagination = value;
                    // Save FIRST, then redraw (the draft redrew before saving).
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (settings.enablePagination) {
            new Setting(containerEl)
                .setName('Images per page')
                .setDesc('Maximum number of images on one page.')
                .addSlider(slider => slider
                    .setLimits(6, 100, 6)
                    .setValue(settings.itemsPerPage)
                    .setDynamicTooltip()
                    .onChange(value => {
                        settings.itemsPerPage = value;
                        this.queueSave();
                    }));
        }
    }
}
