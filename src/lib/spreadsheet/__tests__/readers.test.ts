import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import { readCsv } from '../csvReader';
import { writeCsv } from '../csvWriter';
import { parseReference, readXlsx, SpreadsheetReadError, XLSX_LIMITS } from '../xlsxReader';
import { writeXlsx } from '../xlsxWriter';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A workbook as Excel writes it: shared strings, a formula, a date style. */
function excelLikeWorkbook(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    'xl/workbook.xml': strToU8(
      `<workbook ${NS} ${REL_NS}><sheets><sheet name="EAP_Tarefas" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(
      `<sst ${NS}><si><t>nome</t></si><si><r><t>Levanta</t></r><r><t>mento</t></r></si></sst>`,
    ),
    'xl/styles.xml': strToU8(
      `<styleSheet ${NS}><numFmts><numFmt numFmtId="200" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="200"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="1"><v>46349</v></c><c r="C2"><f>1+1</f><v>2</v></c><c r="D2" s="2"><v>46350</v></c><c r="E2" t="e"><v>#REF!</v></c></row></sheetData></worksheet>`,
    ),
    ...extra,
  });
}

function errorCode(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    if (error instanceof SpreadsheetReadError) return error.code;
    throw error;
  }
  return 'none';
}

describe('readXlsx', () => {
  it('reads back what the writer writes', () => {
    const bytes = writeXlsx([
      {
        name: 'EAP_Tarefas',
        header: true,
        rows: [
          ['codigo', 'nome', 'inicio', 'duracao', 'marco'],
          ['T1', '=SUM(A1)', { date: '2026-11-23' as ISODate }, 2.5, true],
        ],
      },
      { name: 'Outra', rows: [[null, 'B1']] },
    ]);
    const { sheets, formulaCells } = readXlsx(bytes);
    expect(sheets.map((sheet) => sheet.name)).toEqual(['EAP_Tarefas', 'Outra']);
    expect(sheets[0]?.rows).toEqual([
      ['codigo', 'nome', 'inicio', 'duracao', 'marco'],
      ['T1', '=SUM(A1)', { date: '2026-11-23' }, 2.5, true],
    ]);
    expect(sheets[1]?.rows).toEqual([[null, 'B1']]);
    expect(formulaCells).toBe(0);
  });

  it('reads shared strings, rich text, date styles and stored formula values', () => {
    const { sheets, formulaCells } = readXlsx(excelLikeWorkbook());
    expect(sheets[0]?.rows).toEqual([
      ['nome', null, 'nome'],
      ['Levantamento', { date: '2026-11-23' }, 2, { date: '2026-11-24' }, null],
    ]);
    // Formulas are never evaluated: the stored value is used and counted.
    expect(formulaCells).toBe(1);
  });

  it('refuses macros, encrypted or legacy files and anything that is not xlsx', () => {
    const macros = excelLikeWorkbook({ 'xl/vbaProject.bin': new Uint8Array([1, 2, 3]) });
    expect(errorCode(() => readXlsx(macros))).toBe('macros');
    expect(errorCode(() => readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])))).toBe(
      'encrypted-or-legacy',
    );
    expect(errorCode(() => readXlsx(strToU8('nome;tipo')))).toBe('not-xlsx');
    expect(errorCode(() => readXlsx(zipSync({ 'a.txt': strToU8('x') })))).toBe('not-xlsx');
  });

  it('refuses a part that would inflate beyond the limit (zip bomb)', () => {
    const bomb = excelLikeWorkbook({
      'xl/worksheets/sheet2.xml': new Uint8Array(XLSX_LIMITS.partBytes + 1),
    });
    expect(bomb.length).toBeLessThan(XLSX_LIMITS.fileBytes);
    expect(errorCode(() => readXlsx(bomb))).toBe('too-large');
  });

  it('refuses files larger than 5 MB and sheets with too many rows', () => {
    expect(errorCode(() => readXlsx(new Uint8Array(XLSX_LIMITS.fileBytes + 1)))).toBe('too-large');
    const tall = writeXlsx([
      { name: 'x', rows: Array.from({ length: XLSX_LIMITS.rows + 2 }, () => ['a']) },
    ]);
    expect(errorCode(() => readXlsx(tall))).toBe('too-many-rows');
  });

  it('refuses a DOCTYPE (no external entities)', () => {
    const evil = zipSync({
      'xl/workbook.xml': strToU8(
        `<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><workbook ${NS}><sheets/></workbook>`,
      ),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
    });
    expect(errorCode(() => readXlsx(evil))).toBe('corrupted');
  });

  it('parses cell references', () => {
    expect(parseReference('A1')).toEqual({ column: 0, row: 0 });
    expect(parseReference('AB12')).toEqual({ column: 27, row: 11 });
    expect(parseReference('1A')).toBeNull();
  });
});

describe('readCsv', () => {
  it('reads back what the writer writes, removing the formula protection', () => {
    const text = writeCsv([
      ['nome', 'obs', 'inicio'],
      ['Ação', '=1+1', { date: '2026-11-23' as ISODate }],
      ['a;b', 'diz "oi"\nfim', null],
    ]);
    const { rows, delimiter, encoding } = readCsv(new TextEncoder().encode(text));
    expect({ delimiter, encoding }).toEqual({ delimiter: ';', encoding: 'utf-8' });
    expect(rows).toEqual([
      ['nome', 'obs', 'inicio'],
      ['Ação', '=1+1', '2026-11-23'],
      ['a;b', 'diz "oi"\nfim', ''],
    ]);
  });

  it('detects commas and tabs, skips empty lines and keeps leading zeros', () => {
    expect(readCsv(new TextEncoder().encode('a,b\n007,"x,y"\n\n')).rows).toEqual([
      ['a', 'b'],
      ['007', 'x,y'],
    ]);
    expect(readCsv(new TextEncoder().encode('a\tb\r\n1\t2')).delimiter).toBe('\t');
  });

  it('falls back to Windows-1252 for files that are not UTF-8', () => {
    // "Ação" in Windows-1252.
    const bytes = new Uint8Array([0x41, 0xe7, 0xe3, 0x6f]);
    expect(readCsv(bytes)).toMatchObject({ encoding: 'windows-1252', rows: [['Ação']] });
  });
});
