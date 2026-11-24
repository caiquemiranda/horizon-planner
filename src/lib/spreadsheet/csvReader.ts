import { SpreadsheetReadError, XLSX_LIMITS } from './xlsxReader';

/**
 * Reads a CSV file into rows of text, for importing.
 * - Encoding: UTF-8 (byte order mark removed); a file that is not valid UTF-8 is read as
 *   Windows-1252, the usual encoding of CSV saved by Excel in Portuguese.
 * - Delimiter: `;`, `,` or tab, whichever splits the header line into the most columns
 *   (quoted text ignored).
 * - Quotes, doubled quotes and line breaks inside quotes follow RFC 4180.
 * - A leading apostrophe added to protect a formula-looking value (as the export does) is
 *   removed, so values come back as they were; nothing is evaluated.
 */

export interface ReadCsv {
  rows: string[][];
  delimiter: ';' | ',' | '\t';
  encoding: 'utf-8' | 'windows-1252';
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: ReadCsv['encoding'] } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Drop a byte order mark (U+FEFF) at the start.
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

function detectDelimiter(text: string): ReadCsv['delimiter'] {
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"[^"]*"/g, '');
  const candidates: ReadCsv['delimiter'][] = [';', ',', '\t'];
  let best: ReadCsv['delimiter'] = ';';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter: ReadCsv['delimiter']): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > XLSX_LIMITS.rows + 1) {
        throw new SpreadsheetReadError(
          'too-many-rows',
          `O arquivo tem mais de ${String(XLSX_LIMITS.rows)} linhas.`,
        );
      }
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => cells.map((cell) => (/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell)));
}

export function readCsv(bytes: Uint8Array): ReadCsv {
  if (bytes.length > XLSX_LIMITS.fileBytes) {
    throw new SpreadsheetReadError('too-large', 'Arquivo maior que 5 MB.');
  }
  const { text, encoding } = decodeText(bytes);
  const delimiter = detectDelimiter(text);
  return { rows: parseCsv(text, delimiter), delimiter, encoding };
}
