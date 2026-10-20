# Image Gallery for Obsidian

A plugin to display images from your vault inside a note as either a **masonry grid** or a
**carousel**. It works with specific images, whole folders, or a mix of both.

## What it does
- Renders a fenced code block named `obs-gallery` as a gallery.
- Two view styles:
  - **masonry** (a tightly packed grid that keeps your images in reading order)
  - **carousel** (one image at a time, with arrows, dots, keyboard and swipe support)
- Accepts specific files, folders, or wiki-links, in any combination.
- Optional **captions** and **pagination**, set globally in the plugin settings and overridable per gallery.
- Updates itself when you add, rename, or delete images, and when you change settings. No need to reopen the note.
- Follows your theme, works on desktop and mobile, and supports keyboard and screen-reader use.

## Quick start
Add a code block to any note. Use the language name `obs-gallery`.

### A collection of two specific images
````markdown
```obs-gallery
sources:
  - Attachments/Garden/tomatoes.jpg
  - Attachments/Garden/greenhouse.jpg
```
````

Paths are relative to the vault root. You can also use wiki-links, which resolve
the same way Obsidian resolves links in your notes:

````markdown
```obs-gallery
sources:
  - "[[tomatoes.jpg]]"
  - "[[greenhouse.jpg]]"
```
````

### A folder of images
````markdown
```obs-gallery
path: Attachments/Garden
```
````

`path:` is shorthand for a single source. Add `recursive: true` to include
images in sub-folders.

### Masonry view
Masonry is the default, so `view` is optional. State it explicitly for clarity:

````markdown
```obs-gallery
path: Attachments/Garden
view: masonry
```
````

### Carousel view
````markdown
```obs-gallery
path: Attachments/Garden
view: carousel
```
````

Carousel controls: previous/next buttons, a dot for each image (or a "3 / 40"
counter when there are more than 12), **Left/Right arrow keys**, **Home**, and
**End** when the carousel is focused, and swipe gestures on touch screens.

## Captions
By default, each image is captioned with its **file name** (without extension).

**Turn captions on or off everywhere:** Settings → Image Gallery → *Show captions*.

**Turn them off for one gallery:**
````markdown
```obs-gallery
path: Attachments/Garden
captions: false
```
````

**Write your own caption for a specific image.** Use the object form:
````markdown
```obs-gallery
sources:
  - path: Attachments/Garden/tomatoes.jpg
    caption: Tomatoes in late July
    alt: Rows of staked tomato plants in raised beds
  - path: Attachments/Garden/greenhouse.jpg
    caption: The new greenhouse
```
````

Or use the text after the `|` in a wiki-link:

````markdown
```obs-gallery
sources:
  - "[[tomatoes.jpg|Tomatoes in late July]]"
```
````

`alt` is optional. It is the description read aloud by screen readers; if you
leave it out, the file name is used. Long captions are truncated after the
number of lines set in *Caption max lines* (1 to 5).

## Pagination
Pagination splits a large **masonry** gallery into pages with Previous/Next
buttons, so a folder of hundreds of photos does not render all at once.

**Globally:** Settings → Image Gallery → *Enable pagination* and *Images per
page*. It is on by default, with 24 images per page.

**For one gallery:** use `perPage`.

````markdown
```obs-gallery
path: Attachments/Garden
view: masonry
perPage: 12
```
````

Set `perPage: 0` to show everything on one page, even if pagination is on globally:

````markdown
```obs-gallery
path: Attachments/Garden
perPage: 0
```
````

Carousels ignore pagination. They only load the current image and its
neighbours, so every image is reachable with the normal controls.

## Ordering
Images appear **in the order your sources are written**. `sort` and `reverse`
apply only to the files *inside each folder source*. They never reorder
explicit files or mix one source's images with another's.

````markdown
```obs-gallery
sources:
  - Attachments/hero.jpg      # always first
  - Attachments/Garden        # then this folder, sorted
  - Attachments/Orchard       # then this folder, sorted
sort: modified
```
````

`sort` is `name` (natural order, so `img2` comes before `img10`), `created`, or
`modified`. The date options go oldest first; add `reverse: true` for newest first.
Duplicate images are shown once.

