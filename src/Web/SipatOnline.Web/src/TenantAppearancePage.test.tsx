import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantAppearancePage from './TenantAppearancePage';
import { colorContrast, tenantTheme } from './branding';
import { saveTenantAppearance, type TenantBranding } from './api';

vi.mock('./api', () => ({ saveTenantAppearance: vi.fn() }));
const tenant: TenantBranding = {
  tenantKey: 'acme', tenantName: 'Acme', logoReference: '/logo.png',
  primaryColor: '#123456', secondaryColor: '#FFFFFF', customDomain: null,
};
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('company identity settings', () => {
  it('previews picker and HEX changes locally and discards without publishing', async () => {
    render(<TenantAppearancePage tenant={tenant} onSaved={vi.fn()} />);
    const user = userEvent.setup();
    expect(screen.getByText('Identidade visual publicada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar identidade visual' })).not.toBeInTheDocument();
    const picker = screen.getByLabelText('Selecionar cor principal');
    fireEvent.change(picker, { target: { value: '#234567' } });
    expect(screen.getByLabelText('Cor principal (HEX)')).toHaveValue('#234567');
    expect(screen.getByText('Continuar curso').closest('.appearance-preview')).toHaveStyle('--brand-primary: #234567');
    expect(screen.getByText('Alterações não publicadas')).toBeVisible();
    const hex = screen.getByLabelText('Cor principal (HEX)');
    await user.clear(hex); await user.type(hex, '#345678');
    expect(picker).toHaveValue('#345678');
    expect(saveTenantAppearance).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(hex).toHaveValue('#123456');
    expect(screen.getByText('Identidade visual publicada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Salvar identidade visual' })).not.toBeInTheDocument();
  });

  it('blocks invalid HEX but accepts low-contrast colors', async () => {
    render(<TenantAppearancePage tenant={tenant} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Cor principal (HEX)'), { target: { value: '#ZZZZZZ' } });
    expect(screen.getByLabelText('Cor principal (HEX)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Salvar identidade visual' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Cor principal (HEX)'), { target: { value: '#777777' } });
    expect(screen.queryByText(/contraste/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar identidade visual' })).toBeEnabled();
    expect(saveTenantAppearance).not.toHaveBeenCalled();
  });

  it('publishes a login banner and rejects unsupported banner files', async () => {
    const onSaved = vi.fn();
    const banner = new File(['banner-content'], 'banner.png', { type: 'image/png' });
    const saved = { ...tenant, bannerReference: '/api/tenant/banner/acme?v=1a' };
    vi.mocked(saveTenantAppearance).mockResolvedValue(saved);
    render(<TenantAppearancePage tenant={tenant} onSaved={onSaved} />);
    const user = userEvent.setup({ applyAccept: false });
    expect(screen.getByText(/Nenhum banner/)).toBeVisible();
    await user.upload(screen.getByLabelText('Selecionar banner da entrada'), new File(['x'], 'animado.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione um banner PNG, JPEG ou WebP de até 1,5 MB.');
    await user.upload(screen.getByLabelText('Selecionar banner da entrada'), banner);
    await screen.findByText('banner.png · pronto para salvar');
    expect(screen.getByRole('img', { name: 'Prévia do banner da entrada' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(saveTenantAppearance).toHaveBeenCalledWith({
      primaryColor: '#123456', secondaryColor: '#FFFFFF', logoBase64: null, removeLogo: false,
      bannerBase64: btoa('banner-content'), removeBanner: false,
    });
  });

  it('publishes the chosen logo and colors together and updates the portal only after success', async () => {
    const onSaved = vi.fn();
    const logo = new File(['png-content'], 'company.png', { type: 'image/png' });
    const saved = { ...tenant, primaryColor: '#234567', logoReference: '/api/tenant/logo/acme?v=1234567890abcdef' };
    vi.mocked(saveTenantAppearance).mockResolvedValue(saved);
    render(<TenantAppearancePage tenant={tenant} onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Selecionar logo PNG'), logo);
    await screen.findByText('company.png · pronto para salvar');
    fireEvent.change(screen.getByLabelText('Selecionar cor principal'), { target: { value: '#234567' } });
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(saveTenantAppearance).toHaveBeenCalledWith({
      primaryColor: '#234567', secondaryColor: '#FFFFFF', logoBase64: btoa('png-content'), removeLogo: false,
      bannerBase64: null, removeBanner: false,
    });
    expect(await screen.findByText(/Identidade visual salva/)).toBeVisible();
  });

  it('keeps unsaved changes on failure and lets the administrator retry removal', async () => {
    const onSaved = vi.fn();
    vi.mocked(saveTenantAppearance).mockRejectedValueOnce(new Error('Falha ao salvar a identidade visual.'))
      .mockResolvedValueOnce({ ...tenant, logoReference: null });
    render(<TenantAppearancePage tenant={tenant} onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remover logo' }));
    expect(screen.getByRole('img', { name: 'Prévia da logo da empresa' })).toHaveAttribute('src', '/favicon.svg');
    await user.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar a identidade visual.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar identidade visual' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...tenant, logoReference: null }));
    expect(saveTenantAppearance).toHaveBeenLastCalledWith({
      primaryColor: '#123456', secondaryColor: '#FFFFFF', logoBase64: null, removeLogo: true,
      bannerBase64: null, removeBanner: false,
    });
  });

  it('rejects oversized uploads while preserving the published logo', async () => {
    render(<TenantAppearancePage tenant={tenant} onSaved={vi.fn()} />);
    await userEvent.setup().upload(screen.getByLabelText('Selecionar logo PNG'),
      new File([new Uint8Array(262145)], 'large.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione uma logo PNG de até 256 KB.');
    expect(screen.getByRole('img', { name: 'Prévia da logo da empresa' })).toHaveAttribute('src', '/logo.png');
    expect(saveTenantAppearance).not.toHaveBeenCalled();
  });

  it('keeps light brand colors exact on buttons while deriving accessible navigation accents', () => {
    expect(colorContrast('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(colorContrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
    expect(colorContrast('#000000', '#FFFFFF')).toBe(21);
    const theme = tenantTheme('#FFFF00', '#000000') as Record<string, string>;
    expect(theme['--brand-primary']).toBe('#FFFF00');
    expect(theme['--brand-secondary']).toBe('#000000');
    expect(colorContrast(theme['--green'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
