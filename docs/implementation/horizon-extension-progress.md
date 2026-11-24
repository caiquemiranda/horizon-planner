# Project lifecycle, visibility, progress and forecast: progress

Real delivery state of the extension planned in
[`horizon-extension-audit.md`](./horizon-extension-audit.md) (orders 0–9) and
[`horizon-addendum-03-audit.md`](./horizon-addendum-03-audit.md) (orders 10–17). Updated with every pull
request. An item is **Delivered** only when it is integrated, persists after a reload and
its acceptance tests pass in CI.

| Order | Branch                          | Requirement                | State     | Pull request | Tests                                                                                                              |
| ----- | ------------------------------- | -------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0     | `chore/extension-audit`         | Audit, plan, REQ-06        | Delivered | #26          | Docs only; dev server watch ignores checked by hand (see below)                                                    |
| 1     | `feat/project-lifecycle`        | REQ-01                     | Delivered | #27          | `lifecycle.test.ts`, `migrations.test.ts`, `lifecycleFlows.test.tsx`; checked in Chrome                            |
| 2     | `feat/project-visibility-trash` | REQ-07 (data)              | Delivered | #28          | `visibility.test.ts`, `projectsStore.test.ts`, `migrations.test.ts`, `visibilityFlows.test.tsx`; checked in Chrome |
| 3     | `feat/navigation-sidebar`       | REQ-02, REQ-07 (UI)        | Delivered | #29          | `sections.test.ts`, `router.test.ts`, `navigationFlows.test.tsx`; checked in Chrome (desktop, collapsed, phone)    |
| 4     | `feat/expanded-project-dialog`  | REQ-04                     | Delivered | #30          | `escapeGuard.test.ts`, `expandedDialogFlows.test.tsx` (incl. axe); checked in Chrome (desktop, phone)              |
| 5     | `feat/task-based-progress`      | REQ-03, REQ-08             | Delivered | #31          | `progress.test.ts`, `engine.test.ts`, `GanttBar.test.tsx`, `progressFlows.test.tsx`; before/after check in Chrome  |
| 6     | `feat/daily-checkins`           | REQ-09 (check-ins)         | Delivered | #32          | `checkIns.test.ts`, `ScheduleRepository.test.ts`, `checkInFlows.test.tsx`; checked in Chrome                       |
| 7     | `feat/schedule-forecast`        | REQ-09 (forecast)          | Delivered | #33          | `forecast.test.ts` (spec scenarios), `forecastFlows.test.tsx`; checked in Chrome                                   |
| 8     | `feat/portfolio-statistics`     | REQ-05                     | Delivered | #34          | `statistics.test.ts`, `dashboardFlows.test.tsx` (incl. axe); checked in Chrome                                     |
| 9     | `test/project-experience-e2e`   | Scenarios A–C              | Delivered | #35          | `e2e/extension.spec.ts` (scenarios A–C), all 11 Playwright tests                                                   |
| 10    | `feat/project-explorer-sidebar` | REQ-NAV-01                 | Delivered | #36          | `sections.test.ts`, `navigationFlows.test.tsx`; checked in Chrome                                                  |
| 10a   | `feat/explorer-horizons`        | REQ-NAV-01 (owner request) | In review | —            | `sections.test.ts`, `navigationFlows.test.tsx`; checked in Chrome                                                  |
| 11    | `feat/wbs-spreadsheet-export`   | REQ-XLS-02/06/07           | Pending   | —            | —                                                                                                                  |
| 12    | `feat/wbs-import-preview`       | REQ-XLS-01/03/05           | Pending   | —            | —                                                                                                                  |
| 13    | `feat/wbs-import-commit`        | REQ-XLS-03/04/08           | Pending   | —            | —                                                                                                                  |
| 14    | `feat/sample-projects`          | REQ-DEMO-01                | Pending   | —            | —                                                                                                                  |
| 15    | `feat/project-report`           | REQ-RPT-01–04              | Pending   | —            | —                                                                                                                  |
| 16    | `feat/project-report-print`     | REQ-PRINT-01–03            | Pending   | —            | —                                                                                                                  |
| 17    | `test/project-features-e2e`     | §15                        | Pending   | —            | —                                                                                                                  |

## Log

### 0 · `chore/extension-audit`

- Audit matrix, decisions and pull request plan: `horizon-extension-audit.md`.
- REQ-06 closed without changes: every tracked file in `.github`, `.husky` and `.vscode`
  is needed and holds no secret (per-file table in the audit).
- The dev server no longer watches generated folders (`coverage/`, `dist/`,
  `test-results/`, `playwright-report/`, `blob-report/`). Before, each coverage run
  rewrote about 330 watched files and kept the server busy (over 1 GB of memory after a
  day of test runs).

