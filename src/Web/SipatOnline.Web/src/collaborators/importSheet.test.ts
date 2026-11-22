import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { downloadTemplate, mapHeader, readSheet } from './importSheet';

const csv = (content: string) => new File([content], 'carga.csv', { type: 'text/csv' });

describe('importSheet', () => {
  it('mapHeader recognises "Nome completo", "Matrícula", "E-mail", "Celular", "Departamento"', () => {
    expect(mapHeader('Nome completo')).toBe('name');
    expect(mapHeader(' MATRÍCULA ')).toBe('registrationNumber');
    expect(mapHeader('E-mail')).toBe('email');
    expect(mapHeader('Celular')).toBe('phone');
    expect(mapHeader('Departamento')).toBe('sector');
    expect(mapHeader('Filial')).toBe('unit');
    expect(mapHeader('Observação')).toBeNull();
  });

  it('CSV com ponto e vírgula vira ImportRow com row = 2 na primeira linha de dados', async () => {
    const result = await readSheet(csv('﻿Nome;Matrícula;Setor\r\nAna Lima;A1;Produção\r\n\r\nBia;;\r\n'));
    expect(result.fatalError).toBeUndefined();
    expect(result.rows).toEqual([
      { row: 2, name: 'Ana Lima', registrationNumber: 'A1', sector: 'Produção' },
      { row: 4, name: 'Bia' },
    ]);
  });

  it('xlsx com matrícula numérica 123456 vira "123456"', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Participantes');
    sheet.addRow(['Nome', 'Matrícula', 'Telefone']);
    sheet.addRow(['Ana', 123456, { formula: 'A1', result: '11999990000' }]);
    const buffer = await workbook.xlsx.writeBuffer();
    const result = await readSheet(new File([buffer], 'carga.xlsx'));
    expect(result.rows).toEqual([{ row: 2, name: 'Ana', registrationNumber: '123456', phone: '11999990000' }]);
  });

  it('planilha só com login e setor vira linhas sem name, sem erro fatal', async () => {
    const result = await readSheet(csv('login,setor\nana.lima,Produção\n'));
    expect(result.fatalError).toBeUndefined();
    expect(result.rows).toEqual([{ row: 2, login: 'ana.lima', sector: 'Produção' }]);
    expect(result.rows[0]).not.toHaveProperty('name');
  });

  it('CSV salvo pelo Excel em Windows-1252 mantém "Matrícula" e "João"', async () => {
    // "Matrícula;Nome\r\n123;João" as Excel pt-BR saves it: í = 0xED and ã = 0xE3, invalid as UTF-8
    const text = 'Matrícula;Nome\r\n123;João';
    const bytes = Uint8Array.from(text, character => character.charCodeAt(0));
    expect(bytes).toContain(0xed);
    const result = await readSheet(new File([bytes], 'carga.csv', { type: 'text/csv' }));
    expect(result.fatalError).toBeUndefined();
    expect(result.columns).toEqual(['registrationNumber', 'name']);
    expect(result.rows).toEqual([{ row: 2, registrationNumber: '123', name: 'João' }]);
  });

  it('CSV UTF-8 com BOM continua sendo lido como UTF-8', async () => {
    const bytes = new TextEncoder().encode('﻿Nome;Setor\nJoão;Produção\n');
    const result = await readSheet(new File([bytes], 'carga.csv'));
    expect(result.columns).toEqual(['name', 'sector']);
    expect(result.rows).toEqual([{ row: 2, name: 'João', sector: 'Produção' }]);
  });

  it('o modelo traz uma linha de exemplo que se vê que é para apagar', async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:x'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await downloadTemplate({ units: [], sectors: [], rules: { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false } });
    click.mockRestore();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await new Promise<ArrayBuffer>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blobs[0]); }));
    const example = workbook.getWorksheet('Participantes')!.getRow(2);
    expect(example.getCell(1).value).toBe('Exemplo (apague esta linha)');
    expect(example.getCell(2).value).toBe('exemplo');
  });

  it('planilha sem colunas conhecidas dá o erro fatal exato', async () => {
    const result = await readSheet(csv('a,b\n1,2\n'));
    expect(result.fatalError).toBe('Não reconhecemos as colunas. Use o modelo.');
    expect((await readSheet(csv('email,setor\na@b.com,X\n'))).fatalError)
      .toBe('A planilha precisa da coluna nome ou da coluna login/matrícula.');
  });
});
