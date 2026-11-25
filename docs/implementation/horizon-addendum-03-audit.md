# Reports, spreadsheets, sample projects and project explorer: audit and plan

Audit of `develop` after #35 against the third specification document (reports,
Excel/CSV, sample projects and the project explorer sidebar), consolidated with the two
earlier ones. The specification documents are kept outside the repository. Delivery is
tracked in [`horizon-extension-progress.md`](./horizon-extension-progress.md) (orders 10
onwards).

The three documents are read as one cumulative specification: a requirement that appears
in more than one of them (the sidebar, progress, the forecast) is one feature with the
union of its criteria, not two implementations.

## What is reused as is

| Requirement in this document                                         | Already delivered by                                                  | Action                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| Single progress rule (leaf tasks, no double count, milestones)       | `schedule/lib/progress.ts` (#31)                                      | Reuse, no new formula       |
| Planned, forecast and actual finish as different quantities          | `schedule/lib/forecast.ts`, actual dates on tasks (#32, #33)          | Reuse                       |
| Status, hidden, trash definitions                                    | `projects/lib/lifecycle.ts`, `visibility.ts`, `sections.ts` (#27–#29) | Reuse                       |
| Collapsible sidebar with sections, counts, persistence, phone drawer | `NavigationSidebar.tsx` (#29)                                         | Extend (REQ-NAV-01)         |
| Hierarchy, WBS numbers, links, scheduling engine                     | `schedule/lib/tree.ts`, `dependencies.ts`, `engine.ts`                | Reuse for import/export     |
| Large dialog without route change                                    | `ExpandedProjectDialog.tsx` (#30)                                     | Reuse; sidebar stays behind |
| Read-only rules (closed, trashed projects)                           | `schedule/lib/access.ts`                                              | Reuse for reports/imports   |

## Requirement matrix

| REQ                | Feature                                         | Evidence found                                                                               | Satisfied?  | Real gap                                                                                                | Action                                              | PR (branch)                     | Tests                                       | Risk                                                                              |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| REQ-NAV-01         | Sidebar as project explorer                     | Sections with counts, collapse, drawer (`NavigationSidebar.tsx`, `navigationFlows.test.tsx`) | Partial     | Projects are not listed in the sidebar, no search, no current-project mark, no sidebar in the workspace | Extend the existing sidebar                         | `feat/project-explorer-sidebar` | Unit (search), integration, Playwright      | Workspace width change must keep rows and bars aligned                            |
| REQ-XLS-02/06/07   | Template, XLSX and CSV export                   | JSON backup only (`data-io/lib/backup.ts`)                                                   | No          | Everything                                                                                              | Create an export service over the schedule domain   | `feat/wbs-spreadsheet-export`   | Unit (cells, escaping), file read-back      | No spreadsheet library yet (see decision 2)                                       |
| REQ-XLS-01/03/05   | Import wizard: parse, map, preview              | JSON import only                                                                             | No          | Everything                                                                                              | Parser + validator + preview without writing        | `feat/wbs-import-preview`       | Unit per error kind, integration            | Untrusted files: size, zip bombs, formulas                                        |
| REQ-XLS-03/04/08   | Import commit, idempotency, round trip          | Repositories with validation (`projectRepository`, `scheduleRepository`)                     | No          | Atomic creation of project + schedule, retry safety, round trip                                         | Commit through the existing repositories            | `feat/wbs-import-commit`        | Integration, round trip, Playwright         | Two stores: write the schedule first, then the project (see decision 4)           |
| REQ-DEMO-01        | Sample projects, isolated, cloneable            | `data-io/lib/sampleData.ts` replaces all data with fictional projects                        | Conflicting | Demos are not isolated, not labelled and count in "Meu painel"                                          | Replace by flagged, opt-in demos (see decision 1)   | `feat/sample-projects`          | Unit (metrics exclusion, clone), Playwright | Changes an existing behavior: decision 1 to be confirmed                          |
| REQ-RPT-01/02/03   | Report read model, types, as-of date            | Metrics exist in the domain (progress, forecast, check-ins)                                  | No          | One read model composing them; partial, final and current reports; "as of" honesty                      | Read model over the existing domain, no new formula | `feat/project-report`           | Unit per metric, integration                | No history: past as-of dates and progress curves are not offered (see decision 3) |
| REQ-RPT-04, §3     | Report page, KPIs, charts, WBS, read-only Gantt | —                                                                                            | No          | Page, SVG charts, full WBS table, read-only Gantt independent of scroll and collapse                    | Create, reusing geometry and cells                  | `feat/project-report`           | Integration, axe, Playwright                | Size of the PR: split page from print                                             |
| REQ-PRINT-01/02/03 | Print / save as PDF                             | —                                                                                            | No          | Print stylesheet, footer button, segmented Gantt, A4 checks                                             | Browser print, no PDF service                       | `feat/project-report-print`     | Playwright PDF output, visual check         | Browser differences (documented)                                                  |
| §15                | Cross-feature end-to-end                        | 11 Playwright tests (#25, #35)                                                               | Partial     | Import → workspace → export → report → print; demos; explorer                                           | Extend                                              | `test/project-features-e2e`     | Playwright                                  | —                                                                                 |

Not applicable here: endpoints, tenants and server-side authorization (no backend and a
single local user; the access rule stays the extension point), file storage of PDFs.

## Decisions

1. **Sample projects (divergence with the current sample data).** Today "Carregar dados
   de exemplo" replaces every project with fictional ones that look and count like real
   ones. This document asks for isolated, labelled, opt-in demos excluded from the
   indicators, cloneable as a new real project without fictional history. Proposal:
   projects get a `demo` flag (data format v4); "Explorar exemplos" installs the three
   demo projects next to the user's data (idempotent: fixed ids, reinstalled, never
   duplicated); demos are read-only, grouped under "Exemplos" in the sidebar, excluded
   from sections, counts and "Meu painel"; "Criar projeto a partir deste exemplo" copies
   structure, durations and links with new ids and a chosen start date, without
   check-ins, actual dates or progress; "Remover exemplos" removes only flagged projects.
   The old "replace everything with sample data" action is retired (the screenshot and
   performance scripts keep their own fixtures). **Approved by the product owner.**
2. **Spreadsheet library.** `.xlsx` is a zip of XML parts. Instead of a large spreadsheet
   dependency, the export writes the parts itself and the import reads them with
   `fflate` (MIT, small, maintained) and the browser's `DOMParser` (which does not resolve
   external entities): size and entry limits are checked before inflating, formulas are
   read as their cached text and never evaluated, macros (`.xlsm`) are refused. Loaded
   only when used.
3. **No history, no fake curves.** Reports are "as of now" (with date and time); there is
   no past as-of date and no progress curve, because the app keeps the current state, the
   check-ins and the baseline, not snapshots. "Salvar versão do relatório" is not offered.
4. **Atomic import without a server.** The project is created first, because its
   repository gives the id, then the schedule is validated and saved; if the schedule
   fails, the project is removed again. A hash of the file content, the tasks sheet and
   the column mapping is the idempotency key, so a double click or retry opens the project
   already created instead of creating a second one. (Updated in PR 13: the first plan
   saved the schedule first, which needs an id the project repository does not accept.)
5. **Sidebar in the workspace.** The explorer also appears in the project workspace,
   following the same collapsed/expanded preference, so another project is one click
   away; collapsing gives the width back to the table and the chart.

## Pull request plan

| Order | Branch                          | Scope                                                                                                                  | Depends on |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| 10    | `feat/project-explorer-sidebar` | This audit; projects listed under each section, search, current project, sidebar in workspace                          | —          |
| 11    | `feat/wbs-spreadsheet-export`   | XLSX writer, WBS template, project export to XLSX and CSV, formula-injection protection                                | —          |
| 11a   | `feat/timeline-compact-lanes`   | Owner request: collapse the timeline's horizon column to a narrow strip, since projects are reachable from the sidebar | 11         |
| 12    | `feat/wbs-import-preview`       | XLSX/CSV reader with limits, column mapping, validation by row, preview tree, no writing                               | 11         |
| 13    | `feat/wbs-import-commit`        | Create the project and schedule, idempotency, round trip export → import                                               | 12         |
| 14    | `feat/sample-projects`          | Decision 1: flagged demos, "Exemplos", clone as a new project, metrics exclusion                                       | 13         |
| 15    | `feat/project-report`           | Report read model and page: summary, KPIs, SVG charts, full WBS, read-only Gantt                                       | —          |
| 16    | `feat/project-report-print`     | Print stylesheet, footer "Imprimir / Salvar em PDF", segmented Gantt, A4 checks                                        | 15         |
| 17    | `test/project-features-e2e`     | Cross-feature scenarios of §15, final report                                                                           | 10–16      |

### 11a · Compact timeline lanes (owner request)

The portfolio timeline keeps a 240 px column ("Horizontes") with the horizons and the
project names. With the explorer listing every project, that column can fold:

- A toggle in the column header ("Recolher coluna de projetos"), with `aria-expanded` and
  `aria-controls`, remembered in this browser (same pattern as the sidebar preference).
- Collapsed, the column narrows to a strip of about 44 px: each lane keeps its color
  marker and its fold button; each project row keeps its height (rows and bars stay
  aligned), its color dot and its button, with the title in a tooltip and still in the
  accessible name, so keyboard, screen readers and selection work as before.
- The canvas gets the width (about +196 px on desktop); the visible date range is kept
  anchored at its start, no jump.
- Independent from the sidebar: both collapsed give the timeline the most width.
- Acceptance: width gained; lanes still fold; rows and bars aligned (0 px); preference kept
  after reload; axe clean; works at 390 px.
- Tests: store and integration tests, Playwright alignment check.
