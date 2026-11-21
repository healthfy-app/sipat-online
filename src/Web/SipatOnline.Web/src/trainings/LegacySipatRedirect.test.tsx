import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { LegacySipatRedirect } from './LegacySipatRedirect';

function Where() { return <p>{useLocation().pathname}</p>; }

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route element={<LegacySipatRedirect to={({ sipatId }) => `/admin/treinamentos/${sipatId}`} />} path="/admin/sipats/:sipatId" />
  <Route element={<LegacySipatRedirect to={({ companyId }) => `/platform/companies/${companyId}/treinamentos`} />} path="/platform/companies/:companyId/sipats" />
  <Route element={<Where />} path="*" />
</Routes></MemoryRouter>);

it('sends an old link of a training to the same training at its new address', () => {
  renderAt('/admin/sipats/s1');
  expect(screen.getByText('/admin/treinamentos/s1')).toBeInTheDocument();
});

it('sends the old list of a company to its new address', () => {
  renderAt('/platform/companies/c1/sipats');
  expect(screen.getByText('/platform/companies/c1/treinamentos')).toBeInTheDocument();
});
