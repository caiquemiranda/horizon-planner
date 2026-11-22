# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Responsive layout for phones and small tablets: narrower lane sidebar, icon-only header buttons and a scrollable toolbar.
- Accessibility: skip link to the timeline, spoken descriptions for project bars and automated axe-core checks of the main screens.
- Press feedback on buttons and a "pop" on the active filters count (only when motion is allowed).
- "Dados" menu to export a JSON backup, import one (validated as a whole, with the invalid fields listed), load sample data and clear all projects, with confirmation before replacing data.
- Sample data with dates relative to the current day, also offered from the empty timeline.
- Filters by horizon, status and category with faceted counts, an active filters bar and a filtered empty state; the project being edited stays visible.
- Side drawer to create, edit and delete projects, with edits synced live to the timeline and saved automatically.
- Project form with horizon suggestion from the dates, progress, category suggestions, color picker and milestones editor.
- Projects store with optimistic updates and automatic recovery when saving fails.
- `N` shortcut and "Novo projeto" button, plus a call to action in the empty timeline.
- Zoom anchored on the cursor with `Ctrl` + wheel, trackpad pinch and touch pinch, with smooth transitions.
- Drag to pan, `Shift` + wheel and horizontal trackpad swipes to move through time.
- Zoom controls with presets (years to days) and "fit all projects".
- Keyboard shortcuts (`+`/`-`, arrows, `1`–`5`, `T`, `F`, `?`) with an in-app help panel.
- Design system guidelines (`docs/design.md`) with refined color, elevation and motion tokens.
- Visible date range in the header, weekend shading at day zoom and synced hover between the sidebar and the bars.
- Timeline with a two-level time ruler, grid lines and collapsible horizon lanes.
- Project bars showing progress, status and milestones, plus hover tooltips with dates and duration.
- "Today" indicator and a button to center the timeline on the current date.
- App shell with header, brand mark, version badge and the three horizon lanes.
- Dark theme by default, light theme and "system" mode, persisted and applied before first paint.
- Project scaffold with Vite 7, React 19 and TypeScript in strict mode.
- Tailwind CSS v4 design tokens (dark and light themes), shadcn/ui configuration and Geist typography.
- ESLint (type-aware), Prettier, Husky, Commitlint and lint-staged.
- Vitest and React Testing Library with coverage reports.
- GitHub Actions CI running format check, lint, type-check, tests and build on every pull request.
- Issue templates (bug report, feature request) and a pull request template.
- README, contributing guide, MIT license, architecture decision records and screenshot capture guide.

### Fixed

- The timeline canvas no longer drifts away from the ruler when a project bar receives focus.
- WCAG AA contrast for the "Hoje" badge and cancelled project bars in both themes.
- The project drawer no longer creates duplicate page landmarks.
- "Fit" transitions are no longer cancelled when a scrollbar appears after loading data.

[Unreleased]: https://github.com/caiquemiranda/horizon-planner/commits/develop
