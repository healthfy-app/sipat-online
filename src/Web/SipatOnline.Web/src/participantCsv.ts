const PASSWORD_LENGTH = 20;
const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lowercase = 'abcdefghijkmnopqrstuvwxyz';
const digits = '23456789';
const passwordAlphabet = `${uppercase}${lowercase}${digits}`;

export interface IssuedCredential {
  displayName: string;
  loginIdentifier: string;
  initialPassword: string;
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

export function serializeCredentialCsv(credentials: readonly IssuedCredential[]): string {
  const rows = [
    ['nome', 'login', 'senha_inicial'],
    ...credentials.map((credential) => [
      credential.displayName,
      credential.loginIdentifier,
      credential.initialPassword,
    ]),
  ];
  return `﻿${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}\r\n`;
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
