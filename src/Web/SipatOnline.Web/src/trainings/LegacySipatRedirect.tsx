import { Navigate, useParams, type Params } from 'react-router-dom';

/** An old /sipats link (bookmarked, shared) goes to the same place under /treinamentos. */
export function LegacySipatRedirect({ to }: { to: (params: Readonly<Params>) => string }) {
  return <Navigate replace to={to(useParams())} />;
}
