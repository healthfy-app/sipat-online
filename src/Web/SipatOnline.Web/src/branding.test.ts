import { describe, expect, it } from 'vitest';
import { sipatPrimary, tenantTheme } from './branding';

describe('tenant theme', () => {
  it('lets the participant area follow the color the company chose', () => {
    const theme = tenantTheme('#0F4C9A', '#FFFFFF') as Record<string, string>;
    expect(theme['--brand-primary']).toBe('#0F4C9A');
    expect(theme['--learner-forest-custom']).toContain('#0F4C9A');
    expect(theme['--learner-action-custom']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('keeps SIPAT green in the participant area for companies without their own color', () => {
    for (const primary of [sipatPrimary, '#1f2937']) {
      const theme = tenantTheme(primary, '#FFFFFF') as Record<string, string>;
      expect(Object.keys(theme).filter(key => key.startsWith('--learner'))).toEqual([]);
    }
  });
});
