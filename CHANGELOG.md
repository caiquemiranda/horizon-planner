# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Row virtualization in the project workspace (1 000 tasks: DOM 45 000 → 1 900 elements, edits reflected in about 0.15 s), browser end-to-end tests in CI, performance measurements (`npm run perf`, `docs/performance.md`) and workspace screenshots.
- Project calendar settings (working weekdays and holidays), read-only schedules for completed or cancelled projects enforced by the workspace store, and a warning before leaving with unsaved changes.
- Direct editing: drag Gantt bars to move tasks and their edges to change dates (with a preview, scale-aware snapping and auto-scroll), drag table rows to reorder or nest tasks, and resize or hide table columns per project.
- Dependency connectors on the Gantt: orthogonal staircase arrows for finish-to-start, start-to-start, finish-to-finish and start-to-finish links, hidden while an end is collapsed, plus a links dialog and drag-from-bar to create, edit and delete links. Refused actions show a warning icon.
- Gantt chart beside the task table: shared rows and vertical scroll, a resizable split remembered per project, bars with progress, summary brackets, milestone diamonds, today line, calendar shading, its own zoom and pan, and a chart/table switch on narrow screens.
- Project workspace at `#/projetos/<id>`, opened from the portfolio: an editable task table (TreeGrid) with WBS numbers, phases and subtasks, inline editing with validation (Enter, F2 or double click), predecessors in readable form (`2.1TI+2d`), expand/collapse, filter, row actions, keyboard navigation and a save status.
- Project schedules are saved per project with conflict detection across tabs, included in backups, deleted with their project and shown in the sample data ("Implantação de Sistema Industrial").
- Scheduling domain for project plans: WBS hierarchy, precedence links (FS, SS, FF, SF with lag and lead), working-day calendar with holidays and an engine that propagates dates and rolls up summary tasks.
- Live demo on GitHub Pages, deployed automatically on every push to `develop`.
- README screenshots (dark and light themes, drawer and phone layout) and an `npm run screenshots` script that recaptures them from the sample data.
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

- Milestone diamonds no longer cover the bar title and progress percentage.
- The timeline canvas no longer drifts away from the ruler when a project bar receives focus.
- WCAG AA contrast for the "Hoje" badge and cancelled project bars in both themes.
- The project drawer no longer creates duplicate page landmarks.
- "Fit" transitions are no longer cancelled when a scrollbar appears after loading data.

[Unreleased]: https://github.com/caiquemiranda/horizon-planner/commits/develop
