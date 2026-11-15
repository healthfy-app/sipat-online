import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarList, HourChart } from './QualityCharts';

afterEach(cleanup);

describe('quality charts', () => {
  it('draws one bar per hour with the share of sessions that stalled', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 10 ? 2 : 0, stalledSessions: hour === 10 ? 1 : 0 }));
    const { container } = render(<HourChart hours={hours} />);

    expect(screen.getAllByTestId('hour-column')).toHaveLength(24);
    expect(screen.getByText('10h: 1 de 2 sessões com travamento')).toBeInTheDocument();
    // only the hour with sessions has a title and a bar
    expect(container.querySelectorAll('title')).toHaveLength(1);
    expect(container.querySelectorAll('rect.fill-muted-foreground')).toHaveLength(1);
  });

  it('lists breakdown items with their share and session count', () => {
    render(<BarList items={[{ label: 'Celular', percent: 12.5, sessions: 8 }, { label: 'Tablet', percent: null, sessions: 0 }]} title="Por aparelho" />);

    expect(screen.getByRole('heading', { name: 'Por aparelho' })).toBeVisible();
    expect(screen.getByText('Celular')).toBeVisible();
    expect(screen.getByText('12,5% · 8 sessões')).toBeVisible();
    expect(screen.getByText('Sem dados · 0 sessões')).toBeVisible();
  });
});
