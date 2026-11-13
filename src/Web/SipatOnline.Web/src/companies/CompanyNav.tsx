import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPlatformDashboard } from '@/api';

/**
 * The sidebar while the operator works inside one company: everything here is about that company only.
 * It replaces the platform menu until the operator goes back to all companies.
 */
export default function CompanyNav({ companyId }: { companyId: string }) {
  const [name, setName] = useState('');
  const { pathname } = useLocation();
  const base = `/platform/companies/${companyId}`;

  useEffect(() => {
    let current = true;
    getPlatformDashboard()
      .then(companies => { if (current) setName(companies.find(company => company.id === companyId)?.name ?? ''); })
      .catch(() => { if (current) setName(''); });
    return () => { current = false; };
  }, [companyId]);

  const link = (active: boolean) => `sidebar-link${active ? ' active' : ''}`;
  const inSipat = pathname === base || pathname === `${base}/sipat` || pathname.startsWith(`${base}/sipat/`);
  return <>
    <NavLink className="sidebar-link" end to="/platform"><ArrowLeft aria-hidden="true" className="mr-1.5 inline size-3.5" />Todas as empresas</NavLink>
    <p className="sidebar-label sidebar-label-spaced">EMPRESA</p>
    <strong className="px-3 pb-1 text-sm font-semibold [overflow-wrap:anywhere]">{name || 'Carregando...'}</strong>
    <NavLink className={link(inSipat)} end to={base}>Construção SIPAT</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/participantes`}>Participantes</NavLink>
    <NavLink className={({ isActive }) => link(isActive)} to={`${base}/administradores`}>Administradores</NavLink>
    <a className="sidebar-link" href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}>Ver como o cliente <ExternalLink aria-hidden="true" className="ml-1 inline size-3.5" /></a>
  </>;
}
