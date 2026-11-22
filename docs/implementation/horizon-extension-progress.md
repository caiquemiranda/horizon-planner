# Project lifecycle, visibility, progress and forecast: progress

Real delivery state of the extension planned in
[`horizon-extension-audit.md`](./horizon-extension-audit.md). Updated with every pull
request. An item is **Delivered** only when it is integrated, persists after a reload and
its acceptance tests pass in CI.

| Order | Branch                          | Requirement         | State       | Pull request | Tests                                                           |
| ----- | ------------------------------- | ------------------- | ----------- | ------------ | --------------------------------------------------------------- |
| 0     | `chore/extension-audit`         | Audit, plan, REQ-06 | In review   | —            | Docs only; dev server watch ignores checked by hand (see below) |
| 1     | `feat/project-lifecycle`        | REQ-01              | In progress | —            | —                                                               |
| 2     | `feat/project-visibility-trash` | REQ-07 (data)       | Pending     | —            | —                                                               |
| 3     | `feat/navigation-sidebar`       | REQ-02, REQ-07 (UI) | Pending     | —            | —                                                               |
| 4     | `feat/expanded-project-dialog`  | REQ-04              | Pending     | —            | —                                                               |
| 5     | `feat/task-based-progress`      | REQ-03, REQ-08      | Pending     | —            | —                                                               |
| 6     | `feat/daily-checkins`           | REQ-09 (check-ins)  | Pending     | —            | —                                                               |
| 7     | `feat/schedule-forecast`        | REQ-09 (forecast)   | Pending     | —            | —                                                               |
| 8     | `feat/portfolio-statistics`     | REQ-05              | Pending     | —            | —                                                               |
| 9     | `test/project-experience-e2e`   | Scenarios A–C       | Pending     | —            | —                                                               |

## Log

### 0 · `chore/extension-audit`

- Audit matrix, decisions and pull request plan: `horizon-extension-audit.md`.
- REQ-06 closed without changes: every tracked file in `.github`, `.husky` and `.vscode`
  is needed and holds no secret (per-file table in the audit).
- The dev server no longer watches generated folders (`coverage/`, `dist/`,
  `test-results/`, `playwright-report/`, `blob-report/`). Before, each coverage run
  rewrote about 330 watched files and kept the server busy (over 1 GB of memory after a
  day of test runs).

## Impediments

None.
