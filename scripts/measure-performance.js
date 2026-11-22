/**
 * Measures the project workspace with 100, 500 and 1000 tasks in a real browser.
 *
 * Usage: npm run perf (builds the app first).
 * Serves dist/ with `vite preview`, seeds a generated schedule in a clean browser profile
 * and drives the installed Chrome (or Edge, with HORIZON_BROWSER=msedge) through
 * playwright-core. Prints a Markdown table; numbers depend on the machine, so record the
 * environment next to them (see docs/performance.md).
 */
/* global document, requestAnimationFrame, innerHeight -- used inside page.evaluate (browser) */
import os from 'node:os';

import { chromium } from 'playwright-core';
import { preview } from 'vite';

const PORT = 4319;
const SIZES = (process.env.PERF_SIZES ?? '100,500,1000').split(',').map(Number);
const PROJECT_ID = '00000000-0000-4000-8000-0000000000aa';
const START = '2026-11-23';
const TASKS_PER_PHASE = 10;

/** Phases of 10 tasks; each task follows the previous one (FS), phases chain too. */
function buildData(taskCount) {
  const phases = Math.ceil(taskCount / (TASKS_PER_PHASE + 1));
  const tasks = [];
  const dependencies = [];
  let previousLeaf = null;
  let created = 0;
  for (let phase = 0; phase < phases && created < taskCount; phase += 1) {
    const phaseId = `p${String(phase)}`;
    tasks.push({
      id: phaseId,
      parentId: null,
      order: phase,
      name: `Fase ${String(phase + 1)}`,
      assignee: null,
      notes: '',
      mode: 'auto',
      start: START,
      duration: 1,
      progress: 0,
    });
    created += 1;
    for (let index = 0; index < TASKS_PER_PHASE && created < taskCount; index += 1) {
      const id = `t${String(phase)}-${String(index)}`;
      tasks.push({
        id,
        parentId: phaseId,
        order: index,
        name: `Tarefa ${String(phase + 1)}.${String(index + 1)}`,
        assignee: index % 3 === 0 ? 'Equipe A' : null,
        notes: '',
        mode: 'auto',
        start: START,
        duration: 1 + (index % 4),
        progress: index % 5 === 0 ? 50 : 0,
      });
      if (previousLeaf) {
        dependencies.push({
          id: `l-${id}`,
          predecessorId: previousLeaf,
          successorId: id,
          type: 'FS',
          lag: 0,
        });
      }
      previousLeaf = id;
      created += 1;
    }
  }
  const now = new Date().toISOString();
  return {
    project: {
      id: PROJECT_ID,
      title: `Desempenho ${String(taskCount)}`,
      description: '',
      horizon: 'long',
      category: null,
      status: 'in_progress',
      color: 'blue',
      startDate: START,
      endDate: '2030-12-31',
      progress: 0,
      milestones: [],
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    schedule: {
      projectId: PROJECT_ID,
      revision: 1,
      calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
      tasks,
      dependencies,
      updatedAt: now,
    },
  };
}

async function launchBrowser() {
  const requested = process.env.HORIZON_BROWSER;
  for (const channel of requested ? [requested] : ['chrome', 'msedge']) {
    try {
      return {
        browser: await chromium.launch({ channel, headless: process.env.HEADLESS !== '0' }),
        channel,
      };
    } catch {
      // Try the next one.
    }
  }
  throw new Error('No browser found. Install Chrome or Edge.');
}

async function measure(browser, size) {
  const { project, schedule } = buildData(size);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
  });
  await context.addInitScript(
    ({ project: seededProject, schedule: seededSchedule }) => {
      if (localStorage.getItem('horizon-planner:data')) return;
      localStorage.setItem(
        'horizon-planner:data',
        JSON.stringify({
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          projects: [seededProject],
        }),
      );
      localStorage.setItem(
        `horizon-planner:schedule:${seededProject.id}`,
        JSON.stringify({ schemaVersion: 1, schedule: seededSchedule }),
      );
    },
    { project, schedule },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  // 1. Open the workspace: navigation until the table and the chart are drawn.
  const started = Date.now();
  await page.goto(`http://localhost:${String(PORT)}/#/projetos/${PROJECT_ID}`);
  await page.getByRole('treegrid').waitFor();
  await page.locator('[data-bar-id]').first().waitFor();
  const openMs = Date.now() - started;

  const dom = await page.evaluate(() => ({
    rows: document.querySelectorAll('[role=treegrid] [role=row][data-task-id]').length,
    bars: document.querySelectorAll('[data-bar-id]').length,
    connectors: document.querySelectorAll('[data-link-id]').length,
    elements: document.querySelectorAll('*').length,
  }));

  // 2. Edit the first task's duration: time until the cell shows the recomputed value.
  const firstTask = page.locator('[role=row]', { hasText: 'Tarefa 1.1' }).first();
  const durationCell = firstTask.getByRole('gridcell').nth(2);
  await durationCell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('9');
  const editStarted = await page.evaluate(() => performance.now());
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (taskName) =>
      [...document.querySelectorAll('[role=row]')]
        .find((row) => row.textContent.includes(taskName))
        ?.querySelectorAll('[role=gridcell]')[2]
        ?.textContent.includes('9 dias'),
    'Tarefa 1.1',
  );
  const editMs = (await page.evaluate(() => performance.now())) - editStarted;

  // Baseline: frame interval with nothing to do, to separate the browser/machine cost.
  const idleFrameMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const step = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (times.length < 40) requestAnimationFrame(step);
          else
            resolve(times.slice(5).reduce((total, value) => total + value, 0) / (times.length - 5));
        };
        requestAnimationFrame(step);
      }),
  );

  // 3. Scroll from top to bottom: frame times at a fast and at a normal speed.
  const scrollAt = (pxPerFrame) =>
    page.evaluate(async (step) => {
      const scroller = document.querySelector('[role=treegrid]').parentElement;
      scroller.scrollTop = 0;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const frames = [];
      let last = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (
            scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 ||
            frames.length > 400
          ) {
            resolve();
            return;
          }
          scroller.scrollTop += step;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      frames.shift();
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        averageMs: frames.reduce((total, value) => total + value, 0) / Math.max(1, frames.length),
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      };
    }, pxPerFrame);
  const scroll = await scrollAt(240);
  const normalScroll = await scrollAt(60);

  // Rows and bars stay aligned at the bottom of the list.
  const alignment = await page.evaluate(() => {
    let worst = 0;
    for (const row of document.querySelectorAll('[role=treegrid] [role=row][data-task-id]')) {
      const bar = document.querySelector(`[data-bar-id="${row.getAttribute('data-task-id')}"]`);
      if (!bar) continue;
      const a = row.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      if (a.bottom < 0 || a.top > innerHeight) continue;
      worst = Math.max(worst, Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)));
    }
    return worst;
  });

  await context.close();
  return { size, openMs, editMs, dom, scroll, normalScroll, alignment, idleFrameMs };
}

