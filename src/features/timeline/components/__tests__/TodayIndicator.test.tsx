import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { dayToX } from '../../lib/scale';
import { getTodayDay } from '../../lib/time';
import { useViewportStore } from '../../store/viewportStore';
import { TimelineToolbar } from '../TimelineToolbar';
import { TodayIndicator } from '../TodayIndicator';

const VIEWPORT = { startDay: 20_000, pxPerDay: 10, widthPx: 1000 };

describe('TodayIndicator', () => {
  it('draws the line at the current moment, with a label on the ruler', () => {
    render(<TodayIndicator viewport={VIEWPORT} today={20_012.5} variant="ruler" />);

    expect(screen.getByTestId('today-ruler').style.left).toBe('125px');
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('draws only the line on the canvas', () => {
    render(<TodayIndicator viewport={VIEWPORT} today={20_012.5} variant="canvas" />);

    expect(screen.getByTestId('today-canvas')).toBeInTheDocument();
    expect(screen.queryByText('Hoje')).not.toBeInTheDocument();
  });

  it('is hidden when today is out of view', () => {
    render(<TodayIndicator viewport={VIEWPORT} today={20_500} variant="ruler" />);

    expect(screen.queryByTestId('today-ruler')).not.toBeInTheDocument();
  });
});

describe('TimelineToolbar', () => {
  it('centers the timeline on today', async () => {
    const user = userEvent.setup();
    useViewportStore.setState({ viewport: VIEWPORT });
    render(
      <TooltipProvider>
        <TimelineToolbar />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Hoje' }));

    expect(dayToX(getTodayDay(), useViewportStore.getState().viewport)).toBeCloseTo(500, 0);
  });

  it('shows the visible date range', () => {
    // 2024-10-04 + 100 days at 10 px/day.
    useViewportStore.setState({ viewport: VIEWPORT });
    render(
      <TooltipProvider>
        <TimelineToolbar />
      </TooltipProvider>,
    );

    expect(screen.getByText('out 2024 – jan 2025')).toBeInTheDocument();
  });
});
