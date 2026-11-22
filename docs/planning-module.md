# Planning module: WBS, Gantt and dependencies

The project workspace turns a portfolio project into a real schedule: a hierarchical
table of tasks (TreeGrid / WBS) side by side with a Gantt chart, precedence links drawn as
orthogonal connectors, and a scheduling engine that computes the dates.

This document records the conventions, the domain rules, the delivery plan and the
status of every acceptance criterion. It is updated by each pull request of the module.

## Architecture

The three core parts are integrated but independent:

| Part                  | Responsibility                                                 | Location                                         |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| **WBS tree**          | Hierarchy (`parentId` + `order`), WBS numbers, visible rows    | `src/features/schedule/lib/tree.ts`              |
| **Dependency graph**  | Precedence links, validation, cycle detection, readable format | `src/features/schedule/lib/dependencies.ts`      |
| **Scheduling engine** | Working-day calendar, link propagation, summary roll-up        | `src/features/schedule/lib/{calendar,engine}.ts` |
| Domain commands       | The only way to change a schedule; validate every rule         | `src/features/schedule/lib/commands.ts`          |
| Validation            | zod schemas for anything read from storage or imported         | `src/features/schedule/schemas.ts`               |

All of them are pure TypeScript: no React, no pixels, no expansion state. The UI (TreeGrid,
Gantt renderer, connector router) only reads their results and sends commands.

## Conventions

### Dates and durations

- Dates are **date-only** strings (`yyyy-MM-dd`). There are no times of day and no
  timezones; all math uses integer **day numbers** (days since 1970-01-01, see ADR-002),
  so daylight saving time can never move a task.
- Durations are **working days** of the project calendar. Elapsed (calendar) days are
  never used for durations.
- A task occupies the half-open range **`[start, finish)`**: `start` is its first working
  day and `finish` is the day after its last working day. The table shows the last working
  day (`finish - 1`) as "Término".
- A **milestone** is a leaf task with duration `0`: `finish === start`, drawn as a diamond
  on that day.

Example (spec 13.1, Monday to Friday): A starts on Monday 23/11/2026 and lasts 2 days, so
it occupies Monday and Tuesday and `finish` is Wednesday 25/11. B (3 days, A → B FS)
occupies Wednesday to Friday, `finish` = Saturday 28/11. C (B → C FS) starts on the next
working day, Monday 30/11. This is covered by tests.

### Calendar

- Each project has its own calendar: working weekdays (Monday to Friday by default) and a
  list of holidays. Nothing is hardcoded in the engine.
- A requested start on a non-working day moves to the next working day.

### Scheduling modes