### 1 · `feat/project-lifecycle`

- Transitions in `src/features/projects/lib/lifecycle.ts`; the store's `transition` is the
  only way to change a status (`update` ignores status fields).
- Stored values kept; labels: `paused` → **Adiado**, `cancelled` → **Não concluído**.
- `lifecycle` on every project: actual start, completion, closing date and reason,
  postponement (reason, expected resume, revised finish) and history. Snapshot v2 with a
  v1 migration that backfills only what v1 shows and invents no history.
- Project panel: status with icon, "Atrasado" badge (open project past its planned
  finish), lifecycle facts, history, and "Alterar status" with the allowed transitions.
  Completing with pending schedule tasks requires a justification.
- New projects start as **Planejado** or **Em andamento**.
- Acceptance (REQ-01): valid transitions persist after reload ✅; invalid ones show an
  inline error ✅; postponing without a date is rejected ✅ (legacy postponed projects show
  "Sem previsão informada"); closed projects are read-only, so no automatic delay can
  touch them ✅; history kept on reopen and resume ✅.
- Tests: 673 Vitest tests passing (40 new); Chrome check of the v1 migration, the close
  dialog and the history after reload, no console errors.
- Not in this PR: resuming keeps the plan as is; reprojecting the dates of a resumed
  project comes with the forecast (order 7).

### 2 · `feat/project-visibility-trash`

- `hiddenAt` and `deletedAt` on every project (snapshot v3, migration sets both to
  `null`). Placement rule in `src/features/projects/lib/visibility.ts`: trash, then
  hidden, then listed. Status, dates, progress and schedule are never touched.
- Store actions `hide`, `unhide`, `moveToTrash`, `restore` and `deletePermanently` (only
  for trashed projects; deletes the schedule too). `update` ignores visibility fields;
  repeated actions are no-ops.
- "Excluir" in the project panel now moves the project to the trash; "Ocultar" sits next
  to it with a different icon. Both offer "Desfazer" in the notice.
- Pages `#/ocultos` (show again, open, move to trash) and `#/lixeira` (restore, delete
  permanently after confirmation), reached from a header menu with counts. The sidebar
  (order 3) will take over this navigation.
- The portfolio, its filters and facet counts use visible projects only. Backups still
  export every project, hidden and trashed included.
- A hidden project still opens by URL; a trashed one opens read-only.
- Acceptance (REQ-07): hide and show again without losing data ✅; restoring keeps tasks,
  dates and the hidden flag ✅; a hidden completed project appears in "Ocultos", not in
  the timeline ✅ (statistics come with order 8); reloads never lose a project ✅.
- Tests: 689 Vitest tests passing (16 new); Chrome check of hide, trash, counts, restore
  after reload and show again, no console errors.

### 3 · `feat/navigation-sidebar`

- Section rules in `src/features/projects/lib/sections.ts`, shared by lists and counts:
  Todos (visible), Ativos (planned or in progress), Adiados, Não concluídos, Concluídos,
  Ocultos, Lixeira. The four status sections never overlap and add up to Todos.
- Addresses `#/ativos`, `#/adiados`, `#/nao-concluidos`, `#/concluidos` (plus
  `#/ocultos`, `#/lixeira`); reloads and the back button keep the section.
- Sidebar (`NavigationSidebar.tsx`): labels and counts when expanded; icons with
  tooltips when collapsed, which narrows it from 224 to 56 px (the timeline measured
  1 216 → 1 384 px wide); `aria-expanded` on the toggle, `aria-current` plus a bar and bold
  text on the active section; remembered in this browser. Below `md` a menu button opens
  the same list in a drawer that closes after a choice.
- The project open in the side panel stays drawn while a status change moves it out of
  the current section. Empty sections explain themselves and link to every project.
- Not changed: the project workspace keeps its own full-width layout with the way back.
- Acceptance (REQ-02): collapse, navigate, reload and come back consistently ✅; every
  section reachable collapsed, by keyboard and by screen reader ✅; the project panel is
  never covered (the phone drawer is modal and closes on choice) ✅. REQ-07 navigation:
  required sections Ativos, Concluídos, Ocultos, Lixeira plus Adiados and Não concluídos ✅;
  counts equal the lists ✅.
- Tests: 701 Vitest tests passing (12 new) and 8 Playwright tests; Chrome check at
  1440 px expanded and collapsed, after reload, and at 390 px (no horizontal overflow),
  no console errors.

### 4 · `feat/expanded-project-dialog`

