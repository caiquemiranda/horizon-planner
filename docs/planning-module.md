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

### Persistence

- Each project's schedule is stored under its own key
  (`horizon-planner:schedule:<projectId>`), so opening a project reads only its data.
  Stored data is validated with zod; unreadable data is copied to a `:backup:` key
  instead of being lost, and data from a newer app version is refused, not discarded.
- **Concurrency:** every save carries the revision it started from. If another tab saved
  in between, the save is rejected as a conflict and the user chooses: reload the stored
  version or overwrite it. A tab with no pending edits follows the other tab's changes.
- **Saving:** edits show at once and are saved in the background, one write at a time,
  so a newer edit is never replaced by an older save. Failures keep the edit and offer a
  retry; the status is "Salvando", "Salvo", "Erro ao salvar" or "Conflito".
- **Switching projects:** loads carry a token; a slow answer for a project the user
  already left is ignored, and nothing from the previous project stays on screen.
- **Portfolio:** once a project has tasks, it acts as the root summary of its schedule:
  its dates span the tasks (widened to keep portfolio milestones valid) and its progress
  is the schedule's weighted progress.
- **Deleting a project** deletes its schedule. **Backups** include the schedules of the
  exported projects; backups made before the planning module still import.

## Workspace

The project screen lives at `#/projetos/<projectId>` (hash routes work on GitHub Pages)
and opens from the portfolio drawer ("Abrir cronograma"). It loads only that project's
schedule; switching projects remounts it from a clean state.

- **Columns:** EAP, Nome, Duração, Início, Término, Predecessoras, Responsável, %, Status.
  EAP and Status are derived. Duration, dates, predecessors and progress of summary tasks
  are rolled up and read-only. Editing "Término" keeps the start and changes the duration.
- **Status** is derived, so it never contradicts progress: Concluída (100%), Atrasada (last
  working day passed), Em andamento (some progress) or Não iniciada.
- **Filter:** matches name, owner or EAP number, without case or accents; ancestors of
  matches stay visible (greyed) so the hierarchy remains readable.
- **Expansion** is presentation only and is remembered per project in the browser.

| Keys                      | Action                                             |
| ------------------------- | -------------------------------------------------- |
| Arrows, Home, End         | Move between cells (Ctrl+Home/End: first/last row) |
| → / ← on the name         | Expand / collapse (← again goes to the parent)     |
| Enter, F2 or double click | Edit the cell                                      |
| Enter / Tab / Esc         | Confirm and go down / next cell / cancel           |
| Alt+Shift+→ / ←           | Indent (becomes a subtask) / outdent               |
| Alt+Shift+↑ / ↓           | Move up / down among siblings                      |
| Insert                    | New task below                                     |
| Delete                    | Delete (with confirmation)                         |
| Shift+F10 / menu key      | Row actions                                        |

## Gantt chart

- **One row model, one vertical scroll.** The chart draws the same visible rows as the
  table, with the same row height. The table's scroll container is the only vertical
  scroll; the chart follows its `scrollTop` in the same frame, and a wheel or drag over
  the chart scrolls the table. Rows and bars cannot drift apart (checked in Chrome with
  0 px offset after scrolling, zooming, resizing and collapsing).
- **Time scale.** Bars use the same `dayToX` / `xToDay` functions as the portfolio
  timeline, with its own zoom and pan (a separate viewport per chart). A task is drawn over
  `[start, finish)`, so it covers its working days and any weekend in between. Non-working
  days of the project calendar (weekends and holidays) are shaded at day zoom.
- **Shapes encode the kind:** task bar with a progress fill, thin summary bar with bracket
  ends, diamond milestone. Late tasks have a red outline and tasks with issues a dashed
  one; the tooltip explains both.
- **Zoom and pan never change tasks.** On opening, the chart fits the whole schedule.
  Chart shortcuts: `T` today, `F` fit, `+`/`-` zoom, `1`–`5` presets, arrows pan (outside
  the table). Typing in the table never starts an edit, so these keys cannot change data.
- **Split view.** A draggable (or keyboard) divider sets the table width, remembered per
  project; resizing changes widths only. Below 768 px a switch shows the chart with a slim
  task column or the full table.
- **Accessibility.** The chart is a visual view of the table: bars are hidden from
  assistive technology, and the table offers every piece of information and every action.
- Only bars near the visible time range are rendered.

## Dependency connectors

- **Routing** (`src/features/gantt/lib/connectors.ts`) is pure geometry: segments are only
  horizontal or vertical with 90° corners, the arrowhead always points from predecessor to
  successor and enters the correct edge (FS: finish → start; SS: start → start; FF: finish
  → finish; SF: start → finish). When the successor begins before the predecessor ends
  (leads, overlaps), the connector detours along the row boundary instead of entering
  backwards. The router is deterministic: the same geometry always gives the same path.
- **Reactive:** connectors are computed from the same geometry as the bars on every
  change (dates, zoom, pan, rows, split width) and live in the scrolled content, so they
  never point to stale positions.
- **Hidden ends** (policy 1 of the spec): when a collapsed phase or the filter hides
  either task, the connector is not drawn; the link stays stored and comes back on expand.
- **States** are not only colors: the links of the selected task are thicker, a hovered or
  opened link is thicker and highlighted, and a link that a manual task does not respect
  is dashed.
- **Editing links:**
  - "Predecessoras" cell: `2.1`, `2.1TI+2d`, `3II-1d` (English types also accepted);
  - links dialog (toolbar "Vínculos da tarefa", row menu or a click on a connector):
    change type and lag, delete, add predecessors and successors;
  - drag from the round handle at a bar's start or finish to any point of another task's
    row: finish → left half = FS, finish → right half = FF, start → left half = SS,
    start → right half = SF.
    Every path goes through the domain commands: self links, duplicates, links to summary
    tasks and cycles are refused with a message, and nothing changes.