- **Automatic** (default): the task starts on the latest of its requested start (a "start
  no earlier than" constraint) and every bound its predecessors impose. Moving a task
  earlier than its links allow keeps it at the link bound; the UI explains why.
- **Manual**: the task stays exactly where the user put it. Broken links are reported as
  issues on the task instead of moving it.

### Links (precedence)

| Type    | Rule (`lag` in working days, negative = lead) |
| ------- | --------------------------------------------- |
| FS / TI | successor start ≥ predecessor finish + lag    |
| SS / II | successor start ≥ predecessor start + lag     |
| FF / TT | successor finish ≥ predecessor finish + lag   |
| SF / IT | successor finish ≥ predecessor start + lag    |

- Tasks may have several predecessors and successors; the most restrictive bound wins.
- Links are propagated in topological order; ties follow the WBS order, so results never
  depend on the order records are stored in.
- **Policies:**
  - links connect leaf tasks and milestones only; summary dates come from their children,
    and a linked task cannot receive subtasks until its links are removed;
  - one link per pair of tasks, whatever its type or direction;
  - self links and cycles (A → B → C → A) are rejected with a message, for every type;
  - the "Predecessoras" cell uses WBS numbers (`2.1TI+2d`, `3SS-1d`), but links are stored
    with immutable task ids. Portuguese (TI, II, TT, IT) and English (FS, SS, FF, SF)
    types are accepted.

### Hierarchy

- Every task has an immutable id. WBS numbers (`1`, `1.2`, `1.2.3`) are derived from the
  hierarchy and sibling order, and change when tasks are reorganized.
- Tasks with children are **summary tasks**: start = earliest descendant start, finish =
  latest descendant finish, duration = working days in between (parallel children are
  never added up), progress = leaf progress weighted by working-day duration (plain
  average when only milestones are below).
- Indent makes a task the last child of the sibling above; outdent places it right after
  its former parent. Moving a task into itself or its descendants is rejected.
- **Delete** removes the task, its descendants and every link that touches them, after a
  confirmation that states those numbers (no orphans).
- **Duplicate** copies the task and its subtree right below it, **without links**, so a
  copy never gets unexpected links to old tasks.

## Delivery plan

| PR  | Block                       | Content                                                                                     | Status  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| 1   | `feat/schedule-domain`      | Types, calendar, WBS tree, dependency graph, engine, commands, schemas, demo fixture, tests | This PR |
| 2   | `feat/schedule-persistence` | Schedule repository (per project), workspace store, save status, backup and sample data     | Planned |
| 3   | `feat/workspace-treegrid`   | Project route, workspace page, split view, editable TreeGrid with WBS, expand/collapse      | Planned |
| 4   | `feat/gantt-chart`          | Gantt pane: time scale, bars, summaries, milestones, today line, synced rows and selection  | Planned |
| 5   | `feat/gantt-dependencies`   | Orthogonal connector router, SVG layer, link editing (cell, dialog, drag from bar)          | Planned |
| 6   | `feat/gantt-editing`        | Bar drag and resize with preview and snap, context menu, reorder, column and split sizing   | Planned |
| 7   | `feat/workspace-robustness` | Calendar settings, conflicts across tabs, permissions gate, narrow screens, error recovery  | Planned |
| 8   | `test/planning-e2e`         | Row virtualization, performance measurements, end-to-end tests, screenshots, final report   | Planned |

## Acceptance criteria

Status: **Implemented/Tested**, **Implemented/Not tested**, **Partial**, **Not
implemented** or **Blocked**, with evidence.

| Criterion                                                              | Status             | Evidence                                   |
| ---------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| Portfolio opens a project's own screen                                 | Not implemented    | PR 3                                       |
| TreeGrid and Gantt side by side with an adjustable split               | Not implemented    | PR 3–4                                     |
| Headers and rows stay aligned while scrolling                          | Not implemented    | PR 4                                       |
| Phases, tasks and subtasks on several levels                           | Partial            | Domain: `tree.test.ts`, `commands.test.ts` |
| WBS computed correctly and updated after reorganizing                  | Partial            | Domain: `tree.test.ts`                     |
| Expand/collapse in both panes without data loss                        | Partial            | Visible rows: `tree.test.ts`               |
| Editable name, duration, start, finish, predecessors, progress columns | Partial            | Validation: `commands.test.ts`             |
| Bars match dates, duration, progress and scale                         | Not implemented    | PR 4                                       |
| Summary tasks with their own look and correct roll-up dates            | Partial            | Roll-up: `engine.test.ts`                  |
| Milestones as diamonds with coherent semantics                         | Partial            | Semantics: `engine.test.ts`                |
| Real dependencies can be created                                       | Partial            | Domain: `commands.test.ts`                 |
| FS, SS, FF and SF with correct anchors                                 | Partial            | Dates: `engine.test.ts`; anchors in PR 5   |
| Orthogonal connectors with arrowheads                                  | Not implemented    | PR 5                                       |
| No ghost connectors after scroll, zoom, resize, filters or collapse    | Not implemented    | PR 5                                       |
| Editing a task reschedules its successors                              | Partial            | Engine: `engine.test.ts`                   |
| Engine respects working days, weekends and date conventions            | Implemented/Tested | `calendar.test.ts`, `engine.test.ts`       |
| Dependency cycles rejected without corrupting state                    | Implemented/Tested | `dependencies.test.ts`, `commands.test.ts` |
| Bar drag/resize updates dates and the TreeGrid                         | Not implemented    | PR 6                                       |
| Table edits update bars, connectors and summaries                      | Not implemented    | PR 3–5                                     |
| No data from another project when switching quickly                    | Not implemented    | PR 2–3                                     |
| Data and links persist after refresh                                   | Not implemented    | PR 2                                       |
| Permissions and data integrity respected                               | Partial            | Integrity: schemas and commands            |
| Clear loading, empty, error and saving states                          | Not implemented    | PR 2–3                                     |
| Unit, integration and end-to-end tests run and reported                | Partial            | Unit tests only                            |
| Remaining limitations documented                                       | Partial            | This document                              |

## Known limitations and future work

- **No users or permissions in the product yet.** The app is single-user and stores data
  in the browser. The workspace will expose an explicit edit capability so read-only
  access can be plugged in when authentication exists (PR 7).
- **No server.** Validation runs in the domain layer, which is the authoritative layer of
  this client-only app; a future API must repeat it on the server.
- Out of scope for this module: critical path (CPM) and slack, baselines, resource
  leveling, per-resource calendars, costs and earned value, MPP import/export and
  real-time collaboration.
