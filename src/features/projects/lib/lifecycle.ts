import type {
  ISODate,
  ISODateTime,
  Project,
  ProjectLifecycle,
  ProjectStatus,
  StatusChange,
} from '@/types/project';

import { FIELD_LIMITS } from '../constants';

/**
 * Project lifecycle: the only place that changes `status` and `lifecycle`.
 *
 * Status (where the project is in its life), progress (work done) and the plan
 * (`startDate`/`endDate`) are separate: no transition touches the plan or the progress,
 * and reaching 100% or the end date never changes the status by itself.
 *
 * Stored values are kept from version 1: `paused` is shown as "Adiado" and `cancelled`
 * as "Não concluído" (closed without success).
 */

export const LIFECYCLE_ACTIONS = [
  'start',
  'postpone',
  'resume',
  'complete',
  'close',
  'reopen',
] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export type TransitionRequest =
  | { action: 'start'; date: ISODate }
  | {
      action: 'postpone';
      reason: string;
      expectedResumeAt: ISODate | null;
      revisedFinish: ISODate | null;
    }
  | { action: 'resume' }
  | { action: 'complete'; date: ISODate; reason: string | null }
  | { action: 'close'; date: ISODate; reason: string }
  | { action: 'reopen'; reason: string | null };

export interface TransitionContext {
  /** Today in the user's calendar. */
  today: ISODate;
  /** Timestamp recorded in the history. */
  now: ISODateTime;
  /**
   * Leaf tasks of the project's schedule that are not done yet. Completing with pending
   * tasks is an exception and requires a justification.
   */
  pendingTasks?: number;
}

/** A transition the rules refuse; the message is in pt-BR, ready for the user. */
export class LifecycleError extends Error {
  constructor(
    message: string,
    /** The field the message refers to, for inline display. */
    readonly field: 'date' | 'reason' | 'expectedResumeAt' | 'revisedFinish' | 'status',
  ) {
    super(message);
    this.name = 'LifecycleError';
  }
}

interface ActionMeta {
  /** Menu label. */
  label: string;
  from: readonly ProjectStatus[];
  to: ProjectStatus;
}

export const ACTION_META = {
  start: { label: 'Iniciar', from: ['planned'], to: 'in_progress' },
  postpone: { label: 'Adiar', from: ['planned', 'in_progress'], to: 'paused' },
  resume: { label: 'Retomar', from: ['paused'], to: 'in_progress' },
  complete: { label: 'Concluir', from: ['planned', 'in_progress', 'paused'], to: 'completed' },
  close: {
    label: 'Encerrar sem concluir',
    from: ['planned', 'in_progress', 'paused'],
    to: 'cancelled',
  },
  reopen: { label: 'Reabrir', from: ['completed', 'cancelled'], to: 'in_progress' },
} as const satisfies Record<LifecycleAction, ActionMeta>;

/** Statuses a new project may start in; the others are reached through transitions. */
export const INITIAL_STATUSES = ['planned', 'in_progress'] as const satisfies ProjectStatus[];

export function getAvailableActions(status: ProjectStatus): LifecycleAction[] {
  return LIFECYCLE_ACTIONS.filter((action) =>
    (ACTION_META[action].from as readonly ProjectStatus[]).includes(status),
  );
}

/** Lifecycle of a project created now with the given status. */
export function createInitialLifecycle(
  status: ProjectStatus,
  today: ISODate,
  now: ISODateTime,
): ProjectLifecycle {
  return {
    startedAt: status === 'planned' ? null : today,
    completedAt: status === 'completed' ? today : null,
    closedAt: status === 'cancelled' ? today : null,
    closeReason: null,
    postponement:
      status === 'paused' ? { reason: '', expectedResumeAt: null, revisedFinish: null } : null,
    history: [{ from: null, to: status, at: now, effectiveDate: today, reason: null }],
  };
}

function requireReason(value: string | null, message: string): string {
  const reason = value?.trim() ?? '';
  if (reason === '') throw new LifecycleError(message, 'reason');
  if (reason.length > FIELD_LIMITS.lifecycleReasonMax) {
    throw new LifecycleError(
      `O motivo deve ter no máximo ${String(FIELD_LIMITS.lifecycleReasonMax)} caracteres.`,
      'reason',
    );
  }
  return reason;
}

