import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { type FilterDimension, isFiltering, type ProjectFilters } from '../lib/filters';
import { DIMENSION_LABELS, getCategoryLabel, getHorizonLabel, getStatusLabel } from '../lib/labels';
import { useFiltersStore } from '../store/filtersStore';

function describeValues(filters: ProjectFilters, dimension: FilterDimension): string {
  switch (dimension) {
    case 'horizons':
      return filters.horizons.map(getHorizonLabel).join(', ');
    case 'statuses':
      return filters.statuses.map(getStatusLabel).join(', ');
    case 'categories':
      return filters.categories.map(getCategoryLabel).join(', ');
  }
}

const DIMENSIONS: readonly FilterDimension[] = ['horizons', 'statuses', 'categories'];

interface ActiveFiltersBarProps {
  matchCount: number;
  totalCount: number;
}

/** Strip above the timeline listing the active filters, shown only while filtering. */
export function ActiveFiltersBar({ matchCount, totalCount }: ActiveFiltersBarProps) {
  const filters = useFiltersStore((state) => state.filters);
  const clearDimension = useFiltersStore((state) => state.clearDimension);
  const clearAll = useFiltersStore((state) => state.clearAll);

  if (!isFiltering(filters)) return null;

  return (
    <div
      role="region"
      aria-label="Filtros ativos"
      className="flex shrink-0 animate-fade-in flex-wrap items-center gap-2 border-b bg-background px-3 py-1.5 sm:px-4"
    >
      <ul className="flex flex-wrap items-center gap-1.5">
        {DIMENSIONS.filter((dimension) => filters[dimension].length > 0).map((dimension) => {
          const label = DIMENSION_LABELS[dimension];
          return (
            <li
              key={dimension}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-surface-sunken pr-0.5 pl-2 text-xs"
            >
              <span className="text-muted-foreground">{label}:</span>
              <span className="max-w-56 truncate font-medium">
                {describeValues(filters, dimension)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remover filtro de ${label.toLowerCase()}`}
                className="size-5 text-muted-foreground"
                onClick={() => {
                  clearDimension(dimension);
                }}
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={clearAll}>
        Limpar filtros
      </Button>

      <p role="status" className="ml-auto text-xs text-muted-foreground tabular-nums">
        {matchCount} de {totalCount} {totalCount === 1 ? 'projeto' : 'projetos'}
      </p>
    </div>
  );
}
