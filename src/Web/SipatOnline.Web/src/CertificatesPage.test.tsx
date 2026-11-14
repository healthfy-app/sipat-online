import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CertificatesPage from './CertificatesPage';
import * as api from './api';

vi.mock('./api', () => ({ listCertificates: vi.fn(), issueCertificate: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const pending: api.CertificateEligibility = { sipatEventId: 'sipat', eventTitle: 'SIPAT Microsoft',
  totalCourses: 2, completedCourses: 1, isEligible: false, certificate: null, hasCompanyLogo: true };
const certificate: api.ParticipationCertificate = { id: 'cert', participantName: 'Maria José', companyName: 'Microsoft',
  eventTitle: 'SIPAT Microsoft', startsAt: '2026-11-01Z', endsAt: '2026-11-10Z', durationMilliseconds: 5055,
  issuedAt: '2026-11-10T12:00:00Z', isDemonstration: true };

describe('certificates', () => {
  it('keeps each SIPAT in its own card, with its period', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([
      { ...pending, sipatEventId: 'new', eventTitle: 'SIPAT 2026', startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-13T00:00:00Z' },
      { ...pending, sipatEventId: 'old', eventTitle: 'SIPAT 2025', startsAt: '2025-11-10T00:00:00Z', endsAt: '2025-11-14T00:00:00Z', certificate },
    ]);
    render(<CertificatesPage />);
    expect(await screen.findByRole('heading', { name: 'SIPAT 2026' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'SIPAT 2025' })).toBeVisible();
    expect(screen.getByText('09/11/2026 a 13/11/2026')).toBeVisible();
    expect(screen.getByText('10/11/2025 a 14/11/2025')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Emitir certificado' })).toHaveLength(1);
  });
  it('explains a missing company logo without asking a completed participant to watch again', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([{ ...pending, completedCourses: 2, hasCompanyLogo: false }]);
    render(<CertificatesPage />);
    expect(await screen.findByText(/A empresa precisa cadastrar a logo/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Emitir certificado' })).toBeDisabled();
    expect(screen.queryByText(/Conclua os dias pendentes/)).not.toBeInTheDocument();
    expect(api.issueCertificate).not.toHaveBeenCalled();
  });
  it('shows actual missing courses and prevents premature issuance', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([pending]);
    render(<CertificatesPage />);
    expect(await screen.findByText('1 de 2 dias concluídos')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Emitir certificado' })).toBeDisabled();
    expect(api.issueCertificate).not.toHaveBeenCalled();
  });
  it('issues an eligible certificate and exposes the authenticated PDF and demonstration warning', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([{ ...pending, completedCourses: 2, isEligible: true }]);
    vi.mocked(api.issueCertificate).mockResolvedValue(certificate);
    render(<CertificatesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Emitir certificado' }));
    expect(await screen.findByRole('link', { name: 'Baixar certificado PDF' })).toHaveAttribute('href', '/api/learning/certificates/cert/pdf');
    expect(screen.getByText('Maria José · Microsoft')).toBeVisible();
    expect(screen.getByText(/Documento demonstrativo/)).toBeVisible();
    expect(api.issueCertificate).toHaveBeenCalledExactlyOnceWith('sipat');
    expect(document.querySelector('.achievement-mark')).toHaveClass('is-celebrating');
    expect(screen.queryByRole('button', { name: 'Emitir certificado' })).not.toBeInTheDocument();
  });
  it('does not replay the achievement animation for a previously issued certificate', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([{ ...pending, certificate }]);
    render(<CertificatesPage />);
    expect(await screen.findByRole('link', { name: 'Baixar certificado PDF' })).toBeVisible();
    expect(document.querySelector('.achievement-mark')).not.toHaveClass('is-celebrating');
  });
  it('keeps a failed issuance retryable without displaying a download or success', async () => {
    vi.mocked(api.listCertificates).mockResolvedValue([{ ...pending, isEligible: true }]);
    vi.mocked(api.issueCertificate).mockRejectedValueOnce(new Error('Falha ao emitir')).mockResolvedValueOnce(certificate);
    render(<CertificatesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Emitir certificado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao emitir');
    expect(screen.queryByRole('link', { name: 'Baixar certificado PDF' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Emitir certificado' }));
    expect(await screen.findByRole('link', { name: 'Baixar certificado PDF' })).toBeVisible();
  });
});
