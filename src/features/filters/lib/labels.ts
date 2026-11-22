import { HORIZON_META, STATUS_META } from '@/features/projects/constants';
import type { Horizon, ProjectStatus } from '@/types/project';

import { type CategoryKey, type FilterDimension, NO_CATEGORY } from './filters';

export const DIMENSION_LABELS: Record<FilterDimension, string> = {
  horizons: 'Horizonte',
  statuses: 'Status',
  categories: 'Categoria',
};

export const NO_CATEGORY_LABEL = 'Sem categoria';

export function getHorizonLabel(horizon: Horizon): string {
  return HORIZON_META[horizon].label;
}

export function getStatusLabel(status: ProjectStatus): string {
  return STATUS_META[status].label;
}

export function getCategoryLabel(category: CategoryKey): string {
  return category === NO_CATEGORY ? NO_CATEGORY_LABEL : category;
}
