/**
 * Regra de senha do SIPAT Online. Precisa ser a mesma do backend
 * (InfrastructureServiceCollectionExtensions: RequiredLength = 6, sem exigir maiúscula, número ou símbolo).
 */
export const passwordMinLength = 6;

// letters and digits that cannot be mistaken for one another when read aloud or copied by hand (no 0/O, 1/l/I)
const readableAlphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random temporary password in three groups of four, easy to dictate: "Kp7m-x4Rt-9wQa". */
export function generatePassword(): string {
  const values = crypto.getRandomValues(new Uint32Array(12));
  const characters = Array.from(values, value => readableAlphabet[value % readableAlphabet.length]);
  return [0, 4, 8].map(start => characters.slice(start, start + 4).join('')).join('-');
}

export const passwordRulesHint =
  `Mínimo de ${passwordMinLength} caracteres. Pode usar letras, números ou símbolos, sem outras exigências.`;
