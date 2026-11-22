import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { mapHeader, readSheet } from './importSheet';

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

  it('planilha sem colunas conhecidas dá o erro fatal exato', async () => {
    const result = await readSheet(csv('a,b\n1,2\n'));
    expect(result.fatalError).toBe('Não reconhecemos as colunas. Use o modelo.');
    expect((await readSheet(csv('email,setor\na@b.com,X\n'))).fatalError)
      .toBe('A planilha precisa da coluna nome ou da coluna login/matrícula.');
  });
});
