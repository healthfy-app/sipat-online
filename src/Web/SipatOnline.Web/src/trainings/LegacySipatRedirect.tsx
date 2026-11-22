import { Navigate, useLocation, useParams, type Params } from 'react-router-dom';

/** An old /sipats link (bookmarked, shared) goes to the same place under /treinamentos, keeping its query and hash. */
export function LegacySipatRedirect({ to }: { to: (params: Readonly<Params>) => string }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={`${to(useParams())}${search}${hash}`} />;
}
