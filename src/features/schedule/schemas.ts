import { z } from 'zod';

import { isoDateSchema, isoDateTimeSchema } from '@/features/projects/schemas';
import {
  CHECK_IN_STATES,
  DEPENDENCY_TYPES,
  SCHEDULING_MODES,
  type Weekday,
} from '@/types/schedule';

import { TASK_LIMITS } from './lib/commands';
import { LAG_LIMIT } from './lib/dependencies';
import { findHierarchyProblems } from './lib/tree';

/**
 * Runtime validation for persisted and imported schedules. The domain commands keep data
 * valid while editing; these schemas protect the app from anything read from storage.
 * Ids are free-form non-empty strings so tests and future backends can choose them.
 */

const idSchema = z.string().min(1).max(100);

export const weekdaySchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .transform((value) => value as Weekday);

export const calendarSchema = z.object({
  workingWeekdays: z
    .array(weekdaySchema)
    .min(1, { error: 'O calendário precisa de pelo menos um dia útil.' })
    .max(7),
  holidays: z.array(z.object({ date: isoDateSchema, name: z.string().max(120) })).max(1000),
});

/**
 * Schedules stored before daily check-ins have no `completedWork` nor actual dates: the
 * work done is taken from the percentage (`progress × duration`), and the actual dates
 * stay unknown. Applies to storage and backups alike.
 */
function upgradeTask(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const task = raw as Record<string, unknown>;
  if (task.completedWork !== undefined) return raw;
  const progress = typeof task.progress === 'number' ? task.progress : 0;
  const duration = typeof task.duration === 'number' ? task.duration : 0;
  return {
    ...task,
    completedWork: Math.round(((progress * duration) / 100) * 1000) / 1000,
    actualStart: task.actualStart ?? null,
    actualFinish: task.actualFinish ?? null,
  };
}

const scheduleTaskFieldsSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  order: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(TASK_LIMITS.nameMax),
  assignee: z.string().max(TASK_LIMITS.assigneeMax).nullable(),
  notes: z.string().max(TASK_LIMITS.notesMax),
  mode: z.enum(SCHEDULING_MODES),
  start: isoDateSchema,
  duration: z.number().int().min(0).max(TASK_LIMITS.durationMax),
  progress: z.number().int().min(0).max(100),
  completedWork: z.number().min(0).max(TASK_LIMITS.durationMax),
  actualStart: isoDateSchema.nullable(),
  actualFinish: isoDateSchema.nullable(),
});

export const scheduleTaskSchema = z.preprocess(upgradeTask, scheduleTaskFieldsSchema);

export const checkInSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  workDate: isoDateSchema,
  state: z.enum(CHECK_IN_STATES),
  units: z.number().min(0).max(TASK_LIMITS.durationMax),
  recordedAt: isoDateTimeSchema,
});

export const dependencySchema = z.object({
  id: idSchema,
  predecessorId: idSchema,
  successorId: idSchema,
  type: z.enum(DEPENDENCY_TYPES),
  lag: z.number().int().min(-LAG_LIMIT).max(LAG_LIMIT),
});

export const projectScheduleSchema = z
  .object({
    projectId: idSchema,
    revision: z.number().int().nonnegative(),
    calendar: calendarSchema,
    tasks: z.array(scheduleTaskSchema).max(TASK_LIMITS.tasksMax),
    dependencies: z.array(dependencySchema),
    // Absent in schedules stored before daily check-ins.
    checkIns: z.array(checkInSchema).max(100_000).default([]),
    // Absent in schedules stored before baselines.
    baseline: z
      .object({
        savedAt: isoDateTimeSchema,
        finish: isoDateSchema,
        tasks: z.record(idSchema, z.object({ start: isoDateSchema, finish: isoDateSchema })),
      })
      .nullable()
      .default(null),
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((schedule, ctx) => {
    for (const problem of findHierarchyProblems(schedule.tasks)) {
      ctx.addIssue({ code: 'custom', path: ['tasks'], message: problem });
    }

    const taskIds = new Set(schedule.tasks.map((task) => task.id));
    const linkIds = new Set<string>();
    schedule.dependencies.forEach((link, index) => {
      if (linkIds.has(link.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', index, 'id'],
          message: 'Vínculo duplicado.',
        });
      }
      linkIds.add(link.id);
      if (!taskIds.has(link.predecessorId) || !taskIds.has(link.successorId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', index],
          message: 'Vínculo com uma tarefa inexistente.',
        });
      }
      if (link.predecessorId === link.successorId) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', index],
          message: 'Uma tarefa não pode depender dela mesma.',
        });
      }
    });

    const days = new Set<string>();
    schedule.checkIns.forEach((checkIn, index) => {
      if (!taskIds.has(checkIn.taskId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['checkIns', index],
          message: 'Confirmação de uma tarefa inexistente.',
        });
      }
      const key = `${checkIn.taskId}|${checkIn.workDate}`;
      if (days.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['checkIns', index],
          message: 'Mais de uma confirmação da mesma tarefa no mesmo dia.',
        });
      }
      days.add(key);
    });
  });

export type ProjectScheduleInput = z.input<typeof projectScheduleSchema>;
