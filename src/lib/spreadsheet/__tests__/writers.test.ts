import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import { toExcelSerial } from '../cells';
import { csvField, writeCsv } from '../csvWriter';
import { columnName, escapeXml, writeXlsx } from '../xlsxWriter';

function parts(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new Error(`missing ${name}`);
    return new DOMParser().parseFromString(strFromU8(file), 'application/xml');
  };
  return { names: Object.keys(files).sort(), read };
}

describe('xlsx writer', () => {
  const bytes = writeXlsx([
    {
      name: 'EAP_Tarefas',
      header: true,
      widths: [12, 30],
      rows: [
        ['codigo', 'nome', 'inicio', 'duracao', 'resumo'],
        ['T1', '=HYPERLINK("x")', { date: '2026-11-23' as ISODate }, 3, true],
        ['T2', 'Ação & <teste> "aspas"', null, 0.5, false],
      ],
    },
    { name: 'Inválido: [nome]/*?', rows: [['x']] },
    { name: 'EAP_Tarefas', rows: [['duplicado']] },
  ]);
  const { names, read } = parts(bytes);

  it('contains the parts of a workbook', () => {
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml',
    ]);
  });

  it('names sheets safely and uniquely', () => {
    const sheets = [...read('xl/workbook.xml').getElementsByTagName('sheet')].map((sheet) =>
      sheet.getAttribute('name'),
    );
    expect(sheets).toEqual(['EAP_Tarefas', 'Inválido   nome    ', 'EAP_Tarefas (2)']);
  });

  it('writes text as text, numbers, booleans and real dates', () => {
    const sheet = read('xl/worksheets/sheet1.xml');
    const cell = (ref: string) =>
      [...sheet.getElementsByTagName('c')].find((item) => item.getAttribute('r') === ref);
    // A formula-looking value is an inline string: never evaluated.
    expect(cell('B2')?.getAttribute('t')).toBe('inlineStr');
    expect(cell('B2')?.textContent).toBe('=HYPERLINK("x")');
    expect(sheet.getElementsByTagName('f')).toHaveLength(0);
    expect(cell('C2')?.getAttribute('s')).toBe('1');
    expect(cell('C2')?.textContent).toBe(String(toExcelSerial('2026-11-23' as ISODate)));
    expect(cell('D3')?.textContent).toBe('0.5');
    expect(cell('E2')).toMatchObject({ textContent: '1' });
    expect(cell('E2')?.getAttribute('t')).toBe('b');
    expect(cell('B3')?.textContent).toBe('Ação & <teste> "aspas"');
    expect(cell('C3')).toBeUndefined();
    // Header in bold and frozen.
    expect(cell('A1')?.getAttribute('s')).toBe('2');
    expect(sheet.getElementsByTagName('pane')[0]?.getAttribute('state')).toBe('frozen');
  });

  it('converts dates to Excel serial days', () => {
    expect(toExcelSerial('1900-01-01' as ISODate)).toBe(2);
    expect(toExcelSerial('2026-11-23' as ISODate)).toBe(46349);
  });

  it('names columns and escapes XML', () => {
    expect([0, 25, 26, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ']);
    expect(escapeXml('a\u0001b<c>')).toBe('ab&lt;c&gt;');
  });
});

describe('csv writer', () => {
  it('protects text that would be read as a formula', () => {
    expect(['=1+1', '+55', '-2', '@SUM(A1)', '\tx'].map(csvField)).toEqual([
      "'=1+1",
      "'+55",
      "'-2",
      "'@SUM(A1)",
      "'\tx",
    ]);
    // Real numbers stay numbers, with a decimal comma.
    expect(csvField(-2)).toBe('-2');
    expect(csvField(0.5)).toBe('0,5');
  });

  it('quotes delimiters, quotes and line breaks, keeps leading zeros and accents', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvField('linha\nnova')).toBe('"linha\nnova"');
    expect(csvField('007')).toBe('007');
    expect(csvField('Ação')).toBe('Ação');
  });

  it('writes a BOM, semicolons, CRLF and ISO dates', () => {
    const text = writeCsv([
      ['nome', 'inicio', 'marco'],
      ['Tarefa', { date: '2026-11-23' as ISODate }, false],
    ]);
    expect(text).toBe('﻿nome;inicio;marco\r\nTarefa;2026-11-23;não\r\n');
  });
});
