# Project lifecycle, visibility, progress and forecast: audit and plan

Audit of the repository (state of `develop` after PR 25) against the extension
specification for project statuses, the collapsible sidebar, task-based progress, the
expanded project dialog, the profile, dot-folder hygiene, hiding/trash, preserving the
Gantt progress bars, and daily check-ins with an automatic finish forecast. The
specification documents themselves are kept outside the repository. This file records
the starting point and the decisions; delivery is tracked in
[`horizon-extension-progress.md`](./horizon-extension-progress.md).

States: **Implemented** (behaviour, persistence and tests all present), **Partial**,
**Missing**, **Conflicting** (the current design contradicts the requirement), **Not
applicable**.

## Product facts that shape every decision

| Fact                                                                        | Evidence                                                                                    | Consequence                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-user, local-first app: no accounts, no server, no API.               | `src/services/persistence/*` (localStorage), `docs/architecture.md`                         | "Per-user" preferences and permissions apply to the one local user. Hidden/trash are stored on the project. API and multi-user scenarios (spec D) are **not applicable**: the single access rule (`getScheduleAccess`) stays the extension point. |
| Data is versioned and migrated.                                             | `services/persistence/migrations.ts` (`SNAPSHOT_MIGRATIONS`), `SNAPSHOT_SCHEMA_VERSION = 1` | New project fields go through a versioned snapshot migration with tests on v1 fixtures. Backups (`data-io/lib/backup.ts`) follow the same path.                                                                                                   |
| Project status already exists as an enum.                                   | `types/project.ts` `PROJECT_STATUSES`, `projects/constants.ts` `STATUS_META`                | Reuse it; no second status field.                                                                                                                                                                                                                 |
| The scheduling engine is pure, deterministic and already rolls up progress. | `schedule/lib/engine.ts` (`computeSchedule`), `engine.test.ts`                              | Progress and forecast are computed there, never in components.                                                                                                                                                                                    |
| A project with tasks takes its dates and progress from its schedule.        | `schedule/lib/portfolioSync.ts`                                                             | The new progress rule reaches the portfolio bar, drawer and workspace through this one path.                                                                                                                                                      |
| No background process exists (static site on GitHub Pages).                 | `.github/workflows/deploy.yml`                                                              | A "daily job" cannot run while the app is closed. The forecast must be a pure function of (schedule, check-ins, today), recomputed whenever the project is read: the same result whoever opens it and whenever, so idempotent by construction.    |

## Requirement matrix

