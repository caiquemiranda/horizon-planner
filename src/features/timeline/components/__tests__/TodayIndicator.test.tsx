import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
