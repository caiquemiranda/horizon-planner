# Planning workspace performance

Measured with `npm run perf` ([`scripts/measure-performance.js`](../scripts/measure-performance.js)):
the production build is served with `vite preview` and a generated schedule is opened in
Chrome. Schedules have phases of 10 tasks, every task linked finish-to-start to the previous
one (about one link per task).

| Measure                  | What it means                                                                |
| ------------------------ | ---------------------------------------------------------------------------- |
| Open                     | From navigation until the table and the first bars are drawn                 |
| Edit → rescheduled       | From pressing Enter on a duration until the table shows the recomputed value |
| Rows / bars / connectors | Elements in the DOM right after opening                                      |
| Idle frame               | Frame interval with nothing to do (the display refresh, 60 Hz here)          |
| Scrolling frame          | Average and 95th percentile frame time while scrolling the rows to the end   |
| Row/bar offset           | Largest vertical distance between a visible row and its bar after scrolling  |

These are real measurements on one machine, not targets: rerun `npm run perf` to compare
on yours. Results vary with the CPU, the power profile and whether Chrome uses the GPU.

## Environment

Chrome 158 (installed build, driven through `playwright-core`), Intel Core i5-1035G1 at
1.0 GHz (8 threads), Windows 10, Node 22. Laptop on battery-friendly power settings.

## Before row virtualization

Every task rendered as a table row and a chart bar (headless Chrome):

| Tasks | Open (ms) | Edit → rescheduled (ms) | Rows in DOM | DOM elements | Scrolling frame avg / p95 (ms, 240 px per frame) | Row/bar offset (px) |
| ----: | --------: | ----------------------: | ----------: | -----------: | -----------------------------------------------: | ------------------: |
|   100 |     1 047 |                     296 |         100 |        4 714 |                                      50.2 / 66.5 |                   0 |
|   500 |     1 592 |                     735 |         500 |       22 672 |                                    238.6 / 331.1 |                   0 |
| 1 000 |     2 735 |                   1 536 |       1 000 |       45 079 |                                    478.9 / 641.4 |                   0 |

With 1 000 tasks scrolling ran at about 2 frames per second: alignment was correct but the
screen was not usable.

## After row virtualization

The table and the chart render the same window of rows (visible rows plus a margin, moving
in blocks of 8 rows); connectors entirely outside it are skipped; row menus are mounted
only when opened.

Chrome with its window visible (GPU compositing):

| Tasks | Open (ms) | Edit → rescheduled (ms) | Rows in DOM | Connectors in DOM | DOM elements | Idle frame (ms) | Scrolling frame avg / p95, 60 px per frame (ms) | 240 px per frame (ms) | Row/bar offset (px) |
| ----: | --------: | ----------------------: | ----------: | ----------------: | -----------: | --------------: | ----------------------------------------------: | --------------------: | ------------------: |
|   100 |       852 |                     116 |          37 |                33 |        1 901 |            16.7 |                                     29.9 / 49.1 |           40.7 / 51.9 |                   0 |
|   500 |     1 213 |                     135 |          37 |                33 |        1 926 |            16.7 |                                     26.7 / 41.0 |           42.4 / 51.8 |                   0 |
| 1 000 |     1 445 |                     165 |          37 |                33 |        1 923 |            16.7 |                                     25.5 / 38.1 |           41.3 / 52.5 |                   0 |

Headless Chrome (software rendering) gives the same DOM sizes and edit times, with scroll
frames of about 35–50 ms.

## Reading the results

- **Cost no longer grows with the schedule size:** with 1 000 tasks the DOM holds about
  1 900 elements instead of 45 000, an edit is reflected in about 0.15 s instead of 1.5 s,
  and opening takes about 1.4 s instead of 2.7 s.
- **Scrolling** at a normal speed runs at roughly 35–40 frames per second on this low-power
  laptop, for any size; very fast scrolling (14 400 px/s) stays around 25 frames per second.
- **Alignment** between rows and bars stays exact (0 px) at every size, after scrolling.
- The scheduling engine itself handles 1 000 linked tasks well under the 2 s budget of its
  unit test (`engine.test.ts`); in the browser the whole edit cycle (engine, table, chart,
  connectors) stays under 0.2 s.

## Next optimizations (not done)

- Memoize table rows and chart bars, so moving the window renders only the rows that
  enter it (the remaining scroll cost is re-rendering the ~37 rendered rows).
- Recompute only the part of the schedule downstream of an edit instead of the whole graph
  (today a full pass stays under 0.2 s at 1 000 tasks, so this is not needed yet).
