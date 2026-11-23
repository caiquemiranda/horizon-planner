import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { ScheduledTask, TaskKind } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

import type { BarGeometry } from '../../lib/geometry';
import { GanttBar } from '../GanttBar';

/**
 * Regression guard for the approved look of the bars: the progress source changed
 * (task-based roll-up), the drawing must not. Geometry comes from the scale, the fill is
 * the task's percentage from the left, summaries and milestones keep their shapes.
 */
const DAY = 20_780 as DayNumber;

function renderBar(kind: TaskKind, progress: number, width = 240) {
  const task: ScheduledTask = {
    id: `bar-${kind}-${String(progress)}`,
    kind,
    start: DAY,
    finish: kind === 'milestone' ? DAY : DAY + 5,
    duration: kind === 'milestone' ? 0 : 5,
    progress,
    drivingDependencyId: null,
    issues: [],
  };
  const geometry: BarGeometry = {
    id: task.id,
    kind,
    rowIndex: 0,
    x: 120,
    width,
    centerY: 18,
    top: kind === 'summary' ? 14 : 8,
    height: kind === 'summary' ? 8 : 20,
  };
  const { container } = render(
    <TooltipProvider>
      <GanttBar
        geometry={geometry}
        task={task}
        name="Tarefa"
        wbs="1.1"
        today={DAY}
        selected={false}
        highlighted={false}
        manual={false}
      />
    </TooltipProvider>,
  );
  const bar = container.querySelector<HTMLElement>(`[data-bar-id="${task.id}"]`);
  if (!bar) throw new Error('bar not rendered');
  return bar;
}

describe('GanttBar look (unchanged by the progress rule)', () => {
  it.each([0, 25, 50, 67, 99, 100])('fills a task bar from the left to %i%%', (progress) => {
    const bar = renderBar('task', progress);
    expect(bar.dataset.kind).toBe('task');
    expect(bar.style.left).toBe('120px');
    expect(bar.style.width).toBe('240px');
    expect(bar.style.height).toBe('20px');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe(`${String(progress)}%`);
    expect(fill.className).toContain('h-full');
  });

  it('keeps the fill proportional at any zoom (bar width)', () => {
    for (const width of [12, 80, 960]) {
      const bar = renderBar('task', 40, width);
      expect(bar.style.width).toBe(`${String(width)}px`);
      expect((bar.firstElementChild as HTMLElement).style.width).toBe('40%');
    }
  });

  it('draws summaries as a thin bracket bar with no progress fill', () => {
    const bar = renderBar('summary', 67);
    expect(bar.dataset.kind).toBe('summary');
    expect(bar.style.height).toBe('8px');
    expect(bar.querySelectorAll('span')).toHaveLength(2);
    expect(bar.querySelector('[style*="%"]')).toBeNull();
  });

  it('draws milestones as a diamond, hollow until done', () => {
    const open = renderBar('milestone', 0).firstElementChild as HTMLElement;
    const done = renderBar('milestone', 100).firstElementChild as HTMLElement;
    expect(open.className).toContain('rotate-45');
    expect(open.className).toContain('bg-background');
    expect(done.className).not.toContain('bg-background');
  });
});
