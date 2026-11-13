import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPlatformDashboard, type CompanyPlan } from '@/api';
import CompanyPlanButton from './CompanyPlanButton';

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
  const inSipat = pathname === `${base}/sipats` || pathname.startsWith(`${base}/sipats/`);
  return <>
    <NavLink className="sidebar-link" end to="/platform"><ArrowLeft aria-hidden="true" className="mr-1.5 inline size-3.5" />Todas as empresas</NavLink>
    <p className="sidebar-label sidebar-label-spaced">EMPRESA</p>
    <strong className="px-3 pb-1 text-sm font-semibold [overflow-wrap:anywhere]">{name || 'Carregando...'}</strong>
    {plan && <div className="px-3 pb-2"><CompanyPlanButton companyId={companyId} onChanged={setPlan} plan={plan} /></div>}
    <NavLink className={link(inSipat)} to={`${base}/sipats`}>SIPATs</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/participantes`}>Participantes</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/administradores`}>Administradores</NavLink>
  </>;
}
