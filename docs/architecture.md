# Architecture Decision Records

Lightweight ADRs that capture the key technical decisions behind Horizon. Each record states the context, the decision and its consequences. A superseded record is kept and marked as such, never deleted.

| ADR                                                               | Title                                             | Status   |
| ----------------------------------------------------------------- | ------------------------------------------------- | -------- |
| [001](#adr-001-dom-rendering-with-a-custom-scale-engine)          | DOM rendering with a custom scale engine          | Accepted |
| [002](#adr-002-day-numbers-as-the-unit-of-time-math)              | Day numbers as the unit of time math              | Accepted |
| [003](#adr-003-repository-pattern-for-persistence)                | Repository pattern for persistence                | Accepted |
| [004](#adr-004-split-zustand-stores-with-selective-subscriptions) | Split Zustand stores with selective subscriptions | Accepted |
| [005](#adr-005-zod-for-runtime-validation)                        | zod for runtime validation                        | Accepted |
| [006](#adr-006-feature-based-folder-structure)                    | Feature-based folder structure                    | Accepted |
| [007](#adr-007-in-house-scheduling-domain)                        | In-house scheduling domain                        | Accepted |

---

## ADR-001: DOM rendering with a custom scale engine

**Context.** The core of the product is a timeline that zooms continuously from decades down to days, anchored on the cursor, at 60 fps. The expected data volume is tens to a few hundred projects per user.

**Options considered.**

| Option                                        | Zoom performance           | Accessibility and rich UI                | Verdict    |
| --------------------------------------------- | -------------------------- | ---------------------------------------- | ---------- |
| Off-the-shelf Gantt (Frappe, DHTMLX, Bryntum) | Stepped zoom levels only   | Hard to style; some are commercial       | Rejected   |
| Canvas (Konva, PixiJS)                        | Excellent (10k+ items)     | Poor: tooltips and focus must be rebuilt | Rejected   |
| SVG                                           | Good                       | Medium                                   | Not needed |
| **DOM + custom scale engine**                 | Very good up to ~1–2k bars | Full: Radix tooltips, focus, keyboard    | **Chosen** |

**Decision.** Render bars, ruler and grid as DOM elements positioned with `transform: translateX()` and `width`. All positioning comes from a pure scale engine (`features/timeline/lib`). The viewport animates through a `requestAnimationFrame` interpolation loop instead of Framer Motion.

**Consequences.**

- Accessible, themeable bars that reuse shadcn/ui primitives.
- The scale engine is framework-agnostic and fully unit-testable.
- Very large datasets will need row virtualization (`@tanstack/react-virtual`), which is on the roadmap.

## ADR-002: Day numbers as the unit of time math

**Context.** Mixing `Date` objects, timezones and daylight saving time in pixel calculations causes off-by-one-hour and off-by-one-day bugs.

**Decision.** Persist dates as calendar strings (`yyyy-MM-dd`, branded `ISODate` type). For every calculation, convert them to a `DayNumber`: fractional days since `1970-01-01` UTC. `date-fns` is used only for calendar boundaries (start of month, quarter…) and label formatting.

**Consequences.** Scale math is plain arithmetic (`x = (day - startDay) * pxPerDay`). Conversions sit at the edges of the system and are covered by tests.

## ADR-003: Repository pattern for persistence

**Context.** The MVP stores data in `localStorage`, but a backend API is planned.

**Decision.** Define an asynchronous `ProjectRepository` interface (`list`, `get`, `create`, `update`, `remove`, `replaceAll`). Ship `LocalStorageRepository` for the app and `InMemoryRepository` for tests. Stored data carries a `schemaVersion` with explicit migrations.

**Consequences.** Moving to an API means adding one class; stores and UI do not change. The async contract adds a little ceremony for `localStorage`, which is acceptable. Writes are optimistic in the store and persisted with a short debounce.

## ADR-004: Split Zustand stores with selective subscriptions

**Context.** During a zoom gesture the viewport changes on every animation frame. A single global store would re-render the whole tree.

**Decision.** Use separate stores: `projects`, `viewport`, `filters` and `ui`. Components subscribe through narrow selectors, and high-frequency consumers read the viewport transiently where possible.

**Consequences.** Zoom and pan only re-render what depends on the viewport. Each store stays small and easy to test.

## ADR-005: zod for runtime validation

**Context.** Imported JSON files and `localStorage` contents are untrusted input. TypeScript types do not exist at runtime.

**Decision.** Describe `Project`, `Milestone` and `HorizonSnapshot` with zod schemas. Validate on import and on load, and reuse the schemas for form validation.

**Consequences.** Invalid or corrupted data fails with clear error messages instead of breaking the timeline. The extra dependency adds a modest bundle cost, which is worth the safety.

## ADR-006: Feature-based folder structure

**Context.** Grouping by technical type (`components/`, `hooks/`, `stores/`) scatters a single feature across the tree as the app grows.

**Decision.** Group code by feature under `src/features/<feature>/` (`components/`, `hooks/`, `lib/`, `store/`). Shared primitives live in `src/components/ui`, cross-cutting utilities in `src/lib`, and infrastructure in `src/services`.

**Consequences.** Features are cohesive and easy to locate, review and delete. Cross-feature imports must go through the `@/` alias, which keeps dependencies visible in code review.

## ADR-007: In-house scheduling domain

**Context.** The project workspace needs a WBS, precedence links (FS, SS, FF, SF with lags), working-day calendars and summary roll-up, with every rule tested. Gantt libraries bundle these with their own rendering and data model; the mature ones (Bryntum, DHTMLX PRO, Syncfusion) are commercial, and the open-source ones (Frappe Gantt, gantt-task-react) lack link types, calendars or a separable engine.

**Decision.** Implement the scheduling domain as pure TypeScript in `src/features/schedule/lib`: a WBS tree module, a dependency graph module and a scheduling engine, plus domain commands that are the only way to change a schedule. Rendering stays in DOM/SVG on top of the existing scale engine (ADR-001). Conventions and policies are documented in [`docs/planning-module.md`](./planning-module.md).

**Consequences.** No license cost or lock-in, and the engine is testable without a browser. Advanced features (critical path, baselines, resource leveling) must be built on top of it when needed.
