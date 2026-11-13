import { Navigate, useParams } from 'react-router-dom';

/** Entering a company opens its SIPATs, the first thing the operator works on there. */
export default function CompanyHome() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  return <Navigate replace to={`/platform/companies/${companyId}/sipats`} />;
}
