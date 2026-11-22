import { z } from 'zod';

import { isoDateSchema, isoDateTimeSchema } from '@/features/projects/schemas';
import { DEPENDENCY_TYPES, SCHEDULING_MODES, type Weekday } from '@/types/schedule';

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

export const scheduleTaskSchema = z.object({
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
  });

export type ProjectScheduleInput = z.input<typeof projectScheduleSchema>;
