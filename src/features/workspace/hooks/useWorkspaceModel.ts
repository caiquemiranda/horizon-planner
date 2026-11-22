import { useMemo } from 'react';

import { createWorkCalendar, type WorkCalendar } from '@/features/schedule/lib/calendar';
import { formatPredecessors } from '@/features/schedule/lib/dependencies';
import {
  buildTreeIndex,
  flattenVisibleRows,
  getChildren,
  getWbsNumbers,
  type TreeIndex,
  type TreeRow,
} from '@/features/schedule/lib/tree';
import { useScheduleStore } from '@/features/schedule/store';
import type { UUID } from '@/types/project';
import type { ProjectSchedule, ScheduleResult } from '@/types/schedule';

import { useWorkspaceUiStore } from '../store/workspaceUiStore';

/**
 * Everything the TreeGrid (and later the Gantt) derives from the schedule: one list of
 * visible rows shared by both panes, WBS numbers and readable predecessors.
 */
export interface WorkspaceModel {
  schedule: ProjectSchedule;
  result: ScheduleResult;
  index: TreeIndex;
  rows: TreeRow[];
  wbs: Map<UUID, string>;
  idByWbs: Map<string, UUID>;
  predecessors: Map<UUID, string>;
  summaryIds: UUID[];
  calendar: WorkCalendar;
  /** `"1.2 Aquisição"`, for messages and accessible names. */
  describeTask: (id: UUID) => string;
}

/** Case- and accent-insensitive "contains". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export function buildWorkspaceModel(
  schedule: ProjectSchedule,
  result: ScheduleResult,
  collapsedIds: ReadonlySet<UUID>,
  filterText: string,
): WorkspaceModel {
  const index = buildTreeIndex(schedule.tasks);
  const wbs = getWbsNumbers(index);
  const summaryIds = schedule.tasks
    .filter((task) => getChildren(index, task.id).length > 0)
    .map((task) => task.id);
  const expandedIds = new Set(summaryIds.filter((id) => !collapsedIds.has(id)));
  const query = normalize(filterText.trim());
  const rows = flattenVisibleRows(index, {
    expandedIds,
    ...(query === ''
      ? {}
      : {
          matches: (task) =>
            normalize(task.name).includes(query) ||
            normalize(task.assignee ?? '').includes(query) ||
            (wbs.get(task.id) ?? '') === query,
        }),
  });
  const predecessors = new Map(
    schedule.tasks.map((task) => [
      task.id,
      formatPredecessors(task.id, schedule.dependencies, wbs),
    ]),
  );

  return {
    schedule,
    result,
    index,
    rows,
    wbs,
    idByWbs: new Map([...wbs].map(([id, number]) => [number, id])),
    predecessors,
    summaryIds,
    calendar: createWorkCalendar(schedule.calendar),
    describeTask: (id) => {
      const task = index.byId.get(id);
      return task ? `${wbs.get(id) ?? ''} ${task.name}` : '';
    },
  };
}

/** The model of the open project, or `null` while it loads. */
export function useWorkspaceModel(): WorkspaceModel | null {
  const schedule = useScheduleStore((state) => state.schedule);
  const result = useScheduleStore((state) => state.result);
  const collapsedIds = useWorkspaceUiStore((state) => state.collapsedIds);
  const filterText = useWorkspaceUiStore((state) => state.filterText);

  return useMemo(
    () =>
      schedule && result ? buildWorkspaceModel(schedule, result, collapsedIds, filterText) : null,
    [schedule, result, collapsedIds, filterText],
  );
}