## Delivery plan

| PR  | Block                       | Content                                                                                     | Status  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| 1   | `feat/schedule-domain`      | Types, calendar, WBS tree, dependency graph, engine, commands, schemas, demo fixture, tests | PR 18   |
| 2   | `feat/schedule-persistence` | Schedule repository (per project), workspace store, save status, backup and sample data     | PR 19   |
| 3   | `feat/workspace-treegrid`   | Project route, workspace page, editable TreeGrid with WBS, expand/collapse, row actions     | PR 20   |
| 4   | `feat/gantt-chart`          | Gantt pane: time scale, bars, summaries, milestones, today line, synced rows and selection  | PR 21   |
| 5   | `feat/gantt-dependencies`   | Orthogonal connector router, SVG layer, link editing (cell, dialog, drag from bar)          | PR 22   |
| 6   | `feat/gantt-editing`        | Bar drag and resize with preview and snap, context menu, reorder, column and split sizing   | Planned |
| 7   | `feat/workspace-robustness` | Calendar settings, conflicts across tabs, permissions gate, narrow screens, error recovery  | Planned |
| 8   | `test/planning-e2e`         | Row virtualization, performance measurements, end-to-end tests, screenshots, final report   | Planned |

## Acceptance criteria

Status: **Implemented/Tested**, **Implemented/Not tested**, **Partial**, **Not
implemented** or **Blocked**, with evidence.

| Criterion                                                              | Status             | Evidence                                                                                            |
| ---------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| Portfolio opens a project's own screen                                 | Implemented/Tested | `workspaceFlows.test.tsx`                                                                           |
| TreeGrid and Gantt side by side with an adjustable split               | Implemented/Tested | `ganttFlows.test.tsx`; checked in Chrome                                                            |
| Headers and rows stay aligned while scrolling                          | Implemented/Tested | Chrome: 0 px offset after scroll, wheel, zoom, resize, collapse                                     |
| Phases, tasks and subtasks on several levels                           | Implemented/Tested | `workspaceFlows.test.tsx`, `tree.test.ts`                                                           |
| WBS computed correctly and updated after reorganizing                  | Implemented/Tested | `workspaceFlows.test.tsx`, `tree.test.ts`                                                           |
| Expand/collapse in both panes without data loss                        | Implemented/Tested | `workspaceFlows.test.tsx`, `ganttFlows.test.tsx`                                                    |
| Editable name, duration, start, finish, predecessors, progress columns | Implemented/Tested | `workspaceFlows.test.tsx`, `cells.test.ts`                                                          |
| Bars match dates, duration, progress and scale                         | Implemented/Tested | `geometry.test.ts`, `ganttFlows.test.tsx`                                                           |
| Summary tasks with their own look and correct roll-up dates            | Implemented/Tested | `engine.test.ts`, `ganttFlows.test.tsx`                                                             |
| Milestones as diamonds with coherent semantics                         | Implemented/Tested | `engine.test.ts`, `ganttFlows.test.tsx`                                                             |
| Real dependencies can be created                                       | Implemented/Tested | Cell, dialog and drag: `linkFlows.test.tsx`, `workspaceFlows.test.tsx`                              |
| FS, SS, FF and SF with correct anchors                                 | Implemented/Tested | `connectors.test.ts`, `engine.test.ts`; anchors checked in Chrome                                   |
| Orthogonal connectors with arrowheads                                  | Implemented/Tested | `connectors.test.ts` (all types and positions); Chrome: 0 diagonals                                 |
| No ghost connectors after scroll, zoom, resize, filters or collapse    | Implemented/Tested | `connectorLayout.test.ts`, `linkFlows.test.tsx`; Chrome: ends attached after scroll, zoom, collapse |
| Editing a task reschedules its successors                              | Implemented/Tested | `workspaceFlows.test.tsx`, `engine.test.ts`                                                         |
| Engine respects working days, weekends and date conventions            | Implemented/Tested | `calendar.test.ts`, `engine.test.ts`                                                                |
| Dependency cycles rejected without corrupting state                    | Implemented/Tested | `dependencies.test.ts`, `commands.test.ts`, `linkFlows.test.tsx`                                    |
| Bar drag/resize updates dates and the TreeGrid                         | Not implemented    | PR 6                                                                                                |
| Table edits update bars, connectors and summaries                      | Implemented/Tested | `ganttFlows.test.tsx`, `connectorLayout.test.ts`                                                    |
| No data from another project when switching quickly                    | Implemented/Tested | `workspaceFlows.test.tsx`, `scheduleStore.test.ts`                                                  |
| Data and links persist after refresh                                   | Implemented/Tested | `ScheduleRepository.test.ts`; reload checked in Chrome                                              |
| Permissions and data integrity respected                               | Partial            | Integrity: schemas, commands, revisions                                                             |
| Clear loading, empty, error and saving states                          | Implemented/Tested | `workspaceFlows.test.tsx`                                                                           |
| Unit, integration and end-to-end tests run and reported                | Partial            | Unit and integration (jsdom); browser end-to-end in PR 8                                            |
| Remaining limitations documented                                       | Partial            | This document                                                                                       |

## Known limitations and future work

- **No users or permissions in the product yet.** The app is single-user and stores data
  in the browser. The workspace will expose an explicit edit capability so read-only
  access can be plugged in when authentication exists (PR 7).
- **No server.** Validation runs in the domain layer, which is the authoritative layer of
  this client-only app; a future API must repeat it on the server.
- Out of scope for this module: critical path (CPM) and slack, baselines, resource
  leveling, per-resource calendars, costs and earned value, MPP import/export and
  real-time collaboration.
