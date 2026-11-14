import { Navigate } from 'react-router-dom';

/** O cadastro de empresas agora é um diálogo na própria lista de Empresas. */
export default function PlatformCompaniesPage() {
  return <Navigate replace to="/platform?nova-empresa=1" />;
}
