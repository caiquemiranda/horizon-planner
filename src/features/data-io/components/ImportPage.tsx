import {
  ChartGantt,
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  FileUp,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { type ReactNode, useId, useMemo, useRef, useState } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  NavigationDrawerButton,
  NavigationRail,
} from '@/features/projects/components/NavigationSidebar';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import { buildTreeIndex, getTasksInWbsOrder, getWbsNumbers } from '@/features/schedule/lib/tree';
import { formatDate } from '@/features/timeline/lib/format';
import { dayToIsoDate, getTodayIsoDate } from '@/features/timeline/lib/time';
import { createId } from '@/lib/id';
import { projectHref } from '@/lib/router';
import { cn } from '@/lib/utils';

import { downloadTemplate } from '../lib/spreadsheetDownloads';
import { getImportFingerprint, type ImportCommitResult } from '../lib/wbsCommit';
import {
  buildImportPreview,
  type ColumnMapping,
  FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type ImportPreview,
  type ImportSource,
} from '../lib/wbsImport';
import { importCommitter } from '../store/importCommitter';

/** Rows of the WBS shown in the preview; the counts always cover everything. */
const PREVIEW_ROWS = 200;

const KIND_LABEL = { summary: 'Resumo', task: 'Tarefa', milestone: 'Marco' } as const;

/** `FileReader` rather than `Blob.arrayBuffer()`, which older engines (and jsdom) lack. */
function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('read failed'));
    };
    reader.readAsArrayBuffer(file);
  });
}

interface ReadFile {
  source: ImportSource;
  /** Kept for the idempotency fingerprint. */
  bytes: Uint8Array;
}

async function readSource(file: File): Promise<ReadFile> {
  const bytes = await readBytes(file);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(file.name)) {
    const { readXlsx } = await import('@/lib/spreadsheet/xlsxReader');
    return { source: { kind: 'xlsx', workbook: readXlsx(bytes), fileName: file.name }, bytes };
  }
  const { readCsv } = await import('@/lib/spreadsheet/csvReader');
  return { source: { kind: 'csv', rows: readCsv(bytes).rows, fileName: file.name }, bytes };
}

/**
 * Spreadsheet import: read the file, match its columns and preview the project it
 * describes with every problem found. Nothing is saved until "Importar projeto".
 */
