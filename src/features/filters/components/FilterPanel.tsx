import { ChevronRight, ListFilter } from 'lucide-react';
import { type ReactNode, useId, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HORIZON_META } from '@/features/projects/constants';
import { useSidebarStore } from '@/features/projects/store/sidebarStore';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';

import { countActiveFilters, getFilterFacets, isFiltering } from '../lib/filters';
import { DIMENSION_LABELS, getCategoryLabel, getHorizonLabel, getStatusLabel } from '../lib/labels';
import { useFiltersStore } from '../store/filtersStore';

function pluralize(count: number) {
  return count === 1 ? '1 projeto' : `${String(count)} projetos`;
}

interface FilterOptionProps {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  swatch?: string;
}

function FilterOption({ label, count, checked, onToggle, swatch }: FilterOptionProps) {
  const id = useId();
  return (
    <div className="flex h-7 items-center gap-2 rounded-md px-1.5 hover:bg-accent">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`${label}, ${pluralize(count)}`}
      />
      <label
        htmlFor={id}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm',
          count === 0 && !checked && 'text-muted-foreground',
        )}
      >
        {swatch ? (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: `var(${swatch})` }}
          />
        ) : null}
        <span className="truncate">{label}</span>
        <span className="ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums">
          {count}
        </span>
      </label>
    </div>
  );
}

function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-1 px-1.5 text-label">{legend}</legend>
      {children}
    </fieldset>
  );
}

interface FilterPanelProps {
  /** Projects of the current section, before filtering (for the faceted counts). */
  projects: readonly Project[];
  /** Projects left after filtering. */
  matchCount: number;
}

/**
 * The portfolio filters, in the navigation sidebar: horizon, status and category with
 * faceted counts, how many projects match and "Limpar filtros". Folds to one line.
 */
export function FilterPanel({ projects, matchCount }: FilterPanelProps) {
  const filters = useFiltersStore((state) => state.filters);
  const toggleHorizon = useFiltersStore((state) => state.toggleHorizon);
  const toggleStatus = useFiltersStore((state) => state.toggleStatus);
  const toggleCategory = useFiltersStore((state) => state.toggleCategory);
  const clearAll = useFiltersStore((state) => state.clearAll);
  const open = useSidebarStore((state) => state.filtersOpen);
  const setOpen = useSidebarStore((state) => state.setFiltersOpen);
  const bodyId = useId();

  const facets = useMemo(() => getFilterFacets(projects, filters), [projects, filters]);
  const activeCount = countActiveFilters(filters);
  const filtering = isFiltering(filters);

  return (
    <section aria-label="Filtros" className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={activeCount > 0 ? `Filtros (${String(activeCount)} ativos)` : 'Filtros'}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ListFilter aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1 text-left">Filtros</span>
          {activeCount > 0 ? (
            <span
              key={activeCount}
              aria-hidden="true"
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground tabular-nums motion-safe:animate-pop"
            >
              {activeCount}
            </span>
          ) : null}
          <ChevronRight
            aria-hidden="true"
            className={cn('size-3.5 motion-safe:transition-transform', open && 'rotate-90')}
          />
        </button>
        {filtering ? (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={clearAll}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      <p
        role="status"
        className={cn('px-2.5 text-xs text-muted-foreground tabular-nums', !filtering && 'sr-only')}
      >
        {filtering ? `${String(matchCount)} de ${pluralize(projects.length)}` : ''}
      </p>

      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 pt-1 pb-1">
          <FilterGroup legend={DIMENSION_LABELS.horizons}>
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
          </FilterGroup>
          <FilterGroup legend={DIMENSION_LABELS.statuses}>
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
          </FilterGroup>
          <FilterGroup legend={DIMENSION_LABELS.categories}>
            {facets.categories.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-subtle-foreground">
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
          </FilterGroup>
        </div>
      ) : null}
    </section>
  );
}

/** Collapsed rail: expands it with the filters open; a dot marks active filters. */
export function FilterRailButton() {
  const requestFilters = useSidebarStore((state) => state.requestFilters);
  const activeCount = useFiltersStore((state) => countActiveFilters(state.filters));
  const label = activeCount > 0 ? `Filtros (${String(activeCount)} ativos)` : 'Filtros';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground"
          aria-label={label}
          onClick={requestFilters}
        >
          <ListFilter />
          {activeCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
