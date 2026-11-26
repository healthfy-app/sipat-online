import { ArrowLeft, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPlatformDashboard, type CompanyPlan } from '@/api';
import CompanyPlanButton from './CompanyPlanButton';

/**
 * A name like "Damare - Laticínios Resende" should break after its dash, not strand the dash or one last word: the
 * separator is glued to the word before it (a space that does not break), so the only break left there is after it.
 */
const breakAtSeparator = (name: string) => name.replace(/\s+([-–—|/·])\s+/g, ' $1 ');

/**
 * The sidebar while the operator works inside one company: everything here is about that company only.
 * It replaces the platform menu until the operator goes back to all companies.
 */
export default function CompanyNav({ companyId }: { companyId: string }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const { pathname } = useLocation();
  const base = `/platform/companies/${companyId}`;

  useEffect(() => {
    let current = true;
    getPlatformDashboard()
      .then(companies => {
        if (!current) return;
        const company = companies.find(item => item.id === companyId);
        setName(company?.name ?? ''); setPlan(company?.plan ?? null);
      })
      .catch(() => { if (current) setName(''); });
    return () => { current = false; };
  }, [companyId]);

  const link = (active: boolean) => `sidebar-link${active ? ' active' : ''}`;
  const inSipat = pathname === `${base}/treinamentos` || pathname.startsWith(`${base}/treinamentos/`);
  return <>
    <NavLink className="sidebar-link" end to="/platform"><ArrowLeft aria-hidden="true" className="mr-1.5 inline size-3.5" />Todas as empresas</NavLink>
    <p className="sidebar-label sidebar-label-spaced">EMPRESA</p>
    {/* the plan sits beside the name; a name too long for both goes on, and the plan drops under it */}
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3">
      {/* two even lines instead of a long one and a leftover word; the whole name is in the tooltip */}
      <strong className="min-w-0 text-sm font-semibold leading-snug text-balance [overflow-wrap:anywhere]" title={name || undefined}>{name ? breakAtSeparator(name) : 'Carregando...'}</strong>
      {plan && <CompanyPlanButton companyId={companyId} onChanged={setPlan} plan={plan} />}
    </div>
    {/* the company's own panel, as its administrator sees it: at hand on every page of the company */}
    <a className="mx-3 mb-3 flex min-h-9 items-center justify-center gap-2 rounded-[0.625rem] border border-primary/30 bg-accent px-3 text-[0.8125rem] font-semibold text-primary no-underline transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground [&_svg]:size-4"
      href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}>
      <LogIn aria-hidden="true" /> Entrar como administrador
    </a>
    <NavLink className={link(inSipat)} to={`${base}/treinamentos`}>Conteúdos</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/participantes`}>Participantes</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/administradores`}>Administradores</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/qualidade`}>Monitor de Desempenho</NavLink>
  </>;
}
