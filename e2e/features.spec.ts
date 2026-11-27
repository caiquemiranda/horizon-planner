import { readFile } from 'node:fs/promises';

import { type Download, expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

import { buildTemplateWorkbook, SHEETS } from '@/features/data-io/lib/wbsWorkbook';
import type { Cell, Sheet } from '@/lib/spreadsheet/cells';
import { writeXlsx } from '@/lib/spreadsheet/xlsxWriter';
import type { ISODate } from '@/types/project';

import { openSamplePortfolio, openSampleSchedule } from './helpers';

/**
 * Cross-feature scenarios of the reports, spreadsheets, samples and explorer extension
 * (spec §15.1): each one goes through several features in the real browser, on the
 * production build, the way a person would chain them.
 */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PROJECT_TITLE = 'Obra do galpão B';
/** Text a spreadsheet would run as a formula: it must stay plain text everywhere. */
const FORMULA_NAME = '=HYPERLINK("http://exemplo.invalid","clique")';

async function download(page: Page, action: () => Promise<void>): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  return file;
}

async function readDownload(file: Download): Promise<Buffer> {
  return readFile(await file.path());
}

function sheetOf(workbook: readonly Sheet[], name: string): Sheet {
  const sheet = workbook.find((item) => item.name === name);
  if (!sheet) throw new Error(`missing sheet ${name}`);
  return sheet;
}

/** A row in the order of the sheet's header, from named values. */
function rowFor(header: readonly unknown[], values: Record<string, Cell>): Cell[] {
  return header.map((key) => values[String(key)] ?? null);
}

/** The worksheets' XML of an .xlsx file (it is a zip). */
function worksheetXml(bytes: Uint8Array): string[] {
  return Object.entries(unzipSync(bytes))
    .filter(([path]) => path.startsWith('xl/worksheets/'))
    .map(([, content]) => strFromU8(content));
}

/**
 * The template (the same workbook "Baixar modelo de EAP" downloads) filled as a person would: 3 levels (2 phases, 4 sub-phases,
 * 20 tasks) and a final milestone, a chain of finish-to-start links, and one task named
 * like a formula.
 */
function fillTemplate(template: readonly Sheet[]): Uint8Array {
  const tasks = sheetOf(template, SHEETS.tasks);
  const links = sheetOf(template, SHEETS.links);
  const taskHeader = tasks.rows[0] ?? [];
  const linkHeader = links.rows[0] ?? [];
  const start = { date: '2027-03-01' as ISODate };

  const taskRows: Cell[][] = [];
  const linkRows: Cell[][] = [];
  let previous: string | null = null;
  const phases = [
    { code: 'FUN', name: 'Fundações', parts: ['Escavação', 'Concreto'] },
    { code: 'EST', name: 'Estrutura', parts: ['Pilares', 'Cobertura'] },
  ];
  for (const [p, phase] of phases.entries()) {
    taskRows.push(
      rowFor(taskHeader, {
        codigo_externo: phase.code,
        ordem: p + 1,
        nome: phase.name,
        tipo: 'Resumo',
      }),
    );
    for (const [s, part] of phase.parts.entries()) {
      const partCode = `${phase.code}${String(s + 1)}`;
      taskRows.push(
        rowFor(taskHeader, {
          codigo_externo: partCode,
          codigo_pai: phase.code,
          ordem: s + 1,
          nome: part,
          tipo: 'Resumo',
        }),
      );
      for (let t = 1; t <= 5; t += 1) {
        const code = `${partCode}-${String(t)}`;
        taskRows.push(
          rowFor(taskHeader, {
            codigo_externo: code,
            codigo_pai: partCode,
            ordem: t,
            nome: code === 'FUN1-2' ? FORMULA_NAME : `${part} etapa ${String(t)}`,
            tipo: 'Tarefa',
            duracao_dias_uteis: 2,
            inicio_planejado: start,
            responsavel: 'Equipe de obra',
          }),
        );
        if (previous)
          linkRows.push(rowFor(linkHeader, { predecessora: previous, sucessora: code }));
        previous = code;
      }
    }
  }
  taskRows.push(
    rowFor(taskHeader, {
      codigo_externo: 'ENT',
      ordem: 3,
      nome: 'Entrega da obra',
      tipo: 'Marco',
      duracao_dias_uteis: 0,
      inicio_planejado: start,
    }),
  );
  linkRows.push(rowFor(linkHeader, { predecessora: previous, sucessora: 'ENT' }));

  const sheets: Sheet[] = template.map((sheet) => {
    if (sheet.name === SHEETS.project) {
      return {
        ...sheet,
        rows: sheet.rows.map((row) => (row[0] === 'nome' ? ['nome', PROJECT_TITLE] : row)),
      };
    }
    if (sheet.name === SHEETS.tasks) return { ...sheet, rows: [taskHeader, ...taskRows] };
    if (sheet.name === SHEETS.links) return { ...sheet, rows: [linkHeader, ...linkRows] };
    return sheet;
  });
  return writeXlsx(sheets);
}