export function ImportPage() {
  const [file, setFile] = useState<ReadFile | null>(null);
  const source = file?.source ?? null;
  const [readError, setReadError] = useState<string | null>(null);
  const [tasksSheet, setTasksSheet] = useState<string | undefined>(undefined);
  const [mapping, setMapping] = useState<ColumnMapping | undefined>(undefined);
  const [isCommitting, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = getTodayIsoDate();

  const preview = useMemo(
    () =>
      source
        ? buildImportPreview(source, { tasksSheet, mapping, today, generateId: createId })
        : null,
    [source, tasksSheet, mapping, today],
  );

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setReadError(null);
    setFile(null);
    setTasksSheet(undefined);
    setMapping(undefined);
    setCommitResult(null);
    setCommitError(null);
    try {
      setFile(await readSource(chosen));
    } catch (error) {
      setReadError(
        error instanceof Error && error.name === 'SpreadsheetReadError'
          ? error.message
          : 'Não foi possível ler o arquivo.',
      );
    }
  };

  const commit = async () => {
    if (!file || !preview || isCommitting) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const fingerprint = getImportFingerprint(file.bytes, preview.tasksSheet, preview.mapping);
      setCommitResult(await importCommitter.commit(preview, fingerprint, today));
    } catch (error) {
      setCommitError(
        error instanceof Error && error.name === 'ImportCommitError'
          ? error.message
          : 'Não foi possível importar o projeto. Nada foi criado.',
      );
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader leading={<NavigationDrawerButton current={null} />} actions={<ThemeToggle />} />
      <div className="flex min-h-0 flex-1">
        <NavigationRail current={null} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface-sunken">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Importar projeto de planilha</h2>
              <p className="text-sm text-muted-foreground">
                Excel (.xlsx) ou CSV, até 5 MB e 5 000 linhas. Fórmulas e macros nunca são
                executadas. Nada é gravado até você confirmar a importação.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  inputRef.current?.click();
                }}
              >
                <Upload />
                Escolher arquivo
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void downloadTemplate();
                }}
              >
                <FileSpreadsheet />
                Baixar modelo de EAP
              </Button>
              {source ? (
                <span className="text-sm text-muted-foreground">{source.fileName}</span>
              ) : null}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                aria-label="Arquivo da planilha"
                className="hidden"
                onChange={(event) => {
                  void choose(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>

            {readError ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />
                {readError}
              </p>
            ) : null}

            {commitResult ? (
              <CommitOutcome
                result={commitResult}
                warnings={
                  preview?.issues.filter((issue) => issue.severity === 'warning').length ?? 0
                }
              />
            ) : preview ? (
              <Preview
                preview={preview}
                onSheet={(sheet) => {
                  setTasksSheet(sheet);
                  setMapping(undefined);
                }}
                onMapping={setMapping}
                commit={
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      disabled={!preview.canImport || isCommitting}
                      onClick={() => {
                        void commit();
                      }}
                    >
                      <FileUp />
                      {isCommitting ? 'Importando…' : 'Importar projeto'}
                    </Button>
                    {commitError ? (
                      <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                        <CircleAlert aria-hidden="true" className="size-4" />
                        {commitError}
                      </p>
                    ) : null}
                  </div>
                }
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

/** What the import created, or the project a repeated import points to. */
function CommitOutcome({ result, warnings }: { result: ImportCommitResult; warnings: number }) {
  const expand = useDrawerStore((state) => state.expand);
  const projectId = result.status === 'created' ? result.project.id : result.projectId;
  const counts =
    result.status === 'created'
      ? `Foram criados ${String(result.counts.summaries)} fase(s), ${String(result.counts.tasks)} tarefa(s), ${String(result.counts.milestones)} marco(s) e ${String(result.counts.links)} vínculo(s)`
      : '';
  return (
    <section
      aria-label="Resultado da importação"
      className="flex flex-col gap-3 rounded-lg border bg-background p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CircleCheck aria-hidden="true" className="size-4 text-green-700 dark:text-green-400" />
        {result.status === 'created'
          ? `Projeto “${result.project.title}” importado`
          : 'Este arquivo já foi importado'}
      </h3>
      <p role="status" className="text-sm">
        {result.status === 'created'
          ? `${counts}${warnings > 0 ? `, com ${String(warnings)} aviso(s) mostrados na prévia` : ''}.`
          : 'Nada foi gravado de novo: o projeto criado antes continua como estava.'}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            expand(projectId);
          }}
        >
          <ChartGantt />
          Abrir cronograma
        </Button>
        <a href={projectHref(projectId)} className="text-sm underline underline-offset-4">
          Abrir página do projeto
        </a>
      </div>
    </section>
  );
}

function Preview({
  preview,
  onSheet,
  onMapping,
  commit,
}: {
  preview: ImportPreview;
  onSheet: (sheet: string) => void;
  onMapping: (mapping: ColumnMapping) => void;
  /** The confirmation controls, under the summary. */
  commit: ReactNode;
}) {
  const sheetId = useId();
  const errors = preview.issues.filter((issue) => issue.severity === 'error');
  const warnings = preview.issues.filter((issue) => issue.severity === 'warning');
  const index = useMemo(() => buildTreeIndex(preview.schedule.tasks), [preview.schedule.tasks]);
  const wbs = useMemo(() => getWbsNumbers(index), [index]);
  const ordered = useMemo(() => getTasksInWbsOrder(index), [index]);
  const range = preview.result.range;
  // The last working day of any task (a final milestone ends on its own day).
  const lastDay = useMemo(() => {
    let last: number | null = null;
    for (const task of preview.result.tasks.values()) {
      const day = getDisplayFinish(task);
      if (last === null || day > last) last = day;
    }
    return last;
  }, [preview.result.tasks]);

  return (
    <>
      <section
        aria-label="Colunas"
        className="flex flex-col gap-3 rounded-lg border bg-background p-4"
      >
        <h3 className="text-sm font-semibold">Colunas</h3>
        {preview.sheets.length > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={sheetId} className="text-muted-foreground">
              Aba das tarefas
            </label>
            <select
              id={sheetId}
              value={preview.tasksSheet ?? ''}
              onChange={(event) => {
                onSheet(event.target.value);
              }}
              className="h-8 rounded-md border bg-background px-2"
            >
              {preview.sheets.map((sheet) => (
                <option key={sheet} value={sheet}>
                  {sheet}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {IMPORT_FIELDS.map((field) => (
            <FieldSelect
              key={field}
              field={field}
              header={preview.header}
              value={preview.mapping[field]}
              onChange={(value) => {
                // Rebuilt without the field, then with its new column if any.
                const next: ColumnMapping = Object.fromEntries(
                  Object.entries(preview.mapping).filter(([key]) => key !== field),
                );
                if (value !== undefined) next[field] = value;
                onMapping(next);
              }}
            />
          ))}
        </div>
      </section>

      <section
        aria-label="Resumo da importação"
        className="flex flex-col gap-2 rounded-lg border bg-background p-4"
      >
        <h3 className="text-sm font-semibold">Projeto “{preview.project.title}”</h3>
        <p className="text-sm">
          Será criado 1 projeto com {preview.counts.summaries} fase(s), {preview.counts.tasks}{' '}
          tarefa(s), {preview.counts.milestones} marco(s) e {preview.counts.links} vínculo(s)
          {range && lastDay !== null
            ? `, de ${formatDate(dayToIsoDate(range.start))} a ${formatDate(dayToIsoDate(lastDay))}`
            : ''}
          .
        </p>
        <p
          className={cn(
            'text-sm font-medium',
            preview.canImport ? 'text-green-700 dark:text-green-400' : 'text-destructive',
          )}
        >
          {preview.canImport
            ? 'Pronto para importar.'
            : `${String(errors.length)} erro(s) impedem a importação: corrija a planilha e escolha o arquivo de novo.`}
        </p>
        {commit}
      </section>

      {preview.issues.length > 0 ? (
        <section
          aria-label="Problemas encontrados"
          className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        >
          <h3 className="text-sm font-semibold">
            Problemas encontrados ({errors.length} erro(s), {warnings.length} aviso(s))
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {preview.issues.map((issue, position) => (
              <li key={position} className="flex items-start gap-2">
                {issue.severity === 'error' ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                ) : (
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  />
                )}
                <span>
                  <span className="sr-only">
                    {issue.severity === 'error' ? 'Erro: ' : 'Aviso: '}
                  </span>
                  {[
                    issue.sheet ? `Aba ${issue.sheet}` : null,
                    issue.row !== null ? `linha ${String(issue.row)}` : null,
                    issue.column,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  {issue.sheet || issue.row !== null || issue.column ? ': ' : ''}
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview.schedule.tasks.length > 0 ? (
        <section
          aria-label="Estrutura"
          className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        >
          <h3 className="text-sm font-semibold">Estrutura (EAP)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">EAP</th>
                  <th className="py-1 pr-3 font-medium">Nome</th>
                  <th className="py-1 pr-3 font-medium">Tipo</th>
                  <th className="py-1 pr-3 text-right font-medium">Duração</th>
                  <th className="py-1 pr-3 font-medium">Início</th>
                  <th className="py-1 font-medium">Término</th>
                </tr>
              </thead>
              <tbody>
                {ordered.slice(0, PREVIEW_ROWS).map((task) => {
                  const scheduled = preview.result.tasks.get(task.id);
                  const depth = (wbs.get(task.id) ?? '').split('.').length - 1;
                  return (
                    <tr key={task.id} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs text-muted-foreground">
                        {wbs.get(task.id)}
                      </td>
                      <td
                        className={cn('py-1 pr-3', scheduled?.kind === 'summary' && 'font-medium')}
                        style={{ paddingLeft: depth * 16 }}
                      >
                        {task.name}
                      </td>
                      <td className="py-1 pr-3">{scheduled ? KIND_LABEL[scheduled.kind] : ''}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {scheduled?.duration ?? ''}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {scheduled ? formatDate(dayToIsoDate(scheduled.start)) : ''}
                      </td>
                      <td className="py-1 tabular-nums">
                        {scheduled ? formatDate(dayToIsoDate(getDisplayFinish(scheduled))) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ordered.length > PREVIEW_ROWS ? (
            <p className="text-xs text-muted-foreground">
              Mostrando {PREVIEW_ROWS} de {ordered.length} linhas; todas serão importadas.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function FieldSelect({
  field,
  header,
  value,
  onChange,
}: {
  field: ImportField;
  header: readonly string[];
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {FIELD_LABELS[field]}
      </label>
      <select
        id={id}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => {
          onChange(event.target.value === '' ? undefined : Number(event.target.value));
        }}
        className="h-8 w-44 rounded-md border bg-background px-2"
      >
        <option value="">(não importar)</option>
        {header.map((name, position) => (
          <option key={position} value={String(position)}>
            {name || `Coluna ${String(position + 1)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