const server = await preview({ preview: { port: PORT, strictPort: true, open: false } });
const { browser, channel } = await launchBrowser();
try {
  const results = [];
  for (const size of SIZES) results.push(await measure(browser, size));

  const round = (value) => Math.round(value * 10) / 10;
  console.log(
    `\nBrowser: ${channel} ${browser.version()} · CPU: ${os.cpus()[0]?.model ?? '?'} · ${String(os.cpus().length)} threads · Node ${process.version}\n`,
  );
  console.log(
    '| Tasks | Open (ms) | Edit → rescheduled (ms) | Rows in DOM | Bars in DOM | Connectors | DOM elements | Idle frame (ms) | Frame while scrolling 60 px/frame, avg / p95 (ms) | 240 px/frame, avg / p95 (ms) | Row/bar offset (px) |',
  );
  console.log(
    '| ----: | --------: | ----------------------: | ----------: | ----------: | ---------: | -----------: | --------------: | ------------------------------------------------: | ---------------------------: | ------------------: |',
  );
  for (const r of results) {
    console.log(
      `| ${String(r.size)} | ${String(r.openMs)} | ${String(round(r.editMs))} | ${String(r.dom.rows)} | ${String(r.dom.bars)} | ${String(r.dom.connectors)} | ${String(r.dom.elements)} | ${String(round(r.idleFrameMs))} | ${String(round(r.normalScroll.averageMs))} / ${String(round(r.normalScroll.p95Ms))} | ${String(round(r.scroll.averageMs))} / ${String(round(r.scroll.p95Ms))} | ${String(round(r.alignment))} |`,
    );
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
