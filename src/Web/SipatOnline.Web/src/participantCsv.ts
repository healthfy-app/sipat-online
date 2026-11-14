import type { CreateParticipantData, ParticipantAccount } from './api';

export const MAX_PARTICIPANT_CSV_ROWS = 500;
export const MAX_PARTICIPANT_CSV_BYTES = 2 * 1024 * 1024;
const MAX_NAME_LENGTH = 150;
const MAX_LOGIN_IDENTIFIER_LENGTH = 128;
const PASSWORD_LENGTH = 20;
const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lowercase = 'abcdefghijkmnopqrstuvwxyz';
const digits = '23456789';
const passwordAlphabet = `${uppercase}${lowercase}${digits}`;

export interface ParticipantCsvRow {
  recordNumber: number;
  displayName: string;
  loginIdentifier: string;
}

export interface ParticipantCsvIssue {
  recordNumber: number;
  loginIdentifier: string;
  message: string;
}

export interface ParticipantCsvParseResult {
  rows: ParticipantCsvRow[];
  issues: ParticipantCsvIssue[];
  fatalError?: string;
}

export interface ImportedParticipantCredential {
  participant: ParticipantAccount;
  displayName: string;
  loginIdentifier: string;
  initialPassword: string;
}

export interface ParticipantCsvImportResult {
  created: ImportedParticipantCredential[];
  failed: (ParticipantCsvRow & { message: string })[];
}

export function parseParticipantCsv(
  content: string,
  existingLoginIdentifiers: readonly string[],
): ParticipantCsvParseResult {
  const text = content.replace(/^\uFEFF/, '');
  if (!text.trim()) {
    return { rows: [], issues: [], fatalError: 'O arquivo CSV está vazio.' };
  }

  const delimiter = detectDelimiter(text);
  const parsed = parseRecords(text, delimiter);
  if (parsed.error) {
    return { rows: [], issues: [], fatalError: parsed.error };
  }

  const [headerRecord, ...dataRecords] = parsed.records;
  if (!headerRecord) {
    return { rows: [], issues: [], fatalError: 'O arquivo precisa ter um cabeçalho.' };
  }

  const headers = headerRecord.map(normalizeHeader);
  const nameIndex = headers.findIndex((header) => ['nome', 'nome completo', 'name'].includes(header));
  const identifierIndex = headers.findIndex((header) =>
    ['login', 'matricula', 'employeeid', 'employeeidentifier', 'registro', 'registration'].includes(header),
  );
  if (nameIndex < 0 || identifierIndex < 0 || nameIndex === identifierIndex) {
    return {
      rows: [],
      issues: [],
      fatalError: 'Inclua as colunas obrigatórias "nome" e "login" no cabeçalho.',
    };
  }
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) {
    return { rows: [], issues: [], fatalError: 'O cabeçalho contém nomes de coluna repetidos.' };
  }
  if (dataRecords.length > MAX_PARTICIPANT_CSV_ROWS) {
    return {
      rows: [],
      issues: [],
      fatalError: `O limite é ${MAX_PARTICIPANT_CSV_ROWS} participantes por arquivo.`,
    };
  }

  const existing = new Set(existingLoginIdentifiers.map(normalizeIdentifier));
  const seen = new Set<string>();
  const rows: ParticipantCsvRow[] = [];
  const issues: ParticipantCsvIssue[] = [];

  dataRecords.forEach((record, index) => {
    const recordNumber = index + 2;
    const loginIdentifier = (record[identifierIndex] ?? '').trim();
    const displayName = (record[nameIndex] ?? '').trim();
    const issue = validateRecord(record, headerRecord.length, recordNumber, displayName, loginIdentifier);
    if (issue) {
      issues.push(issue);
      return;
    }

    const normalizedIdentifier = normalizeIdentifier(loginIdentifier);
    if (seen.has(normalizedIdentifier)) {
      issues.push({
        recordNumber,
        loginIdentifier,
        message: 'Login repetido neste arquivo.',
      });
      return;
    }
    seen.add(normalizedIdentifier);

    if (existing.has(normalizedIdentifier)) {
      issues.push({
        recordNumber,
        loginIdentifier,
        message: 'Login já cadastrado nesta empresa.',
      });
      return;
    }

    rows.push({ recordNumber, displayName, loginIdentifier });
  });

  return { rows, issues };
}

