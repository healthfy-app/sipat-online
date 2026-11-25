import { getPlatformDashboard } from '@/api';
import { companyAddress } from '@/companies/CompanyAddress';

/**
 * The link of a training, to hand to the people who will take it: the company's own address, straight on that
 * training. It carries no password: whoever opens it signs in with the login the company gave them, and lands there.
 */

/** The training the participant's home shows (kept for the session; the link sets it on arrival). */
export const chosenTrainingKey = 'sipat:learning-training';
/** Set when the session started from a link, until the participant's home has shown what the link asked for. */
const linkArrivalKey = 'sipat:link-arrival';

const read = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* no storage: the home opens on its default training */ }
};

/**
 * On arriving by a link (before signing in, usually): remembers which training it asked for, so that after the login
 * the participant's home opens on it instead of on the default one.
 */
export function rememberLinkedTraining(location: Pick<Location, 'pathname' | 'search'> = window.location): void {
  if (location.pathname !== '/learning') return;
  const id = new URLSearchParams(location.search).get('treinamento');
  if (!id) return;
  write(chosenTrainingKey, id);
  write(linkArrivalKey, id);
}

/** The training a link asked for in this session, if the home has not shown it yet. */
export function linkedTraining(): string | null {
  return read(linkArrivalKey);
}

/** The home showed what the link asked for (or said it could not): the link is done. */
export function clearLinkedTraining(): void {
  write(linkArrivalKey, null);
}

/**
 * The link of a training. The company's administrator is already at the company's address; the operation, inside a
 * company (`/platform/companies/{id}/…`), builds it from the company's key.
 */
export async function trainingLink(sipatId: string, basePath: string, operator: boolean): Promise<string> {
  let origin = window.location.origin;
  if (operator) {
    const companyId = basePath.split('/')[3];
    const company = (await getPlatformDashboard()).find(item => item.id === companyId);
    if (!company) throw new Error('Não encontrei o endereço desta empresa.');
    origin = companyAddress(company.key);
  }
  return `${origin}/learning?treinamento=${sipatId}`;
}

/** Copies the link; gives it back so the page can show it when the clipboard is not available. */
export async function copyTrainingLink(sipatId: string, basePath: string, operator: boolean): Promise<{ link: string; copied: boolean }> {
  const link = await trainingLink(sipatId, basePath, operator);
  try {
    await navigator.clipboard.writeText(link);
    return { link, copied: true };
  } catch {
    return { link, copied: false };
  }
}
