import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import LoadingState from './LoadingState';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('loading feedback', () => {
  it('announces the actual task without invented progress and pauses when the tab is hidden', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(<LoadingState>Carregando participantes...</LoadingState>);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Carregando participantes...');
    expect(status.querySelector('.loading-brand-gear')).toHaveAttribute('src', '/favicon.svg');
    expect(status).toHaveAttribute('data-motion-paused', 'false');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(status).toHaveAttribute('data-motion-paused', 'true');
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(status).toHaveAttribute('data-motion-paused', 'false');
  });

  it('pauses offscreen motion and disconnects its observer on unmount', () => {
    let update: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { update = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const view = render(<LoadingState>Carregando cursos...</LoadingState>);
    const status = screen.getByRole('status');
    expect(observe).toHaveBeenCalledWith(status);
    act(() => update?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(status).toHaveAttribute('data-motion-paused', 'true');
    act(() => update?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(status).toHaveAttribute('data-motion-paused', 'false');
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
