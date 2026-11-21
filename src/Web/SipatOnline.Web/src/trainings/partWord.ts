/** A part of a training is a "Dia" when the training has dates, a "Módulo" when none of its parts has one. */
export function partWord(dates: readonly (string | null | undefined)[]): 'Dia' | 'Módulo' {
  return dates.some(Boolean) ? 'Dia' : 'Módulo';
}
