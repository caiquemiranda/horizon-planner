import { type Cell, isDateCell } from './cells';

/**
 * CSV for spreadsheets in Portuguese: `;` as delimiter (Excel in pt-BR uses `,` for
 * decimals), UTF-8 with a byte order mark so accents open correctly, CRLF line ends.
 *
 * Text that a spreadsheet would read as a formula (starting with `=`, `+`, `-`, `@`, tab
 * or carriage return) gets a leading apostrophe, the usual protection against formula
 * injection. Numbers are written as numbers (with a decimal comma) and are never escaped.
 * Dates are written as `yyyy-mm-dd`, which is unambiguous when read back.
 */

export const CSV_DELIMITER = ';';
export const CSV_BOM = '﻿';

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(cell: Cell): string {
  if (cell === null) return '';
  if (isDateCell(cell)) return cell.date;
  if (typeof cell === 'boolean') return cell ? 'sim' : 'não';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell).replace('.', ',') : '';
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function writeCsv(rows: readonly Cell[][]): string {
  return CSV_BOM + rows.map((row) => row.map(csvField).join(CSV_DELIMITER)).join('\r\n') + '\r\n';
}