/** Opens a project through the explorer's search, as from anywhere in the app. */
async function openFromSearch(page: Page, title: string) {
  const search = page.getByRole('searchbox', { name: 'Buscar projeto' });
  await search.fill(title);
  await page
    .getByRole('list', { name: 'Resultados da busca' })
    .getByRole('link', { name: title })
    .click();
}

function wbs(page: Page) {
  return page.getByRole('region', { name: 'Estrutura analítica (EAP)' });
}

function indicator(page: Page, label: string) {
  return page
    .getByRole('region', { name: 'Indicadores' })
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd[1]');
}

test.describe('cross-feature scenarios', () => {
  test('scenario H: a WBS from the template goes through import, workspace, export, report and print', async ({
    page,
  }) => {
    // 1. The template downloads; it is filled in outside the app.
    await page.goto('./#/importar');
    const template = await download(page, () =>
      page.getByRole('button', { name: 'Baixar modelo de EAP' }).click(),
    );
    expect(template.suggestedFilename()).toMatch(/^horizon-eap-modelo-.+\.xlsx$/);
    const sheetsInTemplate = worksheetXml(await readDownload(template));
    expect(sheetsInTemplate).toHaveLength(buildTemplateWorkbook().length);
    const filled = fillTemplate(buildTemplateWorkbook());

    // 2. Upload and preview: nothing is saved yet.
    await page.getByLabel('Arquivo da planilha').setInputFiles({
      name: 'obra-galpao-b.xlsx',
      mimeType: XLSX_TYPE,
      buffer: Buffer.from(filled),
    });
    const summary = page.getByRole('region', { name: 'Resumo da importação' });
    await expect(summary).toContainText(`Projeto “${PROJECT_TITLE}”`);
    await expect(summary).toContainText('6 fase(s), 20 tarefa(s), 1 marco(s) e 20 vínculo(s)');
    await expect(summary.getByText('Pronto para importar.')).toBeVisible();

    // 3. Confirm, then open the new project.
    await summary.getByRole('button', { name: 'Importar projeto' }).click();
    const outcome = page.getByRole('region', { name: 'Resultado da importação' });
    await expect(outcome.getByRole('status')).toContainText(
      'Foram criados 6 fase(s), 20 tarefa(s), 1 marco(s) e 20 vínculo(s)',
    );
    await outcome.getByRole('link', { name: 'Abrir página do projeto' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROJECT_TITLE);
    const grid = page.getByRole('treegrid');
    await expect(grid).toBeVisible();
    await expect(grid.getByText(FORMULA_NAME, { exact: true })).toBeVisible();

    // 4. Collapse a phase: exports and the report still carry every task.
    await page
      .getByRole('row')
      .filter({ hasText: 'Fundações' })
      .first()
      .getByRole('button')
      .first()
      .click();
    await expect(grid.getByText('Escavação', { exact: true })).toBeHidden();

    const exportAs = async (format: RegExp) =>
      download(page, async () => {
        await page.getByRole('button', { name: /Exportar/ }).click();
        await page.getByRole('menuitem', { name: format }).click();
      });
    const excel = await readDownload(await exportAs(/^Excel/));
    // Formula-like names are stored as text: no cell of the workbook holds a formula.
    expect(worksheetXml(excel).some((xml) => xml.includes('<f>'))).toBe(false);

    const csv = (await readDownload(await exportAs(/^CSV/))).toString('utf8');
    // The CSV escapes formula-like text so a spreadsheet shows it instead of running it.
    expect(csv).toContain(`"'${FORMULA_NAME.replace(/"/g, '""')}"`);
    expect(csv.trim().split('\r\n')).toHaveLength(28);

    // 5. The progress report has the whole WBS, and prints.
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROJECT_TITLE);
    await expect(page.getByText('Relatório de andamento', { exact: true })).toBeVisible();
    await expect(wbs(page).getByRole('row')).toHaveCount(28);
    await expect(wbs(page).getByText('Escavação', { exact: true })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Imprimir / Salvar em PDF' })).toBeHidden();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await page.emulateMedia({ media: 'screen' });

    // 6. The exported workbook reads back whole: every task and link, the name as text.
    await page.goto('./#/importar');
    await page.getByLabel('Arquivo da planilha').setInputFiles({
      name: 'exportado.xlsx',
      mimeType: XLSX_TYPE,
      buffer: excel,
    });
    const again = page.getByRole('region', { name: 'Resumo da importação' });
    await expect(again).toContainText('6 fase(s), 20 tarefa(s), 1 marco(s) e 20 vínculo(s)');
    await expect(
      page.getByRole('region', { name: 'Estrutura' }).getByText(FORMULA_NAME, { exact: true }),
    ).toBeVisible();
  });

  test('scenario I: a closed sample reports as final, and its copy starts with no history', async ({
    page,
  }) => {
    await page.goto('./#/exemplos');
    await page.getByRole('button', { name: 'Explorar exemplos' }).click();
    const samples = page.getByRole('list', { name: 'Projetos de exemplo', exact: true });
    await expect(samples.getByRole('listitem')).toHaveCount(3);

    // The finished retrofit: final report, real dates, nothing late; it exports too.
    await samples.getByRole('link', { name: 'Retrofit da iluminação do galpão' }).click();
    await expect(page.getByRole('treegrid')).toBeVisible();
    const sampleExport = await download(page, async () => {
      await page.getByRole('button', { name: /Exportar/ }).click();
      await page.getByRole('menuitem', { name: /^Excel/ }).click();
    });
    expect(sampleExport.suggestedFilename()).toMatch(/\.xlsx$/);
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByText('Relatório final', { exact: true })).toBeVisible();
    await expect(indicator(page, 'Término real')).not.toHaveText('—');
    await expect(indicator(page, 'Previsão de término')).toHaveText('—');
    await expect(wbs(page).getByText('Atrasada', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Encerramento' })).toBeVisible();

    // A copy of the industrial sample is a new plan: no progress, no check-ins, no finish.
    await page.goto('./#/exemplos');
    await page
      .getByRole('button', {
        name: 'Criar projeto a partir de “Implantação de SDAI na planta fabril”',
      })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título do novo projeto').fill('SDAI planta 3');
    await dialog.getByRole('button', { name: 'Criar projeto' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SDAI planta 3');
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByText('Relatório de andamento', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Sumário executivo' })).toContainText(
      /0 de \d+ tarefas concluídas \(0%\)/,
    );
    await expect(indicator(page, 'Término real')).toHaveText('—');
    await expect(page.getByText(/Confirmações diárias/)).toHaveCount(0);
    await expect(page.getByText('Exemplo com dados fictícios')).toHaveCount(0);
  });

  test('scenario J: switching projects in the explorer never shows the previous one', async ({
    page,
  }) => {
    await openSampleSchedule(page);
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(wbs(page).getByText('Levantamento técnico')).toBeVisible();

    // From the report, straight to a project without a schedule, and its report.
    await openFromSearch(page, 'Reforma da cozinha');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reforma da cozinha');
    await expect(page.getByText('Levantamento técnico')).toHaveCount(0);
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reforma da cozinha');
    await expect(page.getByText(/ainda não tem cronograma/)).toBeVisible();
    await expect(page.getByText('Levantamento técnico')).toHaveCount(0);

    // Quick hops, without waiting for each page: only the last project is on screen.
    for (const title of ['Certificação AWS', 'Mestrado', 'Corrida de 10 km']) {
      await openFromSearch(page, title);
    }
    await openFromSearch(page, 'Implantação de Sistema Industrial');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Implantação de Sistema Industrial',
    );
    // Exactly its own plan (14 tasks and the header row), nothing left from the others.
    const grid = page.getByRole('treegrid');
    await expect(grid.getByText('Levantamento técnico')).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(15);
  });

  test('scenario K: a hidden project keeps its page and report', async ({ page }) => {
    const title = 'Reforma da cozinha';
    await openSamplePortfolio(page);
    await page
      .getByRole('region', { name: 'Linha do tempo' })
      .getByRole('button', { name: title })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ocultar' }).click();
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toHaveCount(0);

    await page.goto('./#/ocultos');
    await expect(page.getByRole('list', { name: 'Projetos ocultos' })).toContainText(title);
    await openFromSearch(page, title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('region', { name: 'Indicadores' })).toBeVisible();
  });

  test('scenario L: broken or oversized files fail safely and save nothing', async ({ page }) => {
    await page.goto('./#/importar');
    const input = page.getByLabel('Arquivo da planilha');

    await input.setInputFiles({
      name: 'quebrado.xlsx',
      mimeType: XLSX_TYPE,
      buffer: Buffer.from('PK\u0003\u0004 isto não é uma planilha', 'latin1'),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Resumo da importação' })).toHaveCount(0);

    await input.setInputFiles({
      name: 'enorme.csv',
      mimeType: 'text/csv',
      buffer: Buffer.alloc(6 * 1024 * 1024, 'a;'),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Resumo da importação' })).toHaveCount(0);

    await page.goto('./#/');
    const all = page
      .getByRole('navigation', { name: 'Seções' })
      .getByRole('link', { name: /^Todos os projetos/ });
    await expect(all).toHaveAttribute('aria-label', /, 0 projetos$/);
  });
});
