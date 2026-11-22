import {
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import { GridLines } from '@/features/timeline/components/GridLines';
import { TimeRuler } from '@/features/timeline/components/TimeRuler';
import { TodayIndicator } from '@/features/timeline/components/TodayIndicator';
import { useElementWidth } from '@/features/timeline/hooks/useElementWidth';
import { usePointerNavigation } from '@/features/timeline/hooks/usePointerNavigation';
import { useWheelNavigation } from '@/features/timeline/hooks/useWheelNavigation';
import { centerOn, fitRange } from '@/features/timeline/lib/scale';
import { useViewportStoreApi } from '@/features/timeline/store/viewportContext';
import type { WorkspaceModel } from '@/features/workspace/hooks/useWorkspaceModel';
import { WORKSPACE_METRICS } from '@/features/workspace/lib/columns';
import type { UUID } from '@/types/project';
import type { DayNumber } from '@/types/timeline';

import { getBarGeometry, isHorizontallyVisible } from '../lib/geometry';
import { GanttBar } from './GanttBar';

interface GanttPaneProps {
  model: WorkspaceModel;
  /** The table's scroll container: the single source of vertical scroll for both panes. */
  scrollerRef: RefObject<HTMLDivElement | null>;
  selectedId: UUID | null;
  hoveredId: UUID | null;
  onSelect: (id: UUID) => void;
  onHover: (id: UUID | null) => void;
  /** CSS color of the bars (the project color). */
  barColor: string;
  today: DayNumber;
}

const { rowHeight, headerHeight } = WORKSPACE_METRICS;

/**
 * The Gantt chart: time scale on top, then one row per visible table row.
 *
 * Rows come from the same list as the table, and vertical scrolling is the table's: the
 * chart follows its `scrollTop` in the same frame, so a task's bar and row never drift
 * apart. Zoom and horizontal panning only change the viewport, never the tasks.
 *
 * The chart is a visual view of the table; for screen readers and keyboard users the
 * table carries the same information and all the editing.
 */
export function GanttPane({
  model,
  scrollerRef,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  barColor,
  today,
}: GanttPaneProps) {
  const store = useViewportStoreApi();
  const viewport = store((state) => state.viewport);
  const setWidth = store((state) => state.setWidth);
  const sectionRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasFitted = useRef(false);

  useElementWidth(bodyRef, setWidth);
  useWheelNavigation(sectionRef, bodyRef);
  usePointerNavigation(bodyRef, scrollerRef);

  // First time the chart has a width: show the whole schedule (or today when empty).
  const range = model.result.range;
  useEffect(() => {
    if (hasFitted.current || viewport.widthPx <= 0) return;
    hasFitted.current = true;
    store
      .getState()
      .setViewport(
        range ? fitRange(viewport, range.start, range.finish) : centerOn(viewport, today),
      );
  }, [viewport, range, store, today]);

  // Follow the table's vertical scroll without a React render per scroll event.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const sync = () => {
      content.style.transform = `translateY(${String(-scroller.scrollTop)}px)`;
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', sync);
    };
  }, [scrollerRef]);

  // A plain vertical wheel over the chart scrolls the rows (zoom/pan are handled above).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      event.preventDefault();
      scroller.scrollTop += event.deltaY;
    };
    body.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      body.removeEventListener('wheel', handleWheel);
    };
  }, [scrollerRef]);

  const isNonWorkingDay = useCallback(
    (day: DayNumber) => !model.calendar.isWorkingDay(day),
    [model.calendar],
  );

  const bars = useMemo(
    () =>
      model.rows.flatMap((row, index) => {
        const task = model.result.tasks.get(row.task.id);
        if (!task) return [];
        const geometry = getBarGeometry(task, index, viewport, rowHeight);
        return isHorizontallyVisible(geometry, viewport) ? [{ row, task, geometry }] : [];
      }),
    [model, viewport],
  );

  const rowAt = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return model.rows[Math.floor((event.clientY - rect.top) / rowHeight)];
  };

  const selectedIndex = selectedId ? model.rows.findIndex((row) => row.task.id === selectedId) : -1;
  const hoveredIndex = hoveredId ? model.rows.findIndex((row) => row.task.id === hoveredId) : -1;

  return (
    <section
      ref={sectionRef}
      aria-label="Gráfico de Gantt"
      aria-describedby="gantt-description"
      className="relative flex min-w-0 flex-1 flex-col"
      style={{ '--gantt-bar': barColor } as CSSProperties}
    >
      <p id="gantt-description" className="sr-only">
        Mostra ao longo do tempo as mesmas tarefas da tabela. Use a tabela para navegar e editar.
      </p>
      <div className="relative shrink-0 border-b bg-background" style={{ height: headerHeight }}>
        <TimeRuler viewport={viewport} />
        <TodayIndicator viewport={viewport} today={today} variant="ruler" />
      </div>
      <div
        ref={bodyRef}
        data-testid="gantt-body"
        className="relative min-h-0 flex-1 cursor-grab touch-pan-y overflow-clip bg-surface-sunken select-none data-panning:cursor-grabbing"
      >
        <GridLines viewport={viewport} isNonWorkingDay={isNonWorkingDay} />
        <TodayIndicator viewport={viewport} today={today} variant="canvas" />
        {/* Mouse only: the table offers every action of the chart to keyboard users. */}
        <div
          ref={contentRef}
          aria-hidden="true"
          className="absolute inset-x-0 top-0 will-change-transform"
          style={{
            height: model.rows.length * rowHeight,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${String(rowHeight - 1)}px, var(--timeline-grid) ${String(rowHeight - 1)}px ${String(rowHeight)}px)`,
          }}
          onClick={(event) => {
            const row = rowAt(event);
            if (row) onSelect(row.task.id);
          }}
          onMouseMove={(event) => {
            onHover(rowAt(event)?.task.id ?? null);
          }}
          onMouseLeave={() => {
            onHover(null);
          }}
        >
          {hoveredIndex >= 0 && hoveredIndex !== selectedIndex ? (
            <div
              className="absolute inset-x-0 bg-muted/50"
              style={{ top: hoveredIndex * rowHeight, height: rowHeight }}
            />
          ) : null}
          {selectedIndex >= 0 ? (
            <div
              className="absolute inset-x-0 bg-accent"
              style={{ top: selectedIndex * rowHeight, height: rowHeight }}
            />
          ) : null}
          {bars.map(({ row, task, geometry }) => (
            <GanttBar
              key={row.task.id}
              geometry={geometry}
              task={task}
              name={row.task.name}
              wbs={model.wbs.get(row.task.id) ?? ''}
              today={today}
              selected={row.task.id === selectedId}
              highlighted={row.task.id === hoveredId}
              manual={row.task.mode === 'manual'}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
