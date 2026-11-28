import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { NavLink, useLocation } from 'react-router-dom';
import { getPlatformDashboard, type CompanyPlan } from '@/api';
import { UnitMenu } from '@/trainings/unitScope';
import CompanyAvatar from './CompanyAvatar';
import CompanyPlanButton from './CompanyPlanButton';

/**
 * A name like "Damare - Laticínios Resende" should break after its dash, not strand the dash or one last word: the
 * separator is glued to the word before it (a space that does not break), so the only break left there is after it.
 */
const breakAtSeparator = (name: string) => name.replace(/\s+([-–—|/·])\s+/g, ' $1 ');

/**
 * The sidebar while the operator works inside one company: everything here is about that company only.
 * It reads top to bottom as the way in went: back to all companies; which company this is (its logo, name and plan)
 * and the unit it is being looked at through; its pages; and, apart at the end, the door to the company's own panel.
 */
export default function CompanyNav({ companyId }: { companyId: string }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);
  const { pathname } = useLocation();
  const base = `/platform/companies/${companyId}`;

  useEffect(() => {
    let current = true;
    getPlatformDashboard()
      .then(companies => {
        if (!current) return;
        const company = companies.find(item => item.id === companyId);
        setName(company?.name ?? ''); setPlan(company?.plan ?? null); setLogo(company?.logoReference ?? null);
        setInactive(company ? !company.isActive : false);
      })
      .catch(() => { if (current) setName(''); });
    return () => { current = false; };
  }, [companyId]);

  const link = (active: boolean) => `sidebar-link${active ? ' active' : ''}`;
  const inSipat = pathname === `${base}/treinamentos` || pathname.startsWith(`${base}/treinamentos/`);
  return <>
    <NavLink className="sidebar-link text-[0.8125rem] text-muted-foreground" end to="/platform"><ArrowLeft aria-hidden="true" className="mr-1.5 inline size-3.5" />Todas as empresas</NavLink>

    {/* which company this is, and the unit it is looked at through: one card, so the menu below reads as "of this company" */}
    <div className="mt-1 mb-3 grid gap-2.5 rounded-xl border border-[#dfe6e3] bg-white p-2.5">
      <div className="flex items-start gap-2.5">
        {name && <CompanyAvatar className="mt-0.5 size-9" logo={logo} name={name} />}
        {/* the plan sits beside the name; a name too long for both goes on, and the plan drops under it */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* two even lines instead of a long one and a leftover word; the whole name is in the tooltip */}
          <strong className="min-w-0 text-sm font-semibold leading-snug text-balance [overflow-wrap:anywhere]" title={name || undefined}>{name ? breakAtSeparator(name) : 'Carregando...'}</strong>
          {plan && <CompanyPlanButton companyId={companyId} onChanged={setPlan} plan={plan} />}
          {inactive && <Badge title="O portal desta empresa não abre: ela está inativa" variant="warning">Inativa</Badge>}
        </div>
      </div>
      <UnitMenu className="mb-0" />
    </div>

    <NavLink className={link(inSipat)} to={`${base}/treinamentos`}>Conteúdos</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/participantes`}>Participantes</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/administradores`}>Administradores</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/qualidade`}>Monitor de Desempenho</NavLink>

    {/* the company's own panel, as its administrator sees it: a way out of this menu, so it sits apart at the end */}
    <a className="mt-3 flex min-h-10 items-center gap-2 border-t border-[#dfe6e3] px-3 pt-3 text-[0.8125rem] font-semibold text-primary no-underline transition-colors hover:text-[#0b241f]"
      href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}>
      <span className="min-w-0 flex-1">Entrar como administrador</span>
      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
    </a>
  </>;
}
