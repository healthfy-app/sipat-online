/**
 * Regra de senha do SIPAT Online. Precisa ser a mesma do backend
 * (InfrastructureServiceCollectionExtensions: RequiredLength = 6, sem exigir maiúscula, número ou símbolo).
 */
export const passwordMinLength = 6;

export const passwordRulesHint =
  `Mínimo de ${passwordMinLength} caracteres. Pode usar letras, números ou símbolos, sem outras exigências.`;
