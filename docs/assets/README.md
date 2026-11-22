# Screenshot and GIF capture guide

This folder holds the visual assets used by the main [`README.md`](../../README.md). Follow this guide so every image looks consistent and the README links keep working.

## Assets

| File                       | Shows                                                      | Captured by           |
| -------------------------- | ---------------------------------------------------------- | --------------------- |
| `timeline-macro-dark.png`  | All projects fitted on screen, the three horizon lanes     | `npm run screenshots` |
| `timeline-macro-light.png` | Same view in light theme                                   | `npm run screenshots` |
| `timeline-micro-dark.png`  | Weeks zoom centered on today, with milestones              | `npm run screenshots` |
| `drawer-edit-dark.png`     | Side drawer editing a project, timeline visible behind it  | `npm run screenshots` |
| `drawer-edit-light.png`    | Same view in light theme                                   | `npm run screenshots` |
| `timeline-mobile-dark.png` | Phone layout (390×844)                                     | `npm run screenshots` |
| `demo-zoom.gif`            | Smooth `Ctrl + Scroll` zoom from macro to micro (optional) | By hand               |
| `demo-drawer.gif`          | Clicking a bar and editing progress live (optional)        | By hand               |
| `social-preview.png`       | 1280×640 image for _Settings → Social preview_ on GitHub   | By hand               |

## Naming convention

```text
<area>-<view-or-action>-<theme>.<ext>
```

- **kebab-case**, lower case only, no spaces or dates.
- `<theme>` is `dark` or `light`. GIFs start with `demo-` and have no theme suffix (record them in dark mode).
- When a screenshot is updated, **overwrite the file with the same name** so the README links keep working.

## How to capture

### Screenshots (automated)

```bash
npm run screenshots
```

The script ([`scripts/capture-screenshots.js`](../../scripts/capture-screenshots.js)) builds
the app, serves it with `vite preview` and drives your installed Chrome (or Edge, with
`HORIZON_BROWSER=msedge`) through `playwright-core`. Every capture starts from a clean
profile with the sample data, at 1440×900 and a 2× pixel ratio, with animations off, so
reruns are consistent. Sample dates are relative to the current day, which keeps the
"today" line in the middle of the content.

Review the images before committing: the script overwrites the files in place, so a
`git diff` shows exactly which ones changed. To add a view, add an entry to `SHOTS` in
the script.

### Animated GIFs

- Record with [ScreenToGif](https://www.screentogif.com) (Windows), [Kap](https://getkap.co) (macOS) or [Peek](https://github.com/phw/peek) (Linux).
- Settings: **1280 px wide**, **15–20 fps**, **5–8 seconds**, seamless loop when possible.
- Keep movements slow and deliberate: pause for about 1 second at the start and the end.
- Optimize with [gifski](https://gif.ski) or `gifsicle -O3 --lossy=80`. Aim for **under 5 MB** per GIF.
- For larger demos, prefer an `.mp4` uploaded through a GitHub issue or PR comment and link it in the README.

## Checklist before committing

- [ ] File name follows the convention above.
- [ ] No personal data on screen (use the sample data only).
- [ ] Image is within the size targets (PNG under 500 KB, GIF under 5 MB).
- [ ] Both themes look right when a light variant is added.
- [ ] README renders correctly on GitHub (check the PR preview).
