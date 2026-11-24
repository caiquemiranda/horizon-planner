import type { ISODate } from '@/types/project';

/**
 * A cell of a generated spreadsheet. Text is always written as text (never as a formula),
 * numbers as numbers and dates as real dates, so the file opens with the right types.
 */
export type Cell = string | number | boolean | null | { date: ISODate };

export interface Sheet {
  name: string;
  /** First row is the header (bold, frozen) when `header` is true. */
  rows: Cell[][];
  header?: boolean;
  /** Column widths in characters. */
  widths?: number[];
}

export function isDateCell(cell: Cell): cell is { date: ISODate } {
  return typeof cell === 'object' && cell !== null && 'date' in cell;
}

/** Excel serial day number (days since 1899-12-30) of a date-only value. */
export function toExcelSerial(date: ISODate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}
