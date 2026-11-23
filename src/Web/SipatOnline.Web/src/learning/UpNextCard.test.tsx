import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import UpNextCard from './UpNextCard';

describe('UpNextCard', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('counts down and starts the next video by itself', () => {
    const onPlay = vi.fn();
    render(<UpNextCard onCancel={vi.fn()} onPlay={onPlay} seconds={3} title="Próximos passos" />);
    expect(screen.getByText('Próximo vídeo em 3s')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1200); });
    expect(screen.getByText('Próximo vídeo em 2s')).toBeInTheDocument();
    expect(onPlay).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('stays on the video when cancelled, by the button or by Esc', () => {
    const onCancel = vi.fn();
    render(<UpNextCard onCancel={onCancel} onPlay={vi.fn()} title="Próximos passos" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
