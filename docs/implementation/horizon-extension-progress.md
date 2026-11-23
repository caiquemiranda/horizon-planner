# Project lifecycle, visibility, progress and forecast: progress

Real delivery state of the extension planned in
[`horizon-extension-audit.md`](./horizon-extension-audit.md). Updated with every pull
request. An item is **Delivered** only when it is integrated, persists after a reload and
its acceptance tests pass in CI.

| Order | Branch                          | Requirement         | State     | Pull request | Tests                                                                                                              |
| ----- | ------------------------------- | ------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0     | `chore/extension-audit`         | Audit, plan, REQ-06 | Delivered | #26          | Docs only; dev server watch ignores checked by hand (see below)                                                    |
| 1     | `feat/project-lifecycle`        | REQ-01              | Delivered | #27          | `lifecycle.test.ts`, `migrations.test.ts`, `lifecycleFlows.test.tsx`; checked in Chrome                            |
| 2     | `feat/project-visibility-trash` | REQ-07 (data)       | Delivered | #28          | `visibility.test.ts`, `projectsStore.test.ts`, `migrations.test.ts`, `visibilityFlows.test.tsx`; checked in Chrome |
| 3     | `feat/navigation-sidebar`       | REQ-02, REQ-07 (UI) | In review | —            | `sections.test.ts`, `router.test.ts`, `navigationFlows.test.tsx`; checked in Chrome (desktop, collapsed, phone)    |
| 4     | `feat/expanded-project-dialog`  | REQ-04              | Pending   | —            | —                                                                                                                  |
| 5     | `feat/task-based-progress`      | REQ-03, REQ-08      | Pending   | —            | —                                                                                                                  |
| 6     | `feat/daily-checkins`           | REQ-09 (check-ins)  | Pending   | —            | —                                                                                                                  |
| 7     | `feat/schedule-forecast`        | REQ-09 (forecast)   | Pending   | —            | —                                                                                                                  |
| 8     | `feat/portfolio-statistics`     | REQ-05              | Pending   | —            | —                                                                                                                  |
| 9     | `test/project-experience-e2e`   | Scenarios A–C       | Pending   | —            | —                                                                                                                  |

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

## Impediments

None.