## Options reference
| Option | Values | Default | Notes |
|---|---|---|---|
| `path` | text | none | Shorthand for a single source. |
| `sources` | list | none | Each item is a path, a `[[wiki-link]]`, or `{path, caption, alt}`. Up to 100. |
| `view` | `masonry`, `carousel` | plugin setting | |
| `sort` | `name`, `created`, `modified` | plugin setting | Applies within each folder. |
| `reverse` | `true`, `false` | `false` | Reverses the sort within each folder. |
| `recursive` | `true`, `false` | `false` | Include sub-folders of folder sources. |
| `captions` | `true`, `false` | plugin setting | |
| `perPage` | 0 to 200 | plugin setting | Masonry only. `0` disables pagination. |

You need `path` or `sources`; everything else is optional. Anything you leave
out falls back to the plugin settings. Unknown options and wrong values are
reported with a clear message instead of being silently ignored.

Supported formats: PNG, JPG/JPEG, GIF, WebP, AVIF, BMP, SVG. A single gallery
shows up to 2000 images.

## Plugin settings
| Setting | What it does |
|---|---|
| Default view | View used when a block does not set `view`. |
| Default sort order | Folder sort used when a block does not set `sort`. |
| Show captions | Global caption switch. |
| Caption max lines | Truncate captions after 1 to 5 lines. |
| Enable pagination | Page large masonry galleries. |
| Images per page | Page size when pagination is on. |

Changes apply immediately to every gallery that is open.

## Troubleshooting
- **"No images found."** The path may be wrong or the folder empty. Check spelling and capitalization, and remember paths start at the vault root.
- **A yellow "Not found: ..." line** appears above the gallery when one of several sources cannot be located. The rest still display.
- **"Gallery configuration error: ..."** tells you which option is invalid. Check indentation: YAML needs spaces, not tabs, and a space after each colon.
- **Quotes around wiki-links.** Write `"[[photo.png]]"` with quotes, otherwise YAML reads the brackets as a list.

## How the code is structured
```
obs-gallery/
├── manifest.json            Plugin metadata for Obsidian
├── styles.css               Theme-aware styling (uses Obsidian CSS variables)
├── tsconfig.json            Strict TypeScript settings
└── src/
    ├── main.ts              Entry point: registers the code block and settings; thin wiring only
    ├── config.ts            Parses and validates the YAML block; produces readable errors
    ├── ImageResolver.ts     Turns sources into a de-duplicated, sorted list of images (data only, no DOM)
    ├── GalleryRenderer.ts   Owns one gallery on screen: lifecycle, vault events, pagination, view choice
    ├── MasonryView.ts       Masonry layout (CSS grid + computed row spans, ResizeObserver)
    ├── CarouselView.ts      Accessible carousel (buttons, keyboard, swipe, lazy loading)
    ├── settings.ts          Settings model, validation of saved data, settings tab
    └── types.ts             Shared types, allowed-value lists, small helpers
```

**Data flow:**
1. `main.ts` hands each `obs-gallery` block's text to `config.ts`, which returns a validated config or a readable error.
2. A `GalleryRenderer` is attached to the block, so Obsidian tells it when the block appears and disappears.
3. The renderer asks `ImageResolver.ts` for the images, merges block options over plugin settings, and creates a `MasonryView` or `CarouselView`.
4. Vault events (images added, renamed, deleted) trigger a rescan. Settings changes trigger a redraw, and a rescan only if the sort order changed.

**Design principles worth copying:**
- **Separate data from drawing.** `ImageResolver` never touches the DOM; the views never touch the vault.
- **Validate everything users can type**, including YAML blocks and the saved settings file.
- **Give every object a clear owner and teardown.** The renderer releases its observers and listeners when the block is removed.
- **Use Obsidian's APIs** (`getResourcePath`, `normalizePath`, `setCssProps`, `setIcon`) and CSS variables rather than raw DOM or hard-coded styling.
- **Build accessibility in** from the start: real buttons, labels, keyboard support, `aria-disabled`, reduced-motion support.

## Development
Type-check with:

```
npm install --save-dev obsidian typescript
npx tsc -p tsconfig.json
```

To produce the `main.js` that Obsidian loads, bundle `src/main.ts` with esbuild
using the standard Obsidian sample-plugin setup (not included here). Then copy
`main.js`, `manifest.json`, and `styles.css` into
`<your vault>/.obsidian/plugins/obs-gallery/` and enable the plugin under
Settings → Community plugins.

Style tweak via a CSS snippet:
```css
.obs-gallery-wrapper { --obs-gallery-gap: 8px; }
```
