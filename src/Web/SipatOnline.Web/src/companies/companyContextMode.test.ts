import { describe, expect, it } from 'vitest';
import { isCompanyPanelMode } from './companyContextMode';

describe('company panel mode of the operator', () => {
  it('is on only in the /admin screens opened with a company', () => {
    expect(isCompanyPanelMode(true, '/admin/dashboard', 'company-1')).toBe(true);
    expect(isCompanyPanelMode(true, '/admin/appearance', 'company-1')).toBe(true);
  });

  it('is off back on the platform even while the workspace company is still set', () => {
    // leaving /platform/companies/:id/sipats/:id for /platform: the company is cleared only after that render
    expect(isCompanyPanelMode(true, '/platform', 'company-1')).toBe(false);
    expect(isCompanyPanelMode(true, '/platform/courses', 'company-1')).toBe(false);
    expect(isCompanyPanelMode(true, '/platform/companies/company-1/sipats', 'company-1')).toBe(false);
  });

  it('needs an operator and a company', () => {
    expect(isCompanyPanelMode(false, '/admin/dashboard', 'company-1')).toBe(false);
    expect(isCompanyPanelMode(true, '/admin/dashboard', null)).toBe(false);
  });
});
