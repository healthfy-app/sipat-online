import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyCertificateLogoPanel from './CompanyCertificateLogoPanel';
import * as api from './api';

vi.mock('./api', () => ({ getCompanyCertificateLogo: vi.fn(), saveCompanyCertificateLogo: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('company certificate identity', () => {
  it('saves the selected company PNG and previews the protected image only after persistence', async () => {
    vi.mocked(api.getCompanyCertificateLogo).mockResolvedValue({ configured: false });
    vi.mocked(api.saveCompanyCertificateLogo).mockResolvedValue({ configured: true });
    const user = userEvent.setup();
    render(<CompanyCertificateLogoPanel companyId="microsoft" />);
    await user.click(screen.getByRole('button', { name: 'Logo do certificado' }));
    expect(await screen.findByRole('button', { name: 'Salvar logo do certificado' })).toBeDisabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const file = new File(['png fixture'], 'microsoft.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Arquivo da logo (PNG)'), file);
    await user.click(screen.getByRole('button', { name: 'Salvar logo do certificado' }));
    expect(api.saveCompanyCertificateLogo).toHaveBeenCalledExactlyOnceWith('microsoft', file);
    expect(await screen.findByText(/Logo salva/)).toBeVisible();
    expect(screen.getByRole('img')).toHaveAttribute('src',
      '/api/platform/companies/microsoft/learning/certificate-logo/image?v=1');
  });
  it('rejects oversized logos and keeps a server failure retryable without showing success', async () => {
    vi.mocked(api.getCompanyCertificateLogo).mockResolvedValue({ configured: false });
    vi.mocked(api.saveCompanyCertificateLogo).mockRejectedValue(new Error('PNG inválido.'));
    const user = userEvent.setup();
    render(<CompanyCertificateLogoPanel companyId="company" />);
    await user.click(screen.getByRole('button', { name: 'Logo do certificado' }));
    const field = await screen.findByLabelText('Arquivo da logo (PNG)');
    await user.upload(field, new File([new Uint8Array(256 * 1024 + 1)], 'big.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('até 256 KB');
    expect(api.saveCompanyCertificateLogo).not.toHaveBeenCalled();
    await user.upload(field, new File(['invalid PNG'], 'logo.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Salvar logo do certificado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG inválido.');
    expect(screen.queryByText(/Logo salva/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar logo do certificado' })).toBeEnabled();
  });
});
