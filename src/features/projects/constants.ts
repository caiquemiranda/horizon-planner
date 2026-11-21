import type { Horizon, ProjectColor, ProjectStatus } from '@/types/project';

/** Current version of the persisted / exported data format. */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** Validation limits shared by the schemas and the form. */
export const FIELD_LIMITS = {
  titleMax: 120,
  descriptionMax: 5000,
  categoryMax: 40,
  milestoneTitleMax: 120,
  milestonesMax: 50,
} as const;

export const DEFAULT_HORIZON: Horizon = 'short';
export const DEFAULT_STATUS: ProjectStatus = 'planned';
export const DEFAULT_COLOR: ProjectColor = 'blue';

interface HorizonMeta {
  label: string;
  shortLabel: string;
  description: string;
  /** CSS variable defined in `src/styles/globals.css`. */
  cssVar: `--horizon-${Horizon}`;
}

export const HORIZON_META = {
  short: {
    label: 'Curto prazo',
    shortLabel: 'Curto',
    description: 'Até 3 meses',
    cssVar: '--horizon-short',
  },
  medium: {
    label: 'Médio prazo',
    shortLabel: 'Médio',
    description: 'De 3 a 12 meses',
    cssVar: '--horizon-medium',
  },
  long: {
    label: 'Longo prazo',
    shortLabel: 'Longo',
    description: 'Mais de 12 meses',
    cssVar: '--horizon-long',
  },
} as const satisfies Record<Horizon, HorizonMeta>;

/**
 * Maximum duration (in days, inclusive) used to *suggest* a horizon from a date range.
 * The user always has the final say.
 */
export const HORIZON_SUGGESTION_MAX_DAYS = {
  short: 92,
  medium: 366,
} as const;

interface StatusMeta {
  label: string;
  /** Closed projects no longer count as active work. */
  isClosed: boolean;
}

export const STATUS_META = {
  planned: { label: 'Planejado', isClosed: false },
  in_progress: { label: 'Em andamento', isClosed: false },
  paused: { label: 'Pausado', isClosed: false },
  completed: { label: 'Concluído', isClosed: true },
  cancelled: { label: 'Cancelado', isClosed: true },
} as const satisfies Record<ProjectStatus, StatusMeta>;

interface ColorMeta {
  label: string;
  /**
   * Literal Tailwind class so the compiler can detect it.
   * Never build these class names dynamically.
   */
  swatchClassName: string;
}

export const COLOR_META = {
  slate: { label: 'Ardósia', swatchClassName: 'bg-slate-500' },
  blue: { label: 'Azul', swatchClassName: 'bg-blue-500' },
  violet: { label: 'Violeta', swatchClassName: 'bg-violet-500' },
  pink: { label: 'Rosa', swatchClassName: 'bg-pink-500' },
  red: { label: 'Vermelho', swatchClassName: 'bg-red-500' },
  orange: { label: 'Laranja', swatchClassName: 'bg-orange-500' },
  amber: { label: 'Âmbar', swatchClassName: 'bg-amber-500' },
  green: { label: 'Verde', swatchClassName: 'bg-green-500' },
  teal: { label: 'Turquesa', swatchClassName: 'bg-teal-500' },
  cyan: { label: 'Ciano', swatchClassName: 'bg-cyan-500' },
} as const satisfies Record<ProjectColor, ColorMeta>;
