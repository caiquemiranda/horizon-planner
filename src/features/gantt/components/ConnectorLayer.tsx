import { memo, useState } from 'react';

import { cn } from '@/lib/utils';
import type { UUID } from '@/types/project';

import type { ConnectorShape } from '../lib/connectorLayout';

interface ConnectorLayerProps {
  shapes: readonly ConnectorShape[];
  width: number;
  height: number;
  /** Links touching this task are emphasized (the selected task). */
  emphasizedTaskId: UUID | null;
  /** The link open in the links dialog. */
  activeLinkId: UUID | null;
  onOpenLink?: (dependencyId: UUID) => void;
}

/**
 * Dependency connectors as an SVG overlay in the chart's coordinate system (the same
 * one as the bars), redrawn from the current geometry on every change: dates, zoom, pan,
 * rows, collapse, split width or scroll never leave a connector behind.
 *
 * States are not only colors: hover and selection thicken the line, a link the
 * successor does not respect is dashed.
 */
export const ConnectorLayer = memo(function ConnectorLayer({
  shapes,
  width,
  height,
  emphasizedTaskId,
  activeLinkId,
  onOpenLink,
}: ConnectorLayerProps) {
  const [hoveredId, setHoveredId] = useState<UUID | null>(null);

  return (
    <svg
      data-testid="connector-layer"
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={Math.max(width, 0)}
      height={Math.max(height, 0)}
      aria-hidden="true"
    >
      {shapes.map(({ dependency, path, arrow, violated }) => {
        const emphasized =
          emphasizedTaskId !== null &&
          (dependency.predecessorId === emphasizedTaskId ||
            dependency.successorId === emphasizedTaskId);
        const active = activeLinkId === dependency.id || hoveredId === dependency.id;

        return (
          <g
            key={dependency.id}
            data-link-id={dependency.id}
            data-link-type={dependency.type}
            data-state={
              violated ? 'violated' : active ? 'active' : emphasized ? 'emphasized' : 'normal'
            }
            className={cn(
              'text-muted-foreground/70',
              emphasized && 'text-foreground',
              active && 'text-ring',
              violated && 'text-destructive',
            )}
          >
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2.25 : emphasized ? 1.75 : 1.25}
              strokeDasharray={violated ? '4 3' : undefined}
              strokeLinejoin="round"
            />
            <polygon points={arrow} fill="currentColor" />
            {onOpenLink ? (
              // Wide transparent stroke: a comfortable target to click the link.
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                data-no-pan=""
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(event) => {
                  // Keep the chart from starting a pan.
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenLink(dependency.id);
                }}
                onMouseEnter={() => {
                  setHoveredId(dependency.id);
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
});
