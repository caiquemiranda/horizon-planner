# Screenshot and GIF capture guide

This folder holds the visual assets used by the main [`README.md`](../../README.md). Follow this guide so every image looks consistent and the README links keep working.

## Required assets

| File                       | Shows                                                                      | Used in README |
| -------------------------- | -------------------------------------------------------------------------- | :------------: |
| `timeline-macro-dark.png`  | Macro view (years and quarters), all three horizon lanes visible           |       ✅       |
| `timeline-micro-dark.png`  | Micro view (weeks and days), zoomed on one or two projects with milestones |       ✅       |
| `drawer-edit-dark.png`     | Side drawer open while editing a project, timeline visible behind it       |       ✅       |
| `demo-zoom.gif`            | Smooth `Ctrl + Scroll` zoom from macro to micro, anchored on a project     |       ✅       |
| `timeline-macro-light.png` | Same as the macro view, in light theme                                     |    optional    |
| `drawer-edit-light.png`    | Same as the drawer view, in light theme                                    |    optional    |
| `demo-drawer.gif`          | Clicking a bar, editing progress and seeing the bar update live            |    optional    |
| `social-preview.png`       | 1280×640 image for _Settings → Social preview_ on GitHub                   |       –        |

## Naming convention

```text
<area>-<view-or-action>-<theme>.<ext>
```

- **kebab-case**, lower case only, no spaces or dates.
- `<theme>` is `dark` or `light`. GIFs start with `demo-` and have no theme suffix (record them in dark mode).
- When a screenshot is updated, **overwrite the file with the same name** so the README links keep working.

## How to capture

### Preparation

1. Run the production build for representative performance: `npm run build && npm run preview`.
2. Open the app in a clean browser profile (no extensions in the UI) at a **1440×900** viewport.
   In Chrome DevTools: _Toggle device toolbar_ (`Ctrl + Shift + M`) → _Responsive_ → `1440 × 900`.
3. Clear existing data (**Data → Clear all**) and click **Load sample data** so the content is consistent across captures.
4. Hide the mouse cursor in static screenshots, unless it shows an interaction such as a tooltip.

### Static screenshots (PNG)

- Use DevTools: `Ctrl + Shift + P` → **Capture screenshot**. This produces a pixel-perfect image at a 2× device pixel ratio when the zoom is set to `200%`.
- Target size: **2880×1800** (2× of 1440×900). The README displays them scaled down.
- Compress before committing: [Squoosh](https://squoosh.app) or `npx @squoosh/cli --oxipng {} file.png`. Aim for **under 500 KB** per image.

### Animated GIFs

- Record with [ScreenToGif](https://www.screentogif.com) (Windows), [Kap](https://getkap.co) (macOS) or [Peek](https://github.com/phw/peek) (Linux).
- Settings: **1280 px wide**, **15–20 fps**, **5–8 seconds**, seamless loop when possible.
- Keep movements slow and deliberate: pause for about 1 second at the start and the end.
- Optimize with [gifski](https://gif.ski) or `gifsicle -O3 --lossy=80`. Aim for **under 5 MB** per GIF.
- For larger demos, prefer an `.mp4` uploaded through a GitHub issue or PR comment and link it in the README.

## Checklist before committing

- [ ] File name follows the convention above.
- [ ] No personal data on screen (use the sample data only).
- [ ] Image is compressed within the size targets.
- [ ] Both themes look right when a light variant is added.
- [ ] README renders correctly on GitHub (check the PR preview).