| REQ    | Requirement                                      | Current state                                                                                                                                       | Evidence                                                                                                                 | Gap                                                                                                                                                                                                                                                 | Action                                                                                    | PR                                                         | Risk                                                                                                                          |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| REQ-01 | Lifecycle statuses and transitions               | **Partial.** Five statuses (`planned`, `in_progress`, `paused`, `completed`, `cancelled`) chosen freely in a select; closed projects are read-only. | `types/project.ts`, `STATUS_META`, `ProjectForm.tsx` status select, `schedule/lib/access.ts`, `robustnessFlows.test.tsx` | No transition rules, no reason or dates for postponing/closing, no `completedAt`/`closedAt`/`startedAt`, no history, no confirmation, no derived "late" indicator. Labels "Pausado"/"Cancelado" differ from the requested "Adiado"/"Não concluído". | Adjust: keep the stored values, relabel, add a transition domain and metadata + migration | `feat/project-lifecycle`                                   | Status is used by filters, timeline textures and the read-only rule: keep the stored values so all of them keep working.      |
| REQ-02 | Collapsible sidebar / navigation rail            | **Missing.** The shell is a header with toolbar menus; the timeline's left column (`LaneSidebar`) lists horizons, it is not navigation.             | `components/layout/AppHeader.tsx`, `PortfolioPage.tsx`, `timeline/components/LaneSidebar.tsx`                            | Everything.                                                                                                                                                                                                                                         | Create, integrated into the current shell                                                 | `feat/navigation-sidebar`                                  | Width changes must refit the timeline (`useElementWidth` already measures).                                                   |
| REQ-03 | Progress from task completion                    | **Partial / conflicting.** Leaf progress is entered (0–100); summaries and the project use a **duration-weighted** average of leaves.               | `engine.ts` `rollUpProgress`, `engine.test.ts`, `portfolioSync.ts`                                                       | The requested default weights every eligible leaf equally; duration is not effort. Milestones need an explicit policy; no "completed" timestamp on tasks.                                                                                           | Adjust the roll-up in the engine (one formula), keep leaf progress                        | `feat/task-based-progress`                                 | Changes the numbers users already see on summaries: documented, tested, no visual change.                                     |
| REQ-04 | Expanded project dialog without navigation       | **Missing.** The drawer (side sheet) edits project fields; the workspace is a separate route.                                                       | `projects/components/ProjectDrawer.tsx`, `ProjectPanel.tsx`, `app/App.tsx`                                               | Large modal with blur showing the real workspace, focus/scroll handling, unsaved-edit guard.                                                                                                                                                        | Create, reusing `ProjectWorkspace` (no second grid/Gantt)                                 | `feat/expanded-project-dialog`                             | The workspace assumes it owns the page; it already has its own viewport store per chart (`ViewportStoreContext`).             |
| REQ-05 | Profile and statistics                           | **Missing.**                                                                                                                                        | —                                                                                                                        | Page, indicators, period filter.                                                                                                                                                                                                                    | Create (local data, "Meu painel")                                                         | `feat/portfolio-statistics`                                | Needs the lifecycle dates of REQ-01 to count by period; older projects have none (counted as "date unknown", never invented). |
| REQ-06 | `.github`, `.husky`, `.vscode` audit             | **Implemented.** See the per-file table below: nothing to change.                                                                                   | `git ls-files .github .husky .vscode`, `.gitignore`, `package.json` `prepare`                                            | None.                                                                                                                                                                                                                                               | No PR (no empty PR)                                                                       | —                                                          | —                                                                                                                             |
| REQ-07 | Hide, trash, navigation sections                 | **Missing / conflicting.** Delete is permanent and cascades to the schedule after a confirmation; nothing can be hidden.                            | `ProjectEditor.tsx` (Excluir dialog), `projectsStore.ts` `remove` + `onRemoved`                                          | Hidden flag, soft delete with restore, permanent delete from the trash, sections with counts.                                                                                                                                                       | Adjust delete into soft delete; create hide; sections in the sidebar                      | `feat/project-visibility-trash`, `feat/navigation-sidebar` | Every list (timeline, filters, facet counts, exports) must exclude trashed projects through one selector.                     |
| REQ-08 | Preserve the Gantt progress bars                 | **Implemented** (visual): fill from the left, percentage label, summary brackets, milestone diamonds.                                               | `gantt/components/GanttBar.tsx`, `timeline/components/ProjectBar.tsx`, `docs/assets/workspace-gantt-*.png`               | Only the source of summary/project values changes (REQ-03).                                                                                                                                                                                         | Keep; add regression tests on the rendered width/label                                    | `feat/task-based-progress`                                 | Low.                                                                                                                          |
| REQ-09 | Daily check-in, actual progress, forecast finish | **Missing.** The engine schedules from requested starts and links; there are no actual dates, no work log, no baseline and no forecast.             | `engine.ts`, `types/schedule.ts`                                                                                         | Check-in log, actual start/finish, remaining work, baseline, forecast with explanation.                                                                                                                                                             | Create on top of the engine and the calendar                                              | `feat/daily-checkins`, `feat/schedule-forecast`            | The largest change: schedule schema migration and a second engine pass. Split in two PRs.                                     |

### REQ-06: dot folders, per file