function optionalReason(value: string | null): string | null {
  const reason = value?.trim() ?? '';
  return reason === '' ? null : requireReason(reason, '');
}

/** A day that already happened: work cannot start or end in the future. */
function requirePastOrToday(date: ISODate, today: ISODate, what: string): void {
  if (date > today) throw new LifecycleError(`${what} não pode ser no futuro.`, 'date');
}

/**
 * Applies a transition and returns the new `status` and `lifecycle`.
 *
 * @throws {LifecycleError} when the transition is not allowed from the current status or
 *   its data is incomplete.
 */
export function applyTransition(
  project: Pick<Project, 'status' | 'lifecycle' | 'startDate'>,
  request: TransitionRequest,
  context: TransitionContext,
): { status: ProjectStatus; lifecycle: ProjectLifecycle } {
  const meta = ACTION_META[request.action];
  if (!(meta.from as readonly ProjectStatus[]).includes(project.status)) {
    throw new LifecycleError('Esta mudança de status não é permitida agora.', 'status');
  }

  const { today, now } = context;
  const current = project.lifecycle;
  let lifecycle: ProjectLifecycle;
  let effectiveDate: ISODate = today;
  let reason: string | null = null;

  switch (request.action) {
    case 'start': {
      requirePastOrToday(request.date, today, 'O início');
      effectiveDate = request.date;
      lifecycle = { ...current, startedAt: current.startedAt ?? request.date };
      break;
    }
    case 'postpone': {
      reason = requireReason(request.reason, 'Informe o motivo do adiamento.');
      const { expectedResumeAt, revisedFinish } = request;
      if (!expectedResumeAt && !revisedFinish) {
        throw new LifecycleError(
          'Informe a previsão de retomada ou o novo término previsto.',
          'expectedResumeAt',
        );
      }
      if (expectedResumeAt && expectedResumeAt < today) {
        throw new LifecycleError(
          'A previsão de retomada deve ser hoje ou depois.',
          'expectedResumeAt',
        );
      }
      if (revisedFinish && revisedFinish < (expectedResumeAt ?? today)) {
        throw new LifecycleError(
          expectedResumeAt
            ? 'O novo término deve ser igual ou posterior à retomada.'
            : 'O novo término deve ser hoje ou depois.',
          'revisedFinish',
        );
      }
      lifecycle = { ...current, postponement: { reason, expectedResumeAt, revisedFinish } };
      break;
    }
    case 'resume': {
      lifecycle = { ...current, postponement: null, startedAt: current.startedAt ?? today };
      break;
    }
    case 'complete': {
      requirePastOrToday(request.date, today, 'A conclusão');
      if (current.startedAt && request.date < current.startedAt) {
        throw new LifecycleError('A conclusão deve ser no início ou depois dele.', 'date');
      }
      reason =
        (context.pendingTasks ?? 0) > 0
          ? requireReason(
              request.reason,
              'Há tarefas pendentes: justifique a conclusão mesmo assim.',
            )
          : optionalReason(request.reason);
      effectiveDate = request.date;
      lifecycle = {
        ...current,
        startedAt: current.startedAt ?? request.date,
        completedAt: request.date,
        postponement: null,
      };
      break;
    }
    case 'close': {
      requirePastOrToday(request.date, today, 'O encerramento');
      reason = requireReason(request.reason, 'Informe o motivo do encerramento.');
      effectiveDate = request.date;
      lifecycle = {
        ...current,
        closedAt: request.date,
        closeReason: reason,
        postponement: null,
      };
      break;
    }
    case 'reopen': {
      reason = optionalReason(request.reason);
      lifecycle = { ...current, completedAt: null, closedAt: null, closeReason: null };
      break;
    }
  }

  const change: StatusChange = {
    from: project.status,
    to: meta.to,
    at: now,
    effectiveDate,
    reason,
  };
  return { status: meta.to, lifecycle: { ...lifecycle, history: [...current.history, change] } };
}

/**
 * Derived, never stored: an open project (planned or in progress) whose planned finish
 * has passed. Postponing is a decision, not a delay, so postponed projects are not "late".
 */
export function isProjectLate(project: Pick<Project, 'status' | 'endDate'>, today: ISODate) {
  return (
    (project.status === 'planned' || project.status === 'in_progress') && today > project.endDate
  );
}
