import { z } from 'zod';

import {
  HORIZONS,
  type ISODate,
  type Milestone,
  PROJECT_COLORS,
  PROJECT_STATUSES,
} from '@/types/project';

import { FIELD_LIMITS, SNAPSHOT_SCHEMA_VERSION } from './constants';

/**
 * Runtime validation for untrusted data: imported JSON, `localStorage` and form input.
 * The inferred output types match the domain types in `@/types/project` (checked in tests).
 */

export const isoDateSchema = z.iso
  .date({ error: 'Data inválida (use o formato AAAA-MM-DD).' })
  .transform((value) => value as ISODate);

export const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: 'Data e hora inválidas.',
});

export const uuidSchema = z.uuid({ error: 'Identificador inválido.' });

export const horizonSchema = z.enum(HORIZONS, { error: 'Horizonte inválido.' });
export const projectStatusSchema = z.enum(PROJECT_STATUSES, { error: 'Status inválido.' });
export const projectColorSchema = z.enum(PROJECT_COLORS, { error: 'Cor inválida.' });

const titleSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'O título é obrigatório.' })
    .max(max, { error: `O título deve ter no máximo ${max} caracteres.` });

export const milestoneSchema = z.object({
  id: uuidSchema,
  title: titleSchema(FIELD_LIMITS.milestoneTitleMax),
  date: isoDateSchema,
  completed: z.boolean(),
});

const reasonSchema = z
  .string()
  .trim()
  .max(FIELD_LIMITS.lifecycleReasonMax, {
    error: `O motivo deve ter no máximo ${FIELD_LIMITS.lifecycleReasonMax} caracteres.`,
  });

export const statusChangeSchema = z.object({
  from: projectStatusSchema.nullable(),
  to: projectStatusSchema,
  at: isoDateTimeSchema,
  effectiveDate: isoDateSchema,
  reason: reasonSchema.nullable(),
});

export const postponementSchema = z.object({
  reason: reasonSchema,
  expectedResumeAt: isoDateSchema.nullable(),
  revisedFinish: isoDateSchema.nullable(),
});

/** Shape only; the rules between status and lifecycle live in `lib/lifecycle.ts`. */
export const lifecycleSchema = z.object({
  startedAt: isoDateSchema.nullable(),
  completedAt: isoDateSchema.nullable(),
  closedAt: isoDateSchema.nullable(),
  closeReason: reasonSchema.nullable(),
  postponement: postponementSchema.nullable(),
  history: z.array(statusChangeSchema).max(1000),
});

/** Fields without cross-field rules, so they can be picked / omitted freely. */
const projectFieldsSchema = z.object({
  id: uuidSchema,
  title: titleSchema(FIELD_LIMITS.titleMax),
  description: z.string().max(FIELD_LIMITS.descriptionMax, {
    error: `A descrição deve ter no máximo ${FIELD_LIMITS.descriptionMax} caracteres.`,
  }),
  horizon: horizonSchema,
  category: z
    .string()
    .trim()
    .max(FIELD_LIMITS.categoryMax, {
      error: `A categoria deve ter no máximo ${FIELD_LIMITS.categoryMax} caracteres.`,
    })
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  status: projectStatusSchema,
  color: projectColorSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  progress: z
    .number()
    .int({ error: 'O progresso deve ser um número inteiro.' })
    .min(0, { error: 'O progresso mínimo é 0%.' })
    .max(100, { error: 'O progresso máximo é 100%.' }),
  milestones: z.array(milestoneSchema).max(FIELD_LIMITS.milestonesMax, {
    error: `Um projeto pode ter no máximo ${FIELD_LIMITS.milestonesMax} marcos.`,
  }),
  lifecycle: lifecycleSchema,
  hiddenAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

interface DateRangeWithMilestones {
  startDate: ISODate;
  endDate: ISODate;
  milestones: Milestone[];
}

/**
 * Cross-field invariants:
 * - `endDate` is on or after `startDate`;
 * - every milestone falls inside the project range;
 * - milestone ids are unique.
 *
 * `yyyy-MM-dd` strings sort chronologically, so plain string comparison is safe.
 */
function checkDateInvariants(value: DateRangeWithMilestones, ctx: z.RefinementCtx): void {
  if (value.endDate < value.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data de término deve ser igual ou posterior à data de início.',
    });
  }

  const seenIds = new Set<string>();

  value.milestones.forEach((milestone, index) => {
    if (milestone.date < value.startDate || milestone.date > value.endDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['milestones', index, 'date'],
        message: 'O marco deve estar entre as datas de início e término do projeto.',
      });
    }

    if (seenIds.has(milestone.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['milestones', index, 'id'],
        message: 'Identificador de marco duplicado.',
      });
    }

    seenIds.add(milestone.id);
  });
}

export const projectSchema = projectFieldsSchema.superRefine(checkDateInvariants);

/** Input for creating a project (identity, ordering and audit fields are generated). */
export const projectDraftSchema = projectFieldsSchema
  .omit({
    id: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
    lifecycle: true,
    hiddenAt: true,
    deletedAt: true,
  })
  .superRefine(checkDateInvariants);

export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION, {
      error: 'Versão de dados não suportada.',
    }),
    exportedAt: isoDateTimeSchema,
    projects: z.array(projectSchema),
  })
  .superRefine((value, ctx) => {
    const seenIds = new Set<string>();

    value.projects.forEach((project, index) => {
      if (seenIds.has(project.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projects', index, 'id'],
          message: 'Identificador de projeto duplicado.',
        });
      }

      seenIds.add(project.id);
    });
  });

/** Raw shapes accepted by the schemas (before transforms). */
export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectDraftInput = z.input<typeof projectDraftSchema>;
export type SnapshotInput = z.input<typeof snapshotSchema>;
