import { strFromU8, unzipSync } from 'fflate';

import type { ISODate } from '@/types/project';

/**
 * Reads the cells of an .xlsx workbook, for importing. Untrusted input, so:
 * - the file must be a zip (magic bytes), not an encrypted or legacy .xls container;
 * - workbooks with macros (`vbaProject.bin`) are refused, nothing is ever executed;
 * - only the parts that hold cells are inflated, each checked against a size limit
 *   before inflating (zip bombs), and the number of rows is capped;
 * - XML is parsed with the browser's `DOMParser`, which does not fetch external entities;
 *   documents declaring a DOCTYPE are refused anyway;
 * - formulas are not evaluated: the cached value Excel stored is used, and counted.
 */

export const XLSX_LIMITS = {
  /** File size. */
  fileBytes: 5 * 1024 * 1024,
  /** Uncompressed size of one part. */
  partBytes: 20 * 1024 * 1024,
  /** Uncompressed size of every part read. */
  totalBytes: 60 * 1024 * 1024,
  /** Rows per sheet. */
  rows: 5000,
  /** Columns per row. */
  columns: 100,
} as const;

export type SpreadsheetLimits = Record<keyof typeof XLSX_LIMITS, number>;

export type ReadValue = string | number | boolean | { date: ISODate } | null;

export interface ReadSheet {
  name: string;
  /** Rows by position (row 1 first); missing cells are `null`. */
  rows: ReadValue[][];
}

export interface ReadWorkbook {
  sheets: ReadSheet[];
  /** Cells holding a formula, read as their stored value. */
  formulaCells: number;
}

export type SpreadsheetErrorCode =
  'too-large' | 'not-xlsx' | 'encrypted-or-legacy' | 'macros' | 'corrupted' | 'too-many-rows';

/** A file that cannot be read; the message is in pt-BR, ready for the user. */
export class SpreadsheetReadError extends Error {
  override readonly name = 'SpreadsheetReadError';
  constructor(
    readonly code: SpreadsheetErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((byte, index) => bytes[index] === byte);

/** Built-in number formats that display dates. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function parseXml(text: string): Document {
  if (/<!DOCTYPE/i.test(text)) {
    throw new SpreadsheetReadError('corrupted', 'A planilha contém declarações não permitidas.');
  }
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new SpreadsheetReadError('corrupted', 'A planilha está corrompida.');
  }
  return document;
}

/** Elements by local name, whatever the namespace prefix. */
function elements(parent: Document | Element, name: string): Element[] {
  return [...parent.getElementsByTagNameNS('*', name)];
}

function fromExcelSerial(serial: number): ISODate {
  const millis = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(millis).toISOString().slice(0, 10) as ISODate;
}

/** "BC12" → { column: 54, row: 11 } (0-based). */
export function parseReference(reference: string): { column: number; row: number } | null {
  const match = /^([A-Z]{1,3})(\d{1,7})$/.exec(reference);
  if (!match?.[1] || !match[2]) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) - 1 };
}

function dateStyles(styles: Document | null): Set<number> {
  const result = new Set<number>();
  if (!styles) return result;
  const custom = new Map<number, string>();
  for (const format of elements(styles, 'numFmt')) {
    custom.set(Number(format.getAttribute('numFmtId')), format.getAttribute('formatCode') ?? '');
  }
  const cellXfs = elements(styles, 'cellXfs')[0];
  if (!cellXfs) return result;
  elements(cellXfs, 'xf').forEach((xf, index) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '').toLowerCase();
    if (BUILTIN_DATE_FORMATS.has(id) || (/[dy]/.test(code) && !/^general$/.test(code))) {
      result.add(index);
    }
  });
  return result;
}

