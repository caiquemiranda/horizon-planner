# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/caiquemiranda/horizon-planner/commits/develop
