import { Navigate, useParams } from 'react-router-dom';

/** Entering a company opens its trainings, the first thing the operator works on there. */
export default function CompanyHome() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  return <Navigate replace to={`/platform/companies/${companyId}/treinamentos`} />;
}