export function readXlsx(bytes: Uint8Array, limits: SpreadsheetLimits = XLSX_LIMITS): ReadWorkbook {
  if (bytes.length > limits.fileBytes) {
    throw new SpreadsheetReadError('too-large', 'Arquivo maior que 5 MB.');
  }
  if (startsWith(bytes, OLE_MAGIC)) {
    throw new SpreadsheetReadError(
      'encrypted-or-legacy',
      'Arquivo protegido por senha ou no formato antigo .xls. Salve como .xlsx sem senha.',
    );
  }
  if (!startsWith(bytes, ZIP_MAGIC)) {
    throw new SpreadsheetReadError('not-xlsx', 'O arquivo não é uma planilha .xlsx válida.');
  }

  let total = 0;
  const found = { macros: false };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (/vbaProject\.bin$/i.test(file.name)) found.macros = true;
        const wanted =
          file.name === 'xl/workbook.xml' ||
          file.name === 'xl/_rels/workbook.xml.rels' ||
          file.name === 'xl/sharedStrings.xml' ||
          file.name === 'xl/styles.xml' ||
          /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name);
        if (!wanted) return false;
        total += file.originalSize;
        if (file.originalSize > limits.partBytes || total > limits.totalBytes) {
          throw new SpreadsheetReadError('too-large', 'O conteúdo da planilha é grande demais.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof SpreadsheetReadError) throw error;
    throw new SpreadsheetReadError('corrupted', 'A planilha está corrompida.');
  }
  if (found.macros) {
    throw new SpreadsheetReadError(
      'macros',
      'Planilhas com macros não são aceitas. Salve como .xlsx (sem macros).',
    );
  }

  const text = (name: string) => {
    const file = files[name];
    return file ? strFromU8(file) : null;
  };
  const workbookXml = text('xl/workbook.xml');
  const relsXml = text('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) {
    throw new SpreadsheetReadError('not-xlsx', 'O arquivo não é uma planilha .xlsx válida.');
  }

  const sharedXml = text('xl/sharedStrings.xml');
  const shared = sharedXml
    ? elements(parseXml(sharedXml), 'si').map((item) =>
        elements(item, 't')
          .map((node) => node.textContent)
          .join(''),
      )
    : [];
  const stylesXml = text('xl/styles.xml');
  const dates = dateStyles(stylesXml ? parseXml(stylesXml) : null);

  const targets = new Map<string, string>();
  for (const rel of elements(parseXml(relsXml), 'Relationship')) {
    targets.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }

  let formulaCells = 0;
  const sheets: ReadSheet[] = [];
  for (const sheet of elements(parseXml(workbookXml), 'sheet')) {
    const relId =
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      ) ?? sheet.getAttribute('r:id');
    const target = targets.get(relId ?? '')?.replace(/^\/?(xl\/)?/, '');
    const xml = target ? text(`xl/${target}`) : null;
    if (!xml) continue;
    const rows: ReadValue[][] = [];
    for (const rowElement of elements(parseXml(xml), 'row')) {
      for (const cell of elements(rowElement, 'c')) {
        const position = parseReference(cell.getAttribute('r') ?? '');
        if (!position || position.column >= limits.columns) continue;
        if (position.row >= limits.rows + 1) {
          throw new SpreadsheetReadError(
            'too-many-rows',
            `A planilha tem mais de ${String(limits.rows)} linhas.`,
          );
        }
        if (elements(cell, 'f').length > 0) formulaCells += 1;
        const type = cell.getAttribute('t');
        const raw = elements(cell, 'v')[0]?.textContent ?? null;
        let value: ReadValue = null;
        if (type === 'inlineStr') {
          value = elements(cell, 't')
            .map((node) => node.textContent)
            .join('');
        } else if (type === 's') {
          value = raw === null ? null : (shared[Number(raw)] ?? null);
        } else if (type === 'str') {
          value = raw;
        } else if (type === 'b') {
          value = raw === '1';
        } else if (type === 'e') {
          value = null;
        } else if (raw !== null && raw !== '') {
          const number = Number(raw);
          value = Number.isFinite(number)
            ? dates.has(Number(cell.getAttribute('s') ?? -1))
              ? { date: fromExcelSerial(number) }
              : number
            : null;
        }
        const row = (rows[position.row] ??= []);
        row[position.column] = value;
      }
    }
    sheets.push({
      name: sheet.getAttribute('name') ?? `Planilha ${String(sheets.length + 1)}`,
      // Rows and cells may be missing (sparse): fill the gaps with null.
      rows: Array.from({ length: rows.length }, (_, index) => {
        const row: ReadValue[] | undefined = rows[index];
        return Array.from({ length: row?.length ?? 0 }, (__, column) => row?.[column] ?? null);
      }),
    });
  }
  return { sheets, formulaCells };
}
