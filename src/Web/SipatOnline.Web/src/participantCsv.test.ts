import { describe, expect, it } from 'vitest';
import { generateInitialPassword, serializeCredentialCsv } from './participantCsv';

describe('participant credentials', () => {
  it('generates a password satisfying the existing identity policy', () => {
    const password = generateInitialPassword();

    expect(password).toHaveLength(20);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
  });

  it('quotes generated credential CSV cells and includes only the expected columns', () => {
    const csv = serializeCredentialCsv([{
      displayName: 'Ana "Nina"; Costa',
      loginIdentifier: 'MAT-031',
      initialPassword: 'Secure1234567890',
    }]);

    expect(csv).toBe('﻿"nome";"login";"senha_inicial"\r\n"Ana ""Nina""; Costa";"MAT-031";"Secure1234567890"\r\n');
  });
});