| Path                                                   | Tracked | Content                                                                               | Recommendation                                                   |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.github/workflows/ci.yml`                             | yes     | Format, lint, types, tests, build, e2e. `permissions: contents: read`.                | Keep                                                             |
| `.github/workflows/deploy.yml`                         | yes     | GitHub Pages deploy; `pages: write`, `id-token: write` only on the deploy job.        | Keep                                                             |
| `.github/ISSUE_TEMPLATE/*`, `PULL_REQUEST_TEMPLATE.md` | yes     | Team templates.                                                                       | Keep                                                             |
| `.husky/pre-commit`, `.husky/commit-msg`               | yes     | `lint-staged` and `commitlint`; used (`prepare: husky`, `core.hooksPath = .husky/_`). | Keep                                                             |
| `.husky/_/`                                            | no      | Generated by husky 9 (ignores itself).                                                | Keep untracked                                                   |
| `.vscode/extensions.json`, `.vscode/settings.json`     | yes     | Shared recommendations and formatter settings; no paths, no secrets.                  | Keep                                                             |
| Other `.vscode/*`, other hidden folders                | no      | Personal files and local tool folders.                                                | Ignored by `.vscode/*` and `/.*/` with explicit exceptions: keep |

No secret, token or absolute path was found in the tracked files. No housekeeping PR.

## Decisions

1. **Stored status values stay; labels change.** `paused` is shown as **Adiado** and
   `cancelled` as **Não concluído** (closed without success). Keeping the values avoids
   a data migration of every project and keeps filters, timeline textures and the
   read-only rule working. `planned` stays (a project not started yet).
2. **"Late" is derived**, never a status: an open project whose forecast (or, without a
   schedule, its end date) is after its planned finish, or whose end date has passed.
3. **Postponing** requires a reason and at least one date: expected resume and/or revised
   finish, labelled separately. Resuming restores **Em andamento** and keeps the history.
4. **Hidden and trashed live on the project** (`hiddenAt`, `deletedAt`): the product has
   one user, so a per-user table would have no second user to serve. Restoring from the
   trash keeps the hidden flag. Trashed projects leave every list and indicator;
   permanent deletion is only offered inside the trash and still cascades to the
   schedule.
5. **Progress:** every eligible leaf task weighs 1 and contributes its own completion
   (`progress / 100`, so 100% = done). Milestones are excluded when the parent has other
   work; summaries never count. Duration weighting is dropped as the default because
   duration is not effort. Leaf bars keep their look and values.
6. **Daily check-ins** record work against a task for a date (`done` or `not_done`, with
   the working days of work completed). A check-in never closes a multi-day task by
   itself: a task is complete only when its completed work reaches its duration or the
   user marks it complete.
7. **Forecast** is computed by the engine from remaining work, actual dates, the calendar
   and the dependency graph, starting no earlier than today for unfinished work. It never
   rewrites the baseline or the planned finish. Because it is a pure function, re-reading
   the same day never adds a second delay, and a late check-in simply produces the
   corrected forecast. A missing check-in counts as "not confirmed" (shown as such), not
   as proof that the work was not done.
8. **Baseline** is an explicit action ("Salvar linha de base"), stored with the schedule.
   Without one, the variance is shown against the project's planned end date.

## Pull request plan

| Order | Branch                          | Scope                                                                                                                              | Depends on | Main acceptance                                                                                  |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 0     | `chore/extension-audit`         | This audit, the progress file, dev server ignores generated folders (`coverage/`, `dist/`, test reports).                          | —          | Docs reviewed; `npm run dev` no longer reacts to test or build output.                           |
| 1     | `feat/project-lifecycle`        | Transition domain, lifecycle dates and reasons, history, snapshot v2 migration, status dialogs, derived "late" badge, relabelling. | 0          | Valid transitions persist after reload; invalid ones show a clear error; history kept on reopen. |
| 2     | `feat/project-visibility-trash` | Hide/unhide with undo, soft delete, restore, permanent delete in the trash, one selector for visible projects, snapshot v3.        | 1          | Hiding never loses data; restore keeps tasks, dates and the hidden flag.                         |
| 3     | `feat/navigation-sidebar`       | Collapsible rail (persisted), sections Ativos, Adiados, Não concluídos, Concluídos, Ocultos, Lixeira, with counts; mobile drawer.  | 2          | Every section reachable collapsed, by keyboard and screen reader; counts equal list lengths.     |
| 4     | `feat/expanded-project-dialog`  | Large modal with light backdrop blur showing the real workspace; open full page; focus, Esc, scroll lock.                          | 0          | Route unchanged while open; focus returns to the trigger; same data as the full page.            |
| 5     | `feat/task-based-progress`      | Equal-weight leaf roll-up in the engine, milestone policy, regression tests on bars.                                               | 0          | 4 leaves, 1 done = 25%; 2 parents with 2 children count 4 leaves; reopen lowers progress.        |
| 6     | `feat/daily-checkins`           | Check-in log and actual dates in the schedule (schedule schema v2), "Atividades de hoje" panel, undo, check-in on another date.    | 5          | A 5-day task is not closed by one check-in; duplicate check-ins have no extra effect.            |
| 7     | `feat/schedule-forecast`        | Forecast pass in the engine, baseline, planned vs forecast with working-day variance and explanation.                              | 6          | Scenarios 1–15 of the specification as unit tests.                                               |
| 8     | `feat/portfolio-statistics`     | "Meu painel": started, completed, not completed, postponed, in progress, completion rate, period filter.                           | 1, 2       | Hidden completed projects still counted; trashed ones excluded and back after restore.           |
| 9     | `test/project-experience-e2e`   | Cross-module Playwright scenarios A–C, docs, final report.                                                                         | 1–8        | All scenarios pass in CI.                                                                        |

```
0 audit ─┬─ 1 lifecycle ── 2 visibility/trash ── 3 sidebar
         │        └──────────────┴───────────────── 8 statistics
         ├─ 4 expanded dialog
         └─ 5 progress ── 6 check-ins ── 7 forecast
                                    all ── 9 e2e
```

Pull requests are merged in this order to avoid two open branches changing the same
schema. Not applicable: API and multi-user permission scenarios (no accounts yet), the
"global daily job" (replaced by the pure forecast, decision 7).
