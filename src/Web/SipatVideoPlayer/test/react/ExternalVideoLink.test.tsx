import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ExternalVideoLink from '../../src/react/ExternalVideoLink';

afterEach(cleanup);

describe('ExternalVideoLink', () => {
  it.each([['YouTube', 'dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'], ['Vimeo', '76979871', 'https://vimeo.com/76979871']] as const)(
    'offers the outside link (%s)', (provider, id, href) => {
      const { container } = render(<ExternalVideoLink externalId={id} provider={provider} />);
      const link = screen.getByRole('link', { name: `Abrir no ${provider}` });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('target', '_blank');
      expect(container.querySelector('.sipat-player-outside')).toHaveTextContent(`Não abriu? Abrir no ${provider}`);
    });

  it('renders nothing for an invalid id and does not throw', () => {
    const { container } = render(<ExternalVideoLink externalId="a/b" provider="YouTube" />);
    expect(container).toBeEmptyDOMElement();
  });
});
