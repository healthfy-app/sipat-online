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

export function tenantTheme(primary: string, secondary: string): CSSProperties {
  let accent = primary;
  while (colorContrast(accent, '#FFFFFF') < 4.5) {
    accent = `#${[1, 3, 5].map(index => Math.floor(parseInt(accent.slice(index, index + 2), 16) * 0.85)
      .toString(16).padStart(2, '0')).join('')}`;
  }
  return {
    '--brand-primary': primary,
    '--brand-secondary': secondary,
    '--green': accent,
    '--green-soft': `color-mix(in srgb, ${primary} 8%, white)`,
    '--green-tint': `color-mix(in srgb, ${primary} 10%, white)`,
    '--green-line': `color-mix(in srgb, ${primary} 22%, white)`,
  } as CSSProperties;
}
