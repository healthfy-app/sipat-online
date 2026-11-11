import { describe, expect, it, vi } from 'vitest';
import {
  createParticipantsFromCsv,
  generateInitialPassword,
  parseParticipantCsv,
  serializeCredentialCsv,
} from './participantCsv';

describe('participant CSV import', () => {
  it('parses semicolon-separated records with BOM, CRLF, and quoted delimiters', () => {
    const result = parseParticipantCsv(
      '\uFEFFnome;matrícula\r\n"Ana; da Silva";MAT-001\r\n',
      [],
    );

    expect(result.fatalError).toBeUndefined();
    expect(result.rows).toEqual([{
      recordNumber: 2,
      displayName: 'Ana; da Silva',
      loginIdentifier: 'MAT-001',
    }]);
    expect(result.issues).toEqual([]);
  });

  it('parses comma-separated records with escaped quotes and optional extra columns', () => {
    const result = parseParticipantCsv(
      'name,registration,email\n"Ana ""Nina"" Costa",MAT-002,ana@example.test\n',
      [],
    );

    expect(result.rows).toEqual([{
      recordNumber: 2,
      displayName: 'Ana "Nina" Costa',
      loginIdentifier: 'MAT-002',
    }]);
  });

  it('rejects a missing header and malformed quoting before creating any rows', () => {
    expect(parseParticipantCsv('Ana,MAT-003', []).fatalError).toMatch(/cabeçalho/i);
    const malformed = parseParticipantCsv('nome,matricula\n"Ana,MAT-003', []);
    expect(malformed.fatalError).toMatch(/aspas/i);
    expect(malformed.rows).toEqual([]);
  });

  it('reports invalid, existing, and repeated registrations without discarding other valid rows', () => {
    const result = parseParticipantCsv(
      'nome,matricula,email\nAna,MAT-010,ana@example.test\nBruna,mat-010,bia@example.test\n, MAT-011,bad@example.test\nCarlos,MAT-012\n',
      ['mat-099'],
    );

    expect(result.rows).toEqual([{
      recordNumber: 2,
      displayName: 'Ana',
      loginIdentifier: 'MAT-010',
    }]);
    expect(result.issues).toEqual([
      { recordNumber: 3, loginIdentifier: 'mat-010', message: 'Matrícula repetida neste arquivo.' },
      { recordNumber: 4, loginIdentifier: 'MAT-011', message: 'Informe nome e matrícula.' },
      { recordNumber: 5, loginIdentifier: 'MAT-012', message: 'A quantidade de colunas não corresponde ao cabeçalho.' },
    ]);
  });

  it('rejects registrations already present in the company and limits imports to 500 records', () => {
    const existing = parseParticipantCsv('nome;matricula\nAna;EMP-7\n', ['emp-7']);
    expect(existing.rows).toEqual([]);
    expect(existing.issues[0]).toMatchObject({
      recordNumber: 2,
      message: 'Matrícula já cadastrada nesta empresa.',
    });

    const tooManyRows = Array.from({ length: 501 }, (_, index) => `Nome ${index};MAT-${index}`).join('\n');
    expect(parseParticipantCsv(`nome,matricula\n${tooManyRows}`, []).fatalError).toMatch(/500/);
  });

  it('generates a password satisfying the existing identity policy', () => {
    const password = generateInitialPassword();

    expect(password).toHaveLength(20);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
  });

  it('continues after a row fails and returns credentials only for successful creates', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ana', loginIdentifier: 'MAT-021', isActive: true })
      .mockRejectedValueOnce(new Error('Matrícula já cadastrada.'))
      .mockResolvedValueOnce({ id: 'user-3', displayName: 'Caio', loginIdentifier: 'MAT-023', isActive: true });

    const result = await createParticipantsFromCsv([
      { recordNumber: 2, displayName: 'Ana', loginIdentifier: 'MAT-021' },
      { recordNumber: 3, displayName: 'Bia', loginIdentifier: 'MAT-022' },
      { recordNumber: 4, displayName: 'Caio', loginIdentifier: 'MAT-023' },
    ], create, () => 'InitialPass123456789');

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.created.map((item) => item.participant.loginIdentifier)).toEqual(['MAT-021', 'MAT-023']);
    expect(result.created[0].initialPassword).toBe('InitialPass123456789');
    expect(result.failed).toEqual([{
      recordNumber: 3,
      loginIdentifier: 'MAT-022',
      displayName: 'Bia',
      message: 'Matrícula já cadastrada.',
    }]);
    expect(JSON.stringify(result.failed)).not.toContain('InitialPass123456789');
  });

  it('quotes generated credential CSV cells and includes only the expected columns', () => {
    const csv = serializeCredentialCsv([{
      displayName: 'Ana "Nina"; Costa',
      loginIdentifier: 'MAT-031',
      initialPassword: 'Secure1234567890',
    }]);

    expect(csv).toBe('\uFEFF"nome";"matricula";"senha_inicial"\r\n"Ana ""Nina""; Costa";"MAT-031";"Secure1234567890"\r\n');
  });
});
