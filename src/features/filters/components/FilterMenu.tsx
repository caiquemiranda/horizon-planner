import { ListFilter } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HORIZON_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';

import { countActiveFilters, getFilterFacets, isFiltering } from '../lib/filters';
import { DIMENSION_LABELS, getCategoryLabel, getHorizonLabel, getStatusLabel } from '../lib/labels';
import { useFiltersStore } from '../store/filtersStore';

interface FilterOptionProps {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  swatch?: string;
}

function FilterOption({ label, count, checked, onToggle, swatch }: FilterOptionProps) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      // Keep the menu open so several values can be picked in a row.
      onSelect={(event) => {
        event.preventDefault();
      }}
      onCheckedChange={onToggle}
      className={cn(count === 0 && !checked && 'text-muted-foreground')}
    >
      {swatch ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${swatch})` }}
        />
      ) : null}
      <span className="truncate">{label}</span>
      <span className="ml-auto pl-3 font-mono text-[11px] text-subtle-foreground tabular-nums">
        {count}
      </span>
    </DropdownMenuCheckboxItem>
  );
}

interface FilterMenuProps {
  projects: readonly Project[];
}

/** "Filtros" button with every option grouped by dimension and faceted counts. */
export function FilterMenu({ projects }: FilterMenuProps) {
  const filters = useFiltersStore((state) => state.filters);
  const toggleHorizon = useFiltersStore((state) => state.toggleHorizon);
  const toggleStatus = useFiltersStore((state) => state.toggleStatus);
  const toggleCategory = useFiltersStore((state) => state.toggleCategory);
  const clearAll = useFiltersStore((state) => state.clearAll);

  const facets = useMemo(() => getFilterFacets(projects, filters), [projects, filters]);
  const activeCount = countActiveFilters(filters);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={activeCount > 0 ? `Filtros (${String(activeCount)} ativos)` : 'Filtros'}
          data-active={activeCount > 0 || undefined}
          className="shrink-0 data-active:border-primary/40 data-active:text-foreground"
        >
          <ListFilter />
          <span className="hidden sm:inline">Filtros</span>
          {activeCount > 0 ? (
            <span
              aria-hidden="true"
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground tabular-nums"
            >
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup aria-label={DIMENSION_LABELS.horizons}>
          <DropdownMenuLabel className="text-label">{DIMENSION_LABELS.horizons}</DropdownMenuLabel>
          {facets.horizons.map(({ value, count }) => (
            <FilterOption
              key={value}
              label={getHorizonLabel(value)}
              count={count}
              checked={filters.horizons.includes(value)}
              swatch={HORIZON_META[value].cssVar}
              onToggle={() => {
                toggleHorizon(value);
              }}
            />
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label={DIMENSION_LABELS.statuses}>
          <DropdownMenuLabel className="text-label">{DIMENSION_LABELS.statuses}</DropdownMenuLabel>
          {facets.statuses.map(({ value, count }) => (
            <FilterOption
              key={value}
              label={getStatusLabel(value)}
              count={count}
              checked={filters.statuses.includes(value)}
              onToggle={() => {
                toggleStatus(value);
              }}
            />
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label={DIMENSION_LABELS.categories}>
          <DropdownMenuLabel className="text-label">
            {DIMENSION_LABELS.categories}
          </DropdownMenuLabel>
          {facets.categories.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-subtle-foreground">
              Nenhuma categoria cadastrada.
            </p>
          ) : (
            facets.categories.map(({ value, count }) => (
              <FilterOption
                // `null` (no category) needs a key that no category name can take.
                key={value ?? '\u0000'}
                label={getCategoryLabel(value)}
                count={count}
                checked={filters.categories.includes(value)}
                onToggle={() => {
                  toggleCategory(value);
                }}
              />
            ))
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!isFiltering(filters)} onSelect={clearAll}>
          Limpar filtros
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
