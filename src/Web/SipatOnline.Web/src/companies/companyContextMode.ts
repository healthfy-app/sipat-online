/**
 * The operator is "inside a company's own panel" (the green banner, the company administration menu) only on the /admin
 * screens opened with a company. The company set for the calls while the operator works in the company workspace
 * (/platform/companies/...) is not that mode, and it can still be set for a moment after leaving the workspace — so the
 * path decides, never the flag alone.
 */
export function isCompanyPanelMode(isPlatformOperator: boolean, pathname: string, administeredCompanyId: string | null): boolean {
  return isPlatformOperator && administeredCompanyId !== null && /^\/admin(\/|$)/.test(pathname);
}
