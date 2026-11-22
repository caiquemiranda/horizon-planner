# Horizon design system

The reference for every visual decision in Horizon. When building a new screen or
component, follow this document first and only add a new token when an existing one
cannot express the intent.

## Direction: a precision instrument

Horizon is a planning tool that people keep open for long sessions. It should feel like
a well-made instrument: calm, dense, exact, and fast.

| Principle                            | In practice                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Color belongs to the data**        | The interface is neutral (zinc). Saturated color is reserved for projects, horizons and the "today" marker, so the timeline is what the eye reads first. |
| **Quiet chrome, loud content**       | Borders are hairlines, panels differ by a few percent of lightness, labels are small and muted. Nothing in the chrome competes with the bars.            |
| **Numbers are data**                 | Dates, percentages and counts use Geist Mono with tabular figures, so columns align and values don't jump.                                               |
| **Motion explains, never decorates** | Animation only shows cause and effect: where something came from, what changed, what is interactive. Short, eased out, and disabled with reduced motion. |
| **Dark first, light equal**          | Dark is the default and the reference, but every token is defined and checked in both themes.                                                            |

Avoid: gradients on UI chrome, drop shadows on flat surfaces, more than one accent per
area, emoji in the interface, centered body text, and decorative animation.

## Color

All colors are CSS variables in [`src/styles/globals.css`](../src/styles/globals.css),
written in `oklch`, and exposed to Tailwind as `bg-*`, `text-*` and `border-*`
utilities.

### Surfaces (back to front)

| Token            | Use                                                                |
| ---------------- | ------------------------------------------------------------------ |
| `surface-sunken` | The timeline canvas, the deepest layer.                            |
| `background`     | Panels sitting on the canvas: sidebar, ruler.                      |
| `surface-raised` | Translucent, blurred chrome: header, drawer.                       |
| `popover`        | Floating layers: menus, tooltips, dialogs (with `shadow-popover`). |

### Text

| Token               | Use                                                       |
| ------------------- | --------------------------------------------------------- |
| `foreground`        | Titles, project names, primary values.                    |
| `muted-foreground`  | Secondary text, labels, minor ruler ticks.                |
| `subtle-foreground` | Hints and decorations that must stay readable but silent. |

### Lines

| Token           | Use                                               |
| --------------- | ------------------------------------------------- |
| `border`        | Panel edges, major grid lines.                    |
| `timeline-grid` | Minor grid lines, row separators. Barely visible. |
| `border-strong` | Hover and pressed outlines on neutral controls.   |

### Data colors

- **Horizons**: `horizon-short` (cyan), `horizon-medium` (violet), `horizon-long`
  (amber). Used only as small markers (dots, lane accents), never as large fills.
- **Projects**: the 10 Tailwind 500 colors listed in `COLOR_META`. A bar mixes its
  color with the canvas (`color-mix(in oklab, …)`; never mix in `oklch`, which shifts
  the hue when mixing with grays).
- **Today**: `today` (red). Reserved for the current-moment marker.

## Typography

Geist Variable for text, Geist Mono Variable for numbers and dates.

| Role          | Size / weight                         | Example                          |
| ------------- | ------------------------------------- | -------------------------------- |
| Page title    | 15px / 600                            | App name in the header           |
| Section title | 14px / 500                            | Lane names                       |
| Body          | 14px / 400                            | Sidebar project names            |
| Compact       | 12px / 500                            | Bar titles, buttons in toolbars  |
| Label         | 11px / 500, uppercase, tracking wider | Column headers (`text-label`)    |
| Numeric       | 11px mono, tabular                    | Percentages, counts, minor ticks |

Headings use `tracking-tight` and `text-balance`. Never go below 10px.

## Spacing, size and radius

- **4px grid.** Paddings and gaps are multiples of 4 (Tailwind units of 1).
- **Density.** Header 48px, ruler 56px, lane header 32px, project row 40px, bars 28px.
  The pixel values the layout math needs live in `TIMELINE_METRICS` and must match the
  CSS variables.
- **Radius.** `rounded-md` (8px) for controls and bars, `rounded-lg` (10px) for
  popovers, `rounded-full` only for dots and pills.

## Elevation

Flat surfaces are separated by lightness and hairlines, not shadows. Shadows are only
for layers that float above the page:

| Token            | Use                          |
| ---------------- | ---------------------------- |
| `shadow-xs`      | Outline buttons.             |
| `shadow-popover` | Menus, tooltips, the drawer. |

## Motion

| Token             | Value                               | Use                                          |
| ----------------- | ----------------------------------- | -------------------------------------------- |
| `--duration-fast` | 120ms                               | Hover, color and opacity changes.            |
| `--duration-base` | 180ms                               | Popovers, toggles, small layout changes.     |
| `--duration-slow` | 280ms                               | Drawer, viewport transitions.                |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)`     | Default for everything that enters or moves. |
| `--ease-spring`   | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Small "pop" feedback only.                   |

Rules:

- Feedback is small and fast: buttons scale to 97% while pressed and changing counters
  "pop" (`animate-pop`, `--ease-spring`). Both are `motion-safe` only.

- Animate `transform` and `opacity`. Avoid animating layout properties on many
  elements at once (the timeline can render hundreds of bars).
- Exits are faster than entrances.
- `prefers-reduced-motion` turns every animation into an instant change (handled
  globally in `globals.css`).
- Larger orchestrated animations (drawer, viewport interpolation) use the
  [Motion](https://motion.dev) library with the same durations and easings.

## Components

- **Buttons**: shadcn/ui variants. Toolbars use `outline` or `ghost` at size `sm`. One
  `default` (primary) button per view at most.
- **Tooltips**: plain tooltips (`variant="default"`) are short labels. Rich content
  (project summaries) uses `variant="card"`: popover surface, border and shadow.
- **Icons**: Lucide, 16px in buttons, 14px inline, `aria-hidden` when decorative.
- **Focus**: every interactive element shows a 2px ring on `:focus-visible`. Never
  remove outlines without a replacement.

## Timeline specifics

- **Bars**: tinted fill (16% of the project color), 50% border, a solid 2px rail on
  the left edge, progress as a stronger fill from the left. The title stays pinned to
  the visible edge when the bar starts off-screen.
- **Status** is encoded by texture, not by new colors: planned = dashed border,
  paused = diagonal stripes, completed = check mark and reduced opacity,
  cancelled = strikethrough and lower opacity.
- **Milestones**: 8px diamonds; filled when completed, hollow when pending.
- **Today**: 2px red line across the canvas with a "Hoje" pill on the ruler.
- **Weekends** are shaded when the zoom shows individual days.
- **Hover** on a project highlights its row in both the sidebar and the canvas.

## Accessibility

- Text contrast meets WCAG AA in both themes (4.5:1 body, 3:1 large text and UI parts).
- Color is never the only signal: status has texture or icons, horizons have labels.
- Every icon-only button has an `aria-label`; decorative elements are `aria-hidden`.
- The timeline region, lanes and project lists have accessible names in pt-BR.