export function generateInitialPassword(): string {
  const password = [
    randomCharacter(uppercase),
    randomCharacter(lowercase),
    randomCharacter(digits),
    ...Array.from({ length: PASSWORD_LENGTH - 3 }, () => randomCharacter(passwordAlphabet)),
  ];

  for (let index = password.length - 1; index > 0; index--) {
    const swapIndex = randomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join('');
}

export async function createParticipantsFromCsv(
  rows: readonly ParticipantCsvRow[],
  createParticipant: (data: CreateParticipantData) => Promise<ParticipantAccount>,
  passwordFactory: () => string = generateInitialPassword,
): Promise<ParticipantCsvImportResult> {
  const credentials = rows.map((row) => ({ row, initialPassword: passwordFactory() }));
  const created: ImportedParticipantCredential[] = [];
  const failed: (ParticipantCsvRow & { message: string })[] = [];

  for (const { row, initialPassword } of credentials) {
    try {
      const participant = await createParticipant({
        displayName: row.displayName,
        loginIdentifier: row.loginIdentifier,
        initialPassword,
        role: 'Participant',
      });
      created.push({
        participant,
        displayName: row.displayName,
        loginIdentifier: row.loginIdentifier,
        initialPassword,
      });
    } catch (error) {
      failed.push({
        ...row,
        message: error instanceof Error ? error.message : 'Não foi possível criar esta conta.',
      });
    }
  }

  return { created, failed };
}

export function serializeCredentialCsv(credentials: readonly Pick<
  ImportedParticipantCredential,
  'displayName' | 'loginIdentifier' | 'initialPassword'
>[]): string {
  const rows = [
    ['nome', 'login', 'senha_inicial'],
    ...credentials.map((credential) => [
      credential.displayName,
      credential.loginIdentifier,
      credential.initialPassword,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}\r\n`;
}

function validateRecord(
  record: readonly string[],
  expectedColumnCount: number,
  recordNumber: number,
  displayName: string,
  loginIdentifier: string,
): ParticipantCsvIssue | null {
  if (record.length !== expectedColumnCount) {
    return {
      recordNumber,
      loginIdentifier,
      message: 'A quantidade de colunas não corresponde ao cabeçalho.',
    };
  }
  if (!displayName || !loginIdentifier) {
    return { recordNumber, loginIdentifier, message: 'Informe nome e login.' };
  }
  if (
    displayName.length > MAX_NAME_LENGTH
    || loginIdentifier.length > MAX_LOGIN_IDENTIFIER_LENGTH
    || /[\r\n\u0000]/.test(displayName)
    || /[\r\n\u0000]/.test(loginIdentifier)
  ) {
    return { recordNumber, loginIdentifier, message: 'O nome ou o login tem formato ou tamanho inválido.' };
  }
  return null;
}

function detectDelimiter(content: string): string {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;

  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (character === '\r' || character === '\n')) {
      break;
    } else if (!inQuotes && character === ',') {
      commas++;
    } else if (!inQuotes && character === ';') {
      semicolons++;
    }
  }

  return semicolons > commas ? ';' : ',';
}

function parseRecords(content: string, delimiter: string): { records: string[][]; error?: string } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;
  let afterQuote = false;

  const finishCell = () => {
    record.push(cell);
    cell = '';
    afterQuote = false;
  };
  const finishRecord = () => {
    finishCell();
    if (record.some((value) => value.trim() !== '')) {
      records.push(record);
    }
    record = [];
  };

  for (let index = 0; index < content.length; index++) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        finishCell();
      } else if (character === '\r' || character === '\n') {
        finishRecord();
        if (character === '\r' && content[index + 1] === '\n') index++;
      } else if (character !== ' ' && character !== '\t') {
        return { records: [], error: 'O CSV contém aspas ou caracteres inválidos após um campo entre aspas.' };
      }
      continue;
    }

    if (character === '"' && cell.trim() === '') {
      cell = '';
      inQuotes = true;
    } else if (character === '"') {
      return { records: [], error: 'O CSV contém aspas em posição inválida.' };
    } else if (character === delimiter) {
      finishCell();
    } else if (character === '\r' || character === '\n') {
      finishRecord();
      if (character === '\r' && content[index + 1] === '\n') index++;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    return { records: [], error: 'O CSV termina com aspas sem fechamento.' };
  }
  if (cell.length > 0 || record.length > 0 || afterQuote) {
    finishRecord();
  }

  return { records };
}

function normalizeHeader(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function randomCharacter(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)];
}

function randomIndex(maximum: number): number {
  const limit = 256 - (256 % maximum);
  const bytes = new Uint8Array(1);
  do {
    globalThis.crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % maximum;
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