- "Expandir cronograma" (icon button in the project panel header, next to "Abrir
  cronograma") opens `ExpandedProjectDialog`: the same `ProjectWorkspace` as the full page
  in `presentation="dialog"`, so there is no second table, chart or progress formula.
- The route does not change; closing returns to the page as it was (the project panel
  stays open); "Abrir página completa" navigates to `#/projetos/<id>`.
- 96% of the viewport on desktop (measured 1 382 × 864 px at 1 440 × 900), full screen
  on phones; overlay with an 8 px backdrop blur where supported and a plain dim layer
  otherwise.
- Escape closes it unless a cell edit, a bar or row drag (`src/lib/escapeGuard.ts`) or a
  nested menu/dialog owns the key; clicking outside never closes it; a pending, failed or
  conflicting save asks before closing. Focus is trapped and returns to the opener; the
  page behind is inert and does not scroll; its shortcuts (`N`, zoom, pan) pause.
- The dialog is named "Cronograma de <projeto>" so it is distinct from the project
  panel, and it does not add a second `main` landmark.
- Acceptance (REQ-04): route unchanged ✅; large view with a light blur ✅; keyboard
  accessible, focus restored ✅ (axe clean); same data as the full page after an edit ✅;
  rows and bars aligned inside it (0 px) ✅; opening the full page navigates correctly ✅.
- Tests: 709 Vitest tests passing (8 new) and 8 Playwright tests; Chrome check at
  1 440 px and 390 px, no console errors.

### 5 · `feat/task-based-progress`

- One rule in `src/features/schedule/lib/progress.ts`, used by the engine for summaries
  and the project: only leaf tasks count, each weighs the same, a task contributes its own
  percentage, milestones count only when they are all there is, no eligible task gives
  0%, and rounding never shows 100% while work remains (nor 0% once work started).
- The engine reports `completion` (eligible tasks and how many are done); the workspace
  header shows "27% · 2 de 9 tarefas concluídas".
- The portfolio keeps receiving the value through `portfolioSync.ts`, so the timeline
  bar, the drawer, the modal and the table show the same number.
- REQ-08: bar drawing untouched. Before/after in Chrome on the sample schedule (same edits):
  Engenharia 83% → 67%, Suprimentos 29% → 20%, project 28% → 27%; bars, fill, colors and
  positions identical. `GanttBar.test.tsx` pins geometry, fill width (0–100%, any zoom),
  summary brackets and milestone diamonds.
- Not done (documented): a weighted mode (effort, points) is not offered; durations are
  not effort, and there is no effort field yet.
- Acceptance (REQ-03): 4 tasks, 1 done = 25%, 2 done = 50% ✅; 2 phases × 2 tasks = 4
  tasks ✅; reopening lowers it ✅; reordering does not change it ✅; postponed or closed
  projects keep their progress ✅ (no transition touches it); bars unchanged ✅.
- Tests: 730 Vitest tests passing (21 new) and 8 Playwright tests.

### 6 · `feat/daily-checkins`

- Tasks keep `completedWork` (working days done) with `progress` derived from it, plus
  `actualStart` and `actualFinish`. Editing the percentage or the duration keeps the work
  consistent; copies keep the work but not the actual dates.
- `DailyCheckIn` (task, work date, `done` or `not_done`, units in working days, recorded
  at) stored in the schedule. Rules in `src/features/schedule/lib/checkIns.ts`: one per
  task and date (recording again replaces it), dates up to today, leaf tasks only, units
  in half-day steps except for finishing exactly what remains; a task is complete only
  when its work reaches its duration; undo takes the work back; deleting a task drops its
  check-ins. A day without a check-in is "pending confirmation", never assumed.
- Daily agenda: leaf tasks planned for the date (from the computed schedule) and
  unfinished ones whose planned end has passed; days off ask nothing.
- Schedules: storage version 2. Version 1 schedules and old backups are upgraded by the
  schema (`upgradeTask`): work taken from the percentage, actual dates unknown, no
  check-ins.
- UI: "Atividades do dia" toolbar button with the count waiting for confirmation; the
  dialog confirms today or an earlier day ("Feito", "Concluir tarefa", "Não realizado",
  "Desfazer"); everything goes through the schedule store, so table, bars and project
  percentage update at once and are saved; closed projects only show the list.
- Bugs found in Chrome and fixed before review: finishing a task whose remaining work came
  from a typed percentage (e.g. 1,2 days) was refused.
- Acceptance (spec 10.8): 8 (repeating a check-in has no extra effect) ✅, 9 (earlier
  dates keep the history) ✅, 11 (one day does not close a 5-day task) ✅, 12 (last task →
  100%) ✅, 13 (reopening lowers progress) ✅, 3 (days off ask nothing) ✅. Scenarios about
  the finish forecast (1, 2, 4–7, 10, 14) belong to order 7.
- Not done: who confirmed (the app has a single local user); saving failures keep the
  existing behavior (save status with retry, nothing lost in memory).
- Tests: 756 Vitest tests passing (26 new) and 8 Playwright tests; Chrome check of the
  dialog, the toolbar count and the saved result after reload, no console errors.

### 7 · `feat/schedule-forecast`

- `computeForecast` in `src/features/schedule/lib/forecast.ts`: the plan replayed from
  what happened. Done tasks stay on their actual dates (a typed 100% without dates stays
  where the plan put it); the remaining work (`duration - completedWork`, whole working
  days) of every other task starts no earlier than the data date (today, or the next
  working day when today's work on it is confirmed); not started tasks keep their
  requested start and follow their predecessors' forecasts through the same links
  (`linkBound`, shared with the engine) and calendar.
- Pure function of (schedule, today): no stored forecast, no background job. The same day
  computed twice gives the same result, a repeated confirmation changes nothing, and a
  confirmation recorded later for an earlier day gives the corrected forecast. This is
  how the idempotency and "consistent even if nobody opens the app" requirements are met
  in a local app without a server.
- Variance in working days; causes = tasks on the driving path whose own deviation (late
  or early) moved the finish, shown as "Por que mudou".
- Baseline (`ScheduleBaseline` in the schedule, storage version 3): saved, updated or
  removed only on request; never moved by edits, check-ins or the forecast.
- UI: a strip below the toolbar with "Término planejado", "Previsão" (+/- working days)
  and "Linha de base"; "Detalhes da previsão" with the explanation and the baseline
  actions. Suspended for postponed and closed projects. The Gantt bars keep showing the
  plan, so bars, connectors and rows stay aligned.
- Spec 10.8 scenarios as unit tests: 1, 2, 3, 4, 5, 6 (one day earlier, not two), 7, 8,
  9, 11, 14 ✅; 10 (postponed or closed projects get no running forecast) ✅ in the UI;
  12 and 13 were covered by order 6.
- Not done: a log of forecast changes (`ScheduleForecastLog`). The forecast is derived on
  read, so storing it would only create data that can go stale; the inputs that explain
  it (check-ins with their dates, baseline) are stored. Postponed projects do not
  re-forecast on resume automatically: the plan stays and the forecast restarts from today.
- Tests: 779 Vitest tests passing (23 new) and 8 Playwright tests; Chrome check on the
  sample schedule (a task on the driving path with 1,2 days left on its last planned day
  gives +1 working day; completing a late task with slack changes nothing), no console
  errors.

### 8 · `feat/portfolio-statistics`

- Rules in `src/features/projects/lib/statistics.ts`: started (actual start in the
  period), completed (completion date in the period), not completed (closing date in the
  period), completion rate = completed / (completed + not completed), and current states
  (in progress, postponed, planned) plus the plain average progress of projects in
  progress, labelled as such.
- Scope: every project outside the trash, hidden ones included; the trash is counted
  apart and comes back when restored. Single local user, so no owner filter.
- Periods: all, this year, last 90 days, last 30 days; dated indicators only.
- "Meu painel" at `#/painel`, first item of the sidebar; each card states what it counts;
  a note says the indicators overlap and must not be added up.
- Also: `CONTRIBUTING.md` states that contributions carry no AI tool attribution.
- Acceptance (REQ-05): counts match the data and survive reloads ✅; a hidden completed
  project stays counted ✅; a trashed one leaves the indicators and comes back on restore ✅;
  status changes are reflected at once ✅.
- Tests: 790 Vitest tests passing (11 new) and 8 Playwright tests; Chrome check at 1 440
  and 390 px (no horizontal overflow), no console errors.

### 9 · `test/project-experience-e2e`

- `e2e/extension.spec.ts`, in Chrome on the production build:
  - **A** start, postpone with a forecast, resume, complete (moves to "Concluídos" and to
    the dashboard), close another one without completing, hide the completed one (out of
    "Concluídos", in "Ocultos", still counted), trash it (out of the indicators), restore
    it (back to "Ocultos" as completed), collapse the sidebar (8 destinations, remembered
    after reload);
  - **B** expanded dialog without route change, rows and bars aligned, edit saved,
    Escape closes and focus returns to the opener, the full page shows the same value;
  - **C** completing a task from "Atividades do dia" sets it to 100% and the done-tasks
    count, survives a reload, and undoing restores both.
- Repeated twice in a row without failures.

## Final report

### Definition of done (specification §16)

| Item                                                                           | State                                                                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Coverage matrix inspected and updated with real evidence                       | Done: `horizon-extension-audit.md` and the log above                                                                   |
| Every new requirement covered or justified                                     | Done: REQ-01 to REQ-09; REQ-06 needed no change; multi-user items not applicable (one local user)                      |
| Status, hiding, trash, progress, check-ins and forecast separate in the domain | Done: `lifecycle.ts`, `visibility.ts`, `progress.ts`, `checkIns.ts`, `forecast.ts`, each with its own fields and tests |
| Sidebar, dialog, filters and indicators meet acceptance                        | Done: orders 3, 4 and 8                                                                                                |
| Bars and percentages kept their look                                           | Done: before/after check and `GanttBar.test.tsx` (order 5)                                                             |
| Check-ins and forecast handle calendars, parallel work and links               | Done: spec scenarios as unit tests (orders 6 and 7)                                                                    |
| No duplicated penalty for reprocessing, holidays or closed projects            | Done: pure forecast, one check-in per task and day, days off ask nothing, forecast suspended when not in progress      |
| Baseline, planned, forecast and actual dates distinct and stored               | Done: baseline and actual dates stored; plan and forecast derived; never overwritten                                   |
| Tests and migrations recorded with real results                                | Done: 790 Vitest and 11 Playwright tests; project data v1 → v3 and schedule v1 → v3 migrations, each tested            |
| Authorization and multi-user scope coherent                                    | Applies as a single local user: closed and trashed projects are read-only in the store; no accounts exist yet          |
| Pull requests with description, evidence and rollback                          | Done for #26–#34 and this one; rollback = revert the PR (data migrations only add fields, older data stays readable)   |
| Progress and handoff documents match the repository                            | Done: this file                                                                                                        |

### Known limitations

- No user accounts: per-user hiding, owner filters and "who confirmed" are not possible
  yet; the access rule (`getScheduleAccess`) is the extension point.
- The forecast is computed when a schedule is read, not by a background job; nothing is
  stored that could go stale, and the history of forecast changes is not kept.
- Check-ins are in half-day steps; there is no effort field, so progress weighting by
  effort is not offered.
- The portfolio timeline shows planned dates; the forecast is shown in the project
  workspace.

### 10 · `feat/project-explorer-sidebar`

- Consolidated audit of the third document: `horizon-addendum-03-audit.md` (matrix,
  reuse, decisions, plan). Decision 1 (sample projects) was approved.
- The existing sidebar becomes the project explorer (no second sidebar): each section
  (except "Todos", which would repeat them all) expands to list its projects by title, up
  to 50 with "Ver todos"; a search field finds any project by title, ignoring case and
  accents, hidden and trashed ones included and labelled with their section, up to 30
  results; Escape clears it.
- In the project workspace the explorer sits beside the table and the chart, marks the
  open project and opens its section; collapsed, it shows the current project and a
  "Buscar projeto" button that expands the rail into the search field. It follows the
  same remembered preference. The expanded dialog keeps the workspace without it.
- Rules in `src/features/projects/lib/sections.ts` (`searchProjects`, `sortByTitle`,
  `getHomeSection`).
- Bug found by the tests and fixed: opening a project before the list had loaded left its
  section closed.
- Acceptance (§14, sidebar items): every project reachable, including "Ocultos" and
  "Lixeira" ✅; expanded lets you read and find projects ✅; collapsed frees width (1 184 →
  1 384 px) and stays navigable by keyboard, tooltips and search ✅; preference kept ✅;
  choosing a project opens its own workspace ✅; lists and counts follow changes ✅; rows and
  bars stay aligned (0 px) when toggling ✅. Print: the report (order 16) hides it.
- Tests: 798 Vitest tests passing (8 new) and 11 Playwright tests; Chrome check with the
  sample data and with 250 projects (search answered in about 60 ms), no console errors.

### 10a · `feat/explorer-horizons`

- Requested by the product owner after #36: the projects listed under each section of
  the explorer are split into the portfolio horizons (Curto, Médio and Longo prazo), as
  subcategories with their color and count, each one foldable. Same lanes and colors as
  the timeline; rule in `groupByHorizon` (`src/features/projects/lib/sections.ts`).
- The flow it serves: open a project from the sidebar, then collapse the sidebar to give
  the width to the table and the chart.
- Also carries the approval of decision 1 (sample projects), which missed #36.
- Tests: 800 Vitest tests passing (2 new) and 11 Playwright tests; Chrome check with the
  sample data, no console errors.

## Impediments

None.
