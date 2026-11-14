import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { configureCompanyAdministration } from '@/api';

/**
 * Lets the operator use the company's own administration screens from inside the company workspace: while it is on screen,
 * the calls to the company's /api/admin routes carry the company. Leaving the workspace clears it.
 */
export default function CompanyContext({ children }: { children: (companyId: string) => ReactNode }) {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    configureCompanyAdministration(companyId);
    setReady(true);
    return () => { configureCompanyAdministration(null); setReady(false); };
  }, [companyId]);

  return ready ? <>{children(companyId)}</> : null;
}
