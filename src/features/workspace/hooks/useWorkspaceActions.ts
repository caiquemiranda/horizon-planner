import { useMemo } from 'react';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import {
  createTask,
  deleteTask,
  duplicateTask,
  indentTask,
  moveTask,
  outdentTask,
  setPredecessors,
  shiftTask,
  type TaskPatch,
  updateTask,
} from '@/features/schedule/lib/commands';
import { parsePredecessors } from '@/features/schedule/lib/dependencies';
import { ScheduleRuleError } from '@/features/schedule/lib/errors';
import { getChildren } from '@/features/schedule/lib/tree';
import { generateScheduleId, useScheduleStore } from '@/features/schedule/store';
import type { ISODate, UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { defaultStartFor } from '../lib/cells';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';
import type { WorkspaceModel } from './useWorkspaceModel';

/**
 * User commands of the workspace. Each one runs a domain command through the schedule
 * store (the same path for table, toolbar and, later, the Gantt), so rules are checked
 * in one place. Rule violations are shown as a notice and change nothing.
 */
export interface WorkspaceActions {
  /** New task right below `referenceId` (same level), or at the end of the project. */
  addTask: (referenceId: UUID | null) => UUID | null;
  /** New last child of `parentId`, which is expanded. */
  addSubtask: (parentId: UUID) => UUID | null;
  indent: (id: UUID) => void;
  outdent: (id: UUID) => void;
  move: (id: UUID, direction: -1 | 1) => void;
  /** Moves a task (and its subtree) under another parent, at a position. */
  moveTo: (id: UUID, parentId: UUID | null, position: number) => boolean;
  duplicate: (id: UUID) => UUID | null;
  remove: (id: UUID) => void;
  /** Returns an error message, or `null` when the change was applied. */
  update: (id: UUID, patch: TaskPatch) => string | null;
  /** Parses and applies the "Predecessoras" cell. Returns an error message or `null`. */
  setPredecessorsText: (id: UUID, text: string) => string | null;
}

export function useWorkspaceActions(
  model: WorkspaceModel | null,
  projectStart: ISODate,
): WorkspaceActions {
  const apply = useScheduleStore((state) => state.apply);
  const show = useNoticeStore((state) => state.show);
  const select = useWorkspaceUiStore((state) => state.select);
  const setCollapsed = useWorkspaceUiStore((state) => state.setCollapsed);

  return useMemo(() => {
    /** Runs a command; shows the rule message when it is refused. */
    const run = (command: (schedule: ProjectSchedule) => ProjectSchedule): boolean => {
      const result = apply(command);
      if (!result.ok) show(result.error);
      return result.ok;
    };

    /** Runs a command that may throw a rule error and returns its message. */
    const runForMessage = (command: (schedule: ProjectSchedule) => ProjectSchedule) => {
      const result = apply(command);
      return result.ok ? null : result.error;
    };

    const create = (
      parentId: UUID | null,
      position: number | undefined,
      startFrom: UUID | null,
    ) => {
      // Holder object: the id is assigned inside the command callback.
      const created: { id: UUID | null } = { id: null };
      const reference = startFrom ? model?.result.tasks.get(startFrom) : undefined;
      const ok = run((schedule) => {
        const result = createTask(
          schedule,
          {
            name: 'Nova tarefa',
            parentId,
            ...(position === undefined ? {} : { position }),
            start: defaultStartFor(reference, projectStart),
            duration: 1,
          },
          generateScheduleId,
        );
        created.id = result.taskId;
        return result.schedule;
      });
      if (ok && created.id) select(created.id);
      return ok ? created.id : null;
    };

    return {
      addTask: (referenceId) => {
        const task = referenceId ? model?.index.byId.get(referenceId) : undefined;
        if (!task || !model) return create(null, undefined, null);
        const siblings = getChildren(model.index, task.parentId);
        const position = siblings.findIndex((sibling) => sibling.id === task.id) + 1;
        return create(task.parentId, position, task.id);
      },
      addSubtask: (parentId) => {
        const id = create(parentId, undefined, parentId);
        if (id) setCollapsed(parentId, false);
        return id;
      },
      indent: (id) => {
        if (run((schedule) => indentTask(schedule, id))) {
          const parentId = useScheduleStore
            .getState()
            .schedule?.tasks.find((task) => task.id === id)?.parentId;
          if (parentId) setCollapsed(parentId, false);
        }
      },
      outdent: (id) => {
        run((schedule) => outdentTask(schedule, id));
      },
      move: (id, direction) => {
        run((schedule) => shiftTask(schedule, id, direction));
      },
      moveTo: (id, parentId, position) =>
        run((schedule) => moveTask(schedule, id, parentId, position)),
      duplicate: (id) => {
        const copy: { id: UUID | null } = { id: null };
        const ok = run((schedule) => {
          const copied = duplicateTask(schedule, id, generateScheduleId);
          copy.id = copied.taskId;
          return copied.schedule;
        });
        if (ok && copy.id) select(copy.id);
        return ok ? copy.id : null;
      },
      remove: (id) => {
        if (run((schedule) => deleteTask(schedule, id).schedule)) select(null);
      },
      update: (id, patch) => runForMessage((schedule) => updateTask(schedule, id, patch)),
      setPredecessorsText: (id, text) => {
        if (!model) return 'O cronograma ainda não foi carregado.';
        let parsed;
        try {
          parsed = parsePredecessors(text, model.idByWbs);
        } catch (error) {
          if (error instanceof ScheduleRuleError) return error.message;
          throw error;
        }
        return runForMessage((schedule) =>
          setPredecessors(schedule, id, parsed, generateScheduleId),
        );
      },
    };
  }, [apply, show, select, setCollapsed, model, projectStart]);
}
