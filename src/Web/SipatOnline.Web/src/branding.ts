import { createContext, type CSSProperties } from 'react';

export const BrandThemeContext = createContext<CSSProperties>({});

export function isBrandColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function colorContrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const values = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const left = luminance(first);
  const right = luminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

/** Cor padrão do backend para empresas que não escolheram uma; no front vira o verde da marca SIPAT. */
const backendDefaultPrimary = /^#1f2937$/i;
export const sipatPrimary = '#14694B';

export function tenantTheme(chosenPrimary: string, secondary: string): CSSProperties {
  const primary = backendDefaultPrimary.test(chosenPrimary) ? sipatPrimary : chosenPrimary;
  let accent = primary;
  while (colorContrast(accent, '#FFFFFF') < 4.5) {
    accent = `#${[1, 3, 5].map(index => Math.floor(parseInt(accent.slice(index, index + 2), 16) * 0.85)
      .toString(16).padStart(2, '0')).join('')}`;
  }
  // the participant area keeps SIPAT green unless the company chose its own color; then it follows that color
  const custom = primary.toLowerCase() !== sipatPrimary.toLowerCase();
  const learner: Record<string, string> = custom ? {
    '--learner-forest-custom': `color-mix(in srgb, ${primary} 30%, #000)`,
    '--learner-deep-custom': `color-mix(in srgb, ${primary} 20%, #000)`,
    '--learner-action-custom': accent,
    '--learner-highlight-custom': `color-mix(in srgb, ${primary} 45%, #fff)`,
    '--learner-complete-bg-custom': `color-mix(in srgb, ${primary} 14%, #fff)`,
    '--learner-complete-text-custom': `color-mix(in srgb, ${accent} 80%, #000)`,
  } : {};
  return {
    ...learner,
    '--brand-primary': primary,
    '--brand-secondary': secondary,
    '--green': accent,
    '--green-soft': `color-mix(in srgb, ${primary} 8%, white)`,
    '--green-tint': `color-mix(in srgb, ${primary} 10%, white)`,
    '--green-line': `color-mix(in srgb, ${primary} 22%, white)`,
  } as CSSProperties;
}
