import { strToU8, zipSync } from 'fflate';

import { type Cell, isDateCell, type Sheet, toExcelSerial } from './cells';

/**
 * Minimal Office Open XML (.xlsx) writer: one workbook with text, numbers, booleans and
 * dates, a bold frozen header row and column widths. Text cells are inline strings, so a
 * value such as `=HYPERLINK(...)` stays text and is never evaluated as a formula.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Characters XML 1.0 cannot carry (control characters except tab, line feed, return). */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  let value = index + 1;
  while (value > 0) {
    const rest = (value - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/** Style indexes in `styles.xml`. */
const STYLE = { normal: 0, date: 1, header: 2 } as const;

function cellXml(cell: Cell, reference: string, header: boolean): string {
  if (cell === null || cell === '') return '';
  const style = header ? ` s="${String(STYLE.header)}"` : '';
  if (isDateCell(cell)) {
    return `<c r="${reference}" s="${String(STYLE.date)}"><v>${String(toExcelSerial(cell.date))}</v></c>`;
  }
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? `<c r="${reference}"${style}><v>${String(cell)}</v></c>` : '';
  }
  if (typeof cell === 'boolean') {
    return `<c r="${reference}" t="b"${style}><v>${cell ? '1' : '0'}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map(
          (width, index) =>
            `<col min="${String(index + 1)}" max="${String(index + 1)}" width="${String(width)}" customWidth="1"/>`,
        )
        .join('')}</cols>`
    : '';
  const frozen = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const header = sheet.header === true && rowIndex === 0;
      const cells = row
        .map((cell, columnIndex) =>
          cellXml(cell, `${columnName(columnIndex)}${String(rowIndex + 1)}`, header),
        )
        .join('');
      return `<row r="${String(rowIndex + 1)}">${cells}</row>`;
    })
    .join('');
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Sheet names: at most 31 characters, none of `[]:*?/\`, unique. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Planilha';
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${String(counter)})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function writeXlsx(sheets: readonly Sheet[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((sheet) => sheetName(sheet.name, used));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${String(index + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map(
          (name, index) =>
            `<sheet name="${escapeXml(name)}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
        )
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
        .map(
          (_, index) =>
            `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${String(names.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${String(index + 1)}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}
