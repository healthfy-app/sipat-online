import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePassword, passwordMinLength } from '@/lib/passwordRules';
import { companyAddress } from './CompanyAddress';
import CreateCompanyDialog from './CreateCompanyDialog';

afterEach(cleanup);

describe('New company', () => {
  it('generates readable passwords in three groups of four', () => {
    const password = generatePassword();
    expect(password).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(password).not.toMatch(/[0O1lI]/);
    expect(password.length).toBeGreaterThanOrEqual(passwordMinLength);
    expect(generatePassword()).not.toBe(password);
  });

  it('lets the operator generate, see and copy the first password', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<CreateCompanyDialog onClose={() => undefined} onCreated={async () => undefined} />);

    const field = screen.getByLabelText('Senha inicial temporária');
    expect(field).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /Copiar/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Gerar senha/ }));
    expect(field).toHaveAttribute('type', 'text');
    const generated = (field as HTMLInputElement).value;
    expect(generated).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    await user.click(screen.getByRole('button', { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith(generated);
    expect(screen.getByRole('button', { name: /Copiada/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('shows the portal address with the identifier typed so far', async () => {
    const user = userEvent.setup();
    render(<CreateCompanyDialog onClose={() => undefined} onCreated={async () => undefined} />);
    expect(screen.getByText(companyAddress('identificador'))).toBeVisible();
    await user.type(screen.getByLabelText('Nome da empresa'), 'Aço Forte');
    expect(screen.getByText(companyAddress('aco-forte'))).toBeVisible();
  });
});
