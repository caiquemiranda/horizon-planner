import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import { isoDateToDay } from '../../lib/time';
import { GridLines } from '../GridLines';
import { TimeRuler } from '../TimeRuler';

const MARCH_1 = isoDateToDay('2026-03-01' as ISODate);

describe('TimeRuler', () => {
  it('shows months on top and weeks below at the "months" zoom', () => {
    render(<TimeRuler viewport={{ startDay: MARCH_1, pxPerDay: 6.5, widthPx: 1200 }} />);

    expect(screen.getByText('Março 2026')).toBeInTheDocument();
    expect(screen.getByText('Abril 2026')).toBeInTheDocument();
    // Weeks start on Sunday (pt-BR): 8 March 2026 is the first full week.
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
  });

  it('shows years and quarters when zoomed out', () => {
    render(<TimeRuler viewport={{ startDay: MARCH_1, pxPerDay: 0.33, widthPx: 1200 }} />);

    expect(screen.getByText('2027')).toBeInTheDocument();
    expect(screen.getAllByText('T1').length).toBeGreaterThan(0);
  });

  it('renders nothing before the width is measured', () => {
    const { container } = render(
      <TimeRuler viewport={{ startDay: MARCH_1, pxPerDay: 6.5, widthPx: 0 }} />,
    );

    expect(container).not.toHaveTextContent(/\w/);
  });
});

describe('GridLines', () => {
  it('draws one line per tick without duplicating major boundaries', () => {
    const { container } = render(
      <GridLines viewport={{ startDay: MARCH_1, pxPerDay: 6.5, widthPx: 1200 }} />,
    );
    const lefts = Array.from(container.querySelectorAll<HTMLElement>('[style]')).map(
      (line) => line.style.left,
    );

    expect(lefts.length).toBeGreaterThan(5);
    expect(new Set(lefts).size).toBe(lefts.length);
  });
});
