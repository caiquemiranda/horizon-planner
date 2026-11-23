# Project lifecycle, visibility, progress and forecast: progress

Real delivery state of the extension planned in
[`horizon-extension-audit.md`](./horizon-extension-audit.md). Updated with every pull
request. An item is **Delivered** only when it is integrated, persists after a reload and
its acceptance tests pass in CI.

| Order | Branch                          | Requirement         | State     | Pull request | Tests                                                                                   |
| ----- | ------------------------------- | ------------------- | --------- | ------------ | --------------------------------------------------------------------------------------- |
| 0     | `chore/extension-audit`         | Audit, plan, REQ-06 | Delivered | #26          | Docs only; dev server watch ignores checked by hand (see below)                         |
| 1     | `feat/project-lifecycle`        | REQ-01              | In review | #27          | `lifecycle.test.ts`, `migrations.test.ts`, `lifecycleFlows.test.tsx`; checked in Chrome |
| 2     | `feat/project-visibility-trash` | REQ-07 (data)       | Pending   | —            | —                                                                                       |
| 3     | `feat/navigation-sidebar`       | REQ-02, REQ-07 (UI) | Pending   | —            | —                                                                                       |
| 4     | `feat/expanded-project-dialog`  | REQ-04              | Pending   | —            | —                                                                                       |
| 5     | `feat/task-based-progress`      | REQ-03, REQ-08      | Pending   | —            | —                                                                                       |
| 6     | `feat/daily-checkins`           | REQ-09 (check-ins)  | Pending   | —            | —                                                                                       |
| 7     | `feat/schedule-forecast`        | REQ-09 (forecast)   | Pending   | —            | —                                                                                       |
| 8     | `feat/portfolio-statistics`     | REQ-05              | Pending   | —            | —                                                                                       |
| 9     | `test/project-experience-e2e`   | Scenarios A–C       | Pending   | —            | —                                                                                       |

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

## Impediments

None.
