import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarList, HourChart } from './QualityCharts';

afterEach(cleanup);

describe('quality charts', () => {
  it('draws one bar per hour with the share of sessions that stalled', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 10 ? 2 : 0, stalledSessions: hour === 10 ? 1 : 0 }));
    const { container } = render(<HourChart hours={hours} />);

    expect(screen.getAllByTestId('hour-column')).toHaveLength(24);
    expect(container.querySelector('title')?.textContent).toBe('10h: 1 de 2 sessões com travamento');
    // only the hour with sessions has a title and a bar
    expect(container.querySelectorAll('title')).toHaveLength(1);
    expect(container.querySelectorAll('rect.fill-muted-foreground')).toHaveLength(1);
  });

  it('scales bar heights to the worst hour and labels the top of the axis', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 9 || hour === 10 ? 4 : 0, stalledSessions: hour === 9 ? 1 : hour === 10 ? 2 : 0 }));
    const { container } = render(<HourChart hours={hours} />);

    const heights = Array.from(container.querySelectorAll('rect.fill-muted-foreground')).map(bar => Number(bar.getAttribute('height')));
    expect(heights).toHaveLength(2);
    expect(heights[1] / heights[0]).toBeCloseTo(2);
    expect(screen.getByText('50,0%')).toBeInTheDocument();
  });

  it('draws no bar when nothing stalled and keeps a 10% floor on the axis', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 10 ? 3 : 0, stalledSessions: 0 }));
    const { container } = render(<HourChart hours={hours} />);

    expect(container.querySelectorAll('rect.fill-muted-foreground')).toHaveLength(0);
    expect(screen.getByText('10,0%')).toBeInTheDocument();
  });

  it('gives screen readers the same numbers as a list, one item per hour with sessions', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 10 ? 2 : 0, stalledSessions: hour === 10 ? 1 : 0 }));
    render(<HourChart hours={hours} />);

    const list = screen.getByRole('list', { name: 'Sessões com travamento por hora do dia' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('10h: 1 de 2 sessões com travamento')).toBeInTheDocument();
  });

  it('lists breakdown items with their share and session count', () => {
    render(<BarList items={[{ label: 'Celular', percent: 12.5, sessions: 8 }, { label: 'Tablet', percent: null, sessions: 0 }]} title="Por aparelho" />);

    expect(screen.getByRole('heading', { name: 'Por aparelho' })).toBeVisible();
    expect(screen.getByText('Celular')).toBeVisible();
    expect(screen.getByText('12,5% · 8 sessões')).toBeVisible();
    expect(screen.getByText('Sem dados · 0 sessões')).toBeVisible();
  });
});
