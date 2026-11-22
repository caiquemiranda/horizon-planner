import { type PointerEvent, useRef } from 'react';

interface ColumnResizerProps {
  width: number;
  onResize: (width: number) => void;
}

/**
 * Drag handle on a column header's right edge. Widths are presentation only: rows keep
 * their height, so the chart stays aligned. The handle is not a tab stop (it would add
 * one stop per column before the table); column visibility is in the "Colunas" menu.
 */
export function ColumnResizer({ width, onResize }: ColumnResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
  };

  return (
    <div
      aria-hidden="true"
      data-column-resizer=""
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => {
        if (drag.current) onResize(drag.current.startWidth + event.clientX - drag.current.startX);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      className="group absolute top-2 right-0 bottom-0 z-10 w-2 translate-x-1/2 cursor-col-resize touch-none"
    >
      <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-ring" />
    </div>
  );
}
