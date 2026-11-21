import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ExternalVideoPlayer from '../../src/react/ExternalVideoPlayer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const blocked = 'Este vídeo não abriu na sua rede.';
const iframeOf = (container: HTMLElement) => container.querySelector('iframe')!;

describe('ExternalVideoPlayer', () => {
  it('renders the provider iframe inside the player frame', () => {
    const { container } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula externa" />);
    const frame = iframeOf(container);
    expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(frame).toHaveAttribute('title', 'Aula externa');
    expect(frame).toHaveAttribute('allow', 'fullscreen; picture-in-picture');
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(container.firstElementChild).toBe(frame.parentElement);
    expect(frame.parentElement).toHaveClass('sipat-player');
    expect(container.querySelector('.sipat-player-outside')).toBeNull();
  });

  it('shows the message and an outside link when the iframe never loads', () => {
    const { container } = render(<ExternalVideoPlayer externalId="76979871" provider="Vimeo" title="Aula" />);
    act(() => { vi.advanceTimersByTime(7999); });
    expect(screen.queryByText(blocked)).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText(blocked)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Abrir no Vimeo' });
    expect(link).toHaveAttribute('href', 'https://vimeo.com/76979871');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(iframeOf(container)).toBeInTheDocument();
  });

  it('names YouTube in the link', () => {
    render(<ExternalVideoPlayer blockedAfterMs={10} externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    act(() => { vi.advanceTimersByTime(10); });
    expect(screen.getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute('href', 'https://youtu.be/dQw4w9WgXcQ');
  });

  it('never shows the message when the iframe loads in time', () => {
    const { container } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    fireEvent.load(iframeOf(container));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.queryByText(blocked)).toBeNull();
  });

  it('hides the message again if the iframe loads late', () => {
    const { container } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText(blocked)).toBeInTheDocument();
    fireEvent.load(iframeOf(container));
    expect(screen.queryByText(blocked)).toBeNull();
  });

  it('restarts the wait when the video changes', () => {
    const { rerender } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText(blocked)).toBeInTheDocument();
    rerender(<ExternalVideoPlayer externalId="aaaaaaaaaaa" provider="YouTube" title="Aula" />);
    expect(screen.queryByText(blocked)).toBeNull();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText(blocked)).toBeInTheDocument();
  });

  it('clears the timer on unmount', () => {
    const { unmount } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });


  it('does not make the iframe lazy', () => {
    const { container } = render(<ExternalVideoPlayer externalId="dQw4w9WgXcQ" provider="YouTube" title="Aula" />);
    expect(iframeOf(container)).not.toHaveAttribute('loading');
  });

  it('shows an unavailable message for an invalid id instead of throwing', () => {
    const { container } = render(<ExternalVideoPlayer externalId="a/b" provider="YouTube" title="Aula" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Este vídeo não está disponível.');
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('.sipat-player')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
