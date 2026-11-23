import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { downloadTemplate, mapHeader, missingInRow, readSheet } from './importSheet';

const csv = (content: string) => new File([content], 'carga.csv', { type: 'text/csv' });

describe('importSheet', () => {
  it('mapHeader recognises "Nome completo", "Senha", "Matrícula", "E-mail", "Celular", "Departamento"', () => {
    expect(mapHeader('Nome completo')).toBe('name');
    expect(mapHeader('Senha')).toBe('password');
    expect(mapHeader(' MATRÍCULA ')).toBe('registrationNumber');
    expect(mapHeader('E-mail')).toBe('email');
    expect(mapHeader('Celular')).toBe('phone');
    expect(mapHeader('Departamento')).toBe('sector');
    expect(mapHeader('Filial')).toBe('unit');
    expect(mapHeader('Observação')).toBeNull();
  });

  it('reads the model of the HR: the "*" of an optional column is ignored and "unidade empresarial" is the unit', () => {
    expect(mapHeader('*e-mail')).toBe('email');
    expect(mapHeader('*matrícula')).toBe('registrationNumber');
    expect(mapHeader('*setor')).toBe('sector');
    expect(mapHeader('*unidade empresarial')).toBe('unit');
  });

  it('CSV com ponto e vírgula vira ImportRow com row = 2 na primeira linha de dados', async () => {
    const result = await readSheet(csv('﻿Login;Senha;Nome completo;*matrícula;*setor\r\nana;Senha@2026;Ana Lima;A1;Produção\r\n\r\nbia;Outra@2026;Bia;;\r\n'));
    expect(result.fatalError).toBeUndefined();
    expect(result.columns).toEqual(['login', 'password', 'name', 'registrationNumber', 'sector']);
    expect(result.rows).toEqual([
      { row: 2, login: 'ana', password: 'Senha@2026', name: 'Ana Lima', registrationNumber: 'A1', sector: 'Produção' },
      { row: 4, login: 'bia', password: 'Outra@2026', name: 'Bia' },
    ]);
  });

  it('keeps a password exactly as typed, spaces included', async () => {
    const result = await readSheet(csv('Login;Senha;Nome completo\nana; Senha 2026 ;Ana\n'));
    expect(result.rows[0].password).toBe(' Senha 2026 ');
  });

  it('xlsx com matrícula e senha numéricas vira texto', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Participantes');
    sheet.addRow(['Login', 'Senha', 'Nome completo', '*matrícula', 'Telefone']);
    sheet.addRow(['ana', 12345678, 'Ana', 123456, { formula: 'A1', result: '11999990000' }]);
    const buffer = await workbook.xlsx.writeBuffer();
    const result = await readSheet(new File([buffer], 'carga.xlsx'));
    expect(result.rows).toEqual([{ row: 2, login: 'ana', password: '12345678', name: 'Ana', registrationNumber: '123456', phone: '11999990000' }]);
  });

  it('CSV salvo pelo Excel em Windows-1252 mantém "Matrícula" e "João"', async () => {
    // as Excel pt-BR saves it: í = 0xED and ã = 0xE3, invalid as UTF-8
    const text = 'Login;Senha;Nome completo;Matrícula\r\njoao;Senha@2026;João;123';
    const bytes = Uint8Array.from(text, character => character.charCodeAt(0));
    expect(bytes).toContain(0xed);
    const result = await readSheet(new File([bytes], 'carga.csv', { type: 'text/csv' }));
    expect(result.fatalError).toBeUndefined();
    expect(result.columns).toEqual(['login', 'password', 'name', 'registrationNumber']);
    expect(result.rows).toEqual([{ row: 2, login: 'joao', password: 'Senha@2026', name: 'João', registrationNumber: '123' }]);
  });

  it('CSV UTF-8 com BOM continua sendo lido como UTF-8', async () => {
    const bytes = new TextEncoder().encode('﻿Login;Senha;Nome completo;Setor\njoao;Senha@2026;João;Produção\n');
    const result = await readSheet(new File([bytes], 'carga.csv'));
    expect(result.rows).toEqual([{ row: 2, login: 'joao', password: 'Senha@2026', name: 'João', sector: 'Produção' }]);
  });

  it('says which required column the sheet lacks', async () => {
    expect((await readSheet(csv('Login;Nome completo\nana;Ana\n'))).fatalError)
      .toBe('A planilha precisa da coluna Senha. Use o modelo: Login, Senha e Nome completo são obrigatórios.');
    expect((await readSheet(csv('email,setor\na@b.com,X\n'))).fatalError)
      .toBe('A planilha precisa das colunas Login, Senha e Nome completo. Use o modelo: Login, Senha e Nome completo são obrigatórios.');
  });

  it('says which required cell a line left empty', () => {
    expect(missingInRow({ row: 2, login: 'ana', password: 'x', name: 'Ana' })).toBeNull();
    expect(missingInRow({ row: 3, login: 'ana', name: 'Ana' })).toBe('Falta senha.');
    expect(missingInRow({ row: 4, password: 'x' })).toBe('Falta login e nome completo.');
  });

  it('o modelo tem as colunas do RH e uma linha de exemplo que se vê que é para apagar', async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:x'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await downloadTemplate({ units: [], sectors: [], rules: { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false } });
    click.mockRestore();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await new Promise<ArrayBuffer>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blobs[0]); }));
    const people = workbook.getWorksheet('Participantes')!;
    expect((people.getRow(1).values as unknown[]).slice(1))
      .toEqual(['Login', 'Senha', 'Nome completo', '*e-mail', '*matrícula', '*setor', '*unidade empresarial']);
    expect(people.getRow(2).getCell(1).value).toBe('exemplo');
    expect(people.getRow(2).getCell(3).value).toBe('Exemplo (apague esta linha)');
  });

  it('planilha sem colunas conhecidas dá o erro fatal exato', async () => {
    const result = await readSheet(csv('a,b\n1,2\n'));
    expect(result.fatalError).toBe('Não reconhecemos as colunas. Use o modelo.');
  });
});
