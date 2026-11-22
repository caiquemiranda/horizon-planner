<div align="center">

<img src="public/favicon.svg" alt="Horizon logo" width="72" height="72" />

# Horizon

**Plan your short, medium and long-term projects on a single, fluid timeline.**

A modern, keyboard-friendly Gantt-style planner that combines the planning power of MS Project with the minimal aesthetic of Linear, Notion and Raycast.

[![CI](https://github.com/caiquemiranda/horizon-planner/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/caiquemiranda/horizon-planner/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Version](https://img.shields.io/github/package-json/v/caiquemiranda/horizon-planner?label=version&color=f59e0b)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](./LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

[Features](#-features) · [Screenshots](#-screenshots) · [Getting started](#-getting-started) · [Architecture](#%EF%B8%8F-architecture) · [Roadmap](#%EF%B8%8F-roadmap) · [Contributing](#-contributing)

</div>

---

## ✨ Features

### MVP (`v0.1.0`)

| Area                         | What you get                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive timeline**     | Projects rendered as horizontal bars placed chronologically, grouped in collapsible **Short**, **Medium** and **Long-term** lanes.                                               |
| **Fluid macro ↔ micro zoom** | `Ctrl + Scroll` (or trackpad pinch) smoothly transitions from **Years / Semesters / Quarters** down to **Months / Weeks / Days**, always anchored on the point under the cursor. |
| **Navigation**               | Drag to pan, horizontal scroll, zoom presets and a **Go to today** action with a vertical "today" indicator.                                                                     |
| **Side drawer**              | Click any bar to open an animated drawer on the right. Create, edit and delete projects without losing the timeline context; edits show on the timeline in real time.            |
| **Rich project model**       | Title, description, horizon, start/end dates, progress (0–100%), status, color, category and milestones.                                                                         |
| **Filters**                  | Filter by horizon, category and status.                                                                                                                                          |
| **Persistence**              | Automatic `localStorage` persistence behind a decoupled repository layer, ready to be swapped for a REST/GraphQL API.                                                            |
| **Portability**              | Schema-validated JSON export / import and one-click **sample data** for an instant demo.                                                                                         |
| **Theming**                  | Dark mode by default, light mode supported, Geist typography and accessible contrast.                                                                                            |

### ⌨️ Keyboard shortcuts

| Shortcut                  | Action                               |
| ------------------------- | ------------------------------------ |
| `Ctrl` + `Scroll` / pinch | Zoom anchored on cursor              |
| `Shift` + `Scroll` / drag | Pan through time                     |
| `+` / `-`                 | Zoom in / out                        |
| `←` / `→`                 | Pan (with `Shift`: a full page)      |
| `1` … `5`                 | Zoom presets: years, quarters … days |
| `T`                       | Go to today                          |
| `F`                       | Fit all projects                     |
| `?`                       | Show keyboard shortcuts              |
| `N`                       | New project                          |
| `Esc`                     | Close drawer                         |

## 📸 Screenshots

> Screenshots and GIFs live in [`docs/assets/`](./docs/assets). The [capture guide](./docs/assets/README.md) covers sizes and naming conventions.

|                                             Macro view (years / quarters)                                             |                                        Micro view (weeks / days)                                         |
| :-------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------: |
| <img src="docs/assets/timeline-macro-dark.png" alt="Timeline in macro view showing years and quarters" width="420" /> | <img src="docs/assets/timeline-micro-dark.png" alt="Timeline zoomed in to weeks and days" width="420" /> |

|                                              Side drawer                                               |                                         Smooth zoom (GIF)                                          |
| :----------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------: |
| <img src="docs/assets/drawer-edit-dark.png" alt="Project drawer open over the timeline" width="420" /> | <img src="docs/assets/demo-zoom.gif" alt="Animated demo of the macro to micro zoom" width="420" /> |

## 🚀 Getting started

### Prerequisites

- **Node.js** `>= 20.19` (the version in [`.nvmrc`](./.nvmrc) is recommended: run `nvm use`)
- **npm** `>= 10`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/caiquemiranda/horizon-planner.git
cd horizon-planner

# 2. Install dependencies (this also installs the Git hooks)
npm install

# 3. Start the development server
npm run dev
```

Open <http://localhost:5173> and click **Carregar dados de exemplo** (Load sample data) to explore the timeline right away.

### Available scripts

| Script                            | Description                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Starts the Vite dev server with HMR.                        |
| `npm run build`                   | Type-checks and builds the production bundle into `dist/`.  |
| `npm run preview`                 | Serves the production build locally.                        |
| `npm run typecheck`               | Runs the TypeScript compiler in strict mode (no emit).      |
| `npm run lint` / `lint:fix`       | Runs ESLint with type-aware rules / auto-fixes issues.      |
| `npm run format` / `format:check` | Formats / checks formatting with Prettier.                  |
| `npm test`                        | Runs the test suite once with Vitest.                       |
| `npm run test:watch`              | Runs Vitest in watch mode.                                  |
| `npm run test:coverage`           | Runs the tests and writes a coverage report to `coverage/`. |

## 🏗️ Architecture

### Tech stack

| Layer      | Choice                                           | Why                                                                                          |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Core       | **React 19 + TypeScript (strict) + Vite 7**      | Fast DX, strict typing with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.     |
| UI         | **Tailwind CSS v4 + shadcn/ui (Radix) + Lucide** | Accessible primitives, design tokens as CSS variables, full ownership of the components.     |
| Motion     | **Framer Motion**                                | Drawer and micro-interactions only. The timeline runs its own `requestAnimationFrame` loop.  |
| State      | **Zustand**                                      | Small, selector-based stores that avoid re-rendering the whole timeline on every zoom frame. |
| Dates      | **date-fns**                                     | Precise, tree-shakeable calendar math and `pt-BR` formatting.                                |
| Validation | **zod**                                          | Runtime validation of imported JSON and persisted data.                                      |
| Tests      | **Vitest + React Testing Library**               | The pure scale and layout logic is fully unit-tested.                                        |

### How the timeline works

The timeline is rendered with **plain DOM and GPU-accelerated transforms**, driven by a pure scale engine:

- **Continuous zoom.** The zoom level is a single number, `pxPerDay` (about `0.02` for decades up to about `160` for hours). The ruler picks its granularity (Year → Semester → Quarter → Month → Week → Day) from that value.
- **Cursor-anchored zoom.** `zoomAt(viewport, cursorX, factor)` recomputes the left edge so the date under the cursor stays on the same pixel.
- **Smooth interpolation.** Wheel events set a target viewport, and a `requestAnimationFrame` loop eases towards it.
- **Day numbers.** Dates are converted to fractional _days since epoch_ for all pixel math, which avoids timezone and DST bugs. `date-fns` handles calendar boundaries and labels.

> Canvas renderers (Konva, PixiJS) and off-the-shelf Gantt libraries were evaluated and rejected for the MVP. See [ADR-001](./docs/architecture.md#adr-001-dom-rendering-with-a-custom-scale-engine).

### Data flow

```mermaid
flowchart LR
    UI["React components"] -- actions --> Stores["Zustand stores<br/>(projects · viewport · filters · ui)"]
    Stores -- selectors --> UI
    Stores --> Repo{{"ProjectRepository<br/>(interface)"}}
    Repo --> LS["LocalStorageRepository<br/>(MVP)"]
    Repo -.-> API["ApiRepository<br/>(future)"]
    Stores --> Scale["timeline/lib/scale.ts<br/>(pure functions)"]
    Scale -- "px positions" --> UI
```

### Folder structure

```text
src/
├── app/                    # Entry point, root layout and providers
├── components/
│   ├── ui/                 # shadcn/ui primitives (owned code, not a dependency)
│   └── layout/             # App header, theme toggle
├── features/               # Feature-based modules
│   ├── timeline/           # Canvas, ruler, bars, zoom and pan hooks
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/            # ⚙️ Pure scale, ticks and layout engine (fully tested)
│   │   └── store/
│   ├── projects/           # Drawer, form, milestones, projects store, zod schemas
│   ├── filters/            # Filter bar and filtering logic
│   └── data-io/            # Export, import, sample data
├── services/
│   └── persistence/        # Repository contract + localStorage / in-memory implementations
├── lib/                    # Cross-cutting utilities
├── types/                  # Shared domain types (Project, Viewport…)
├── styles/                 # Tailwind entry and design tokens
└── test/                   # Test setup and browser API mocks
```

Key architectural decisions are recorded as lightweight ADRs in [`docs/architecture.md`](./docs/architecture.md).
Visual decisions (colors, typography, spacing, motion and component rules) are documented in the [design system](./docs/design.md).

### Engineering standards

- **GitHub Flow with a `develop` branch.** `main` is protected and only receives releases; features reach `develop` through pull requests.
- **Conventional Commits**, enforced locally by **Husky + Commitlint** and in CI on every pull request.
- **lint-staged** runs ESLint and Prettier on staged files before each commit.
- **CI** (GitHub Actions) runs the format check, lint, type-check, tests with coverage and the build on every pull request.
- **Semantic Versioning** with a human-readable [`CHANGELOG.md`](./CHANGELOG.md).

## 🗺️ Roadmap

- [x] Repository setup, tooling and CI
- [ ] **v0.1.0 (MVP):** interactive timeline, macro/micro zoom, drawer CRUD, filters, localStorage, JSON import/export, sample data
- [ ] Drag and resize bars directly on the timeline to change dates
- [ ] Dependencies between projects (finish-to-start arrows)
- [ ] Milestone diamonds with completion tracking on the timeline
- [ ] Undo / redo (command history)
- [ ] Row virtualization for very large portfolios
- [ ] Command palette (`Ctrl + K`)
- [ ] PWA with offline support
- [ ] Backend sync (REST API + authentication) through a new `ProjectRepository` implementation
- [ ] Automated releases with `release-please`
- [ ] i18n (`pt-BR` / `en`)

## 🤝 Contributing

Contributions are welcome. Please read the [contributing guide](./CONTRIBUTING.md) for the branch strategy, commit conventions and pull request process.

1. Fork the repository and create a branch from `develop`: `git checkout -b feat/my-feature`
2. Commit using Conventional Commits: `git commit -m "feat(timeline): add zoom presets"`
3. Push and open a pull request against `develop`

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

<div align="center">
<sub>Built by <a href="https://github.com/caiquemiranda">Caique Miranda</a>.</sub>
</div>
