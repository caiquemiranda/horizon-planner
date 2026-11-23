import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import type { ISODate, Project, ProjectStatus } from '@/types/project';

import {
  applyTransition,
  createInitialLifecycle,
  getAvailableActions,
  isProjectLate,
  LifecycleError,
  type TransitionRequest,
} from '../lifecycle';

const TODAY = '2026-11-23' as ISODate;
const NOW = '2026-11-23T14:00:00.000Z';
const context = { today: TODAY, now: NOW };
const d = (value: string) => value as ISODate;

function projectIn(status: ProjectStatus, overrides: Partial<Project> = {}): Project {
  return makeProject({
    status,
    startDate: d('2026-11-02'),
    endDate: d('2026-12-18'),
    lifecycle: {
      ...createInitialLifecycle(status, d('2026-11-02'), '2026-11-02T09:00:00.000Z'),
    },
    ...overrides,
  });
}

/** Applies a chain of transitions, feeding each result to the next. */
function run(project: Project, ...requests: TransitionRequest[]): Project {
  return requests.reduce(
    (current, request) => ({ ...current, ...applyTransition(current, request, context) }),
    project,
  );
}

function errorOf(work: () => unknown): LifecycleError {
  try {
    work();
  } catch (error) {
    if (error instanceof LifecycleError) return error;
    throw error;
  }
  throw new Error('expected a LifecycleError');
}

describe('getAvailableActions', () => {
  it.each<[ProjectStatus, string[]]>([
    ['planned', ['start', 'postpone', 'complete', 'close']],
    ['in_progress', ['postpone', 'complete', 'close']],
    ['paused', ['resume', 'complete', 'close']],
    ['completed', ['reopen']],
    ['cancelled', ['reopen']],
  ])('from %s', (status, actions) => {
    expect(getAvailableActions(status)).toEqual(actions);
  });
});

describe('createInitialLifecycle', () => {
  it('records the creation in the history', () => {
    expect(createInitialLifecycle('planned', TODAY, NOW)).toEqual({
      startedAt: null,
      completedAt: null,
      closedAt: null,
      closeReason: null,
      postponement: null,
      history: [{ from: null, to: 'planned', at: NOW, effectiveDate: TODAY, reason: null }],
    });
  });

  it('starts a project created in progress today', () => {
    expect(createInitialLifecycle('in_progress', TODAY, NOW).startedAt).toBe(TODAY);
  });
});

describe('applyTransition', () => {
  it('refuses transitions that are not allowed from the current status', () => {
    const error = errorOf(() =>
      applyTransition(projectIn('completed'), { action: 'resume' }, context),
    );
    expect(error.field).toBe('status');
    expect(() =>
      applyTransition(projectIn('in_progress'), { action: 'start', date: TODAY }, context),
    ).toThrow(LifecycleError);
  });

  it('never touches the plan, the progress or other fields', () => {
    const project = projectIn('in_progress', { progress: 40 });
    const result = applyTransition(
      project,
      { action: 'complete', date: TODAY, reason: null },
      context,
    );
    expect(Object.keys(result).sort()).toEqual(['lifecycle', 'status']);
  });

  describe('start', () => {
    it('records the actual start, which may be in the past but not in the future', () => {
      const started = run(projectIn('planned'), { action: 'start', date: d('2026-11-20') });
      expect(started.status).toBe('in_progress');
      expect(started.lifecycle.startedAt).toBe('2026-11-20');
      expect(started.lifecycle.history.at(-1)).toEqual({
        from: 'planned',
        to: 'in_progress',
        at: NOW,
        effectiveDate: '2026-11-20',
        reason: null,
      });

      const error = errorOf(() =>
        applyTransition(projectIn('planned'), { action: 'start', date: d('2026-11-24') }, context),
      );
      expect(error.field).toBe('date');
    });
  });

  describe('postpone', () => {
    const postpone = (
      reason: string,
      expectedResumeAt: string | null,
      revisedFinish: string | null,
    ): TransitionRequest => ({
      action: 'postpone',
      reason,
      expectedResumeAt: expectedResumeAt as ISODate | null,
      revisedFinish: revisedFinish as ISODate | null,
    });

    it('keeps the reason and the dates, labelled separately, without moving the plan', () => {
      const project = projectIn('in_progress', { progress: 35 });
      const postponed = run(
        project,
        postpone('  Aguardando fornecedor ', '2027-01-11', '2027-03-05'),
      );
      expect(postponed.status).toBe('paused');
      expect(postponed.lifecycle.postponement).toEqual({
        reason: 'Aguardando fornecedor',
        expectedResumeAt: '2027-01-11',
        revisedFinish: '2027-03-05',
      });
      expect(postponed.endDate).toBe(project.endDate);
      expect(postponed.progress).toBe(35);
      expect(postponed.lifecycle.history.at(-1)?.reason).toBe('Aguardando fornecedor');
    });

    it('accepts either date alone', () => {
      expect(run(projectIn('in_progress'), postpone('Férias', '2027-01-04', null)).status).toBe(
        'paused',
      );
      expect(run(projectIn('planned'), postpone('Orçamento', null, '2027-06-30')).status).toBe(
        'paused',
      );
    });

    it.each([
      ['no reason', postpone('  ', '2027-01-04', null), 'reason'],
      ['no date at all', postpone('Férias', null, null), 'expectedResumeAt'],
      ['a resume date in the past', postpone('Férias', '2026-11-22', null), 'expectedResumeAt'],
      [
        'a revised finish before the resume',
        postpone('Férias', '2027-01-04', '2027-01-03'),
        'revisedFinish',
      ],
      ['a revised finish in the past', postpone('Férias', null, '2026-11-01'), 'revisedFinish'],
      ['a too long reason', postpone('x'.repeat(501), '2027-01-04', null), 'reason'],
    ])('rejects %s', (_case, request, field) => {
      expect(errorOf(() => applyTransition(projectIn('in_progress'), request, context)).field).toBe(
        field,
      );
    });

    it('resuming restores "in progress", clears the postponement and keeps the history', () => {
      const resumed = run(projectIn('in_progress'), postpone('Férias', '2027-01-04', null), {
        action: 'resume',
      });
      expect(resumed.status).toBe('in_progress');
      expect(resumed.lifecycle.postponement).toBeNull();
      expect(resumed.lifecycle.history.map((change) => change.to)).toEqual([
        'in_progress',
        'paused',
        'in_progress',
      ]);
    });

    it('resuming a project postponed before it started counts as its start', () => {
      const resumed = run(projectIn('planned'), postpone('Orçamento', '2026-12-01', null), {
        action: 'resume',
      });
      expect(resumed.lifecycle.startedAt).toBe(TODAY);
    });
  });

  describe('complete', () => {
    it('records the completion date', () => {
      const done = run(projectIn('in_progress'), {
        action: 'complete',
        date: d('2026-11-21'),
        reason: null,
      });
      expect(done.status).toBe('completed');
      expect(done.lifecycle.completedAt).toBe('2026-11-21');
    });

    it('requires a justification when tasks are still pending', () => {
      const request: TransitionRequest = { action: 'complete', date: TODAY, reason: null };
      const error = errorOf(() =>
        applyTransition(projectIn('in_progress'), request, { ...context, pendingTasks: 2 }),
      );
      expect(error.field).toBe('reason');
      expect(error.message).toMatch(/tarefas pendentes/);

      const done = applyTransition(
        projectIn('in_progress'),
        { ...request, reason: 'Escopo restante transferido para a fase 2' },
        { ...context, pendingTasks: 2 },
      );
      expect(done.lifecycle.history.at(-1)?.reason).toBe(
        'Escopo restante transferido para a fase 2',
      );
    });

    it('rejects a completion in the future or before the actual start', () => {
      const project = projectIn('in_progress');
      expect(
        errorOf(() =>
          applyTransition(
            project,
            { action: 'complete', date: d('2026-11-24'), reason: null },
            context,
          ),
        ).field,
      ).toBe('date');
      expect(
        errorOf(() =>
          applyTransition(
            project,
            { action: 'complete', date: d('2026-11-01'), reason: null },
            context,
          ),
        ).field,
      ).toBe('date');
    });

    it('completing a postponed project clears its postponement', () => {
      const done = run(
        projectIn('in_progress'),
        {
          action: 'postpone',
          reason: 'Férias',
          expectedResumeAt: d('2027-01-04'),
          revisedFinish: null,
        },
        { action: 'complete', date: TODAY, reason: null },
      );
      expect(done.lifecycle.postponement).toBeNull();
    });
  });

  describe('close without completing', () => {
    it('requires a reason and keeps the progress reached', () => {
      const project = projectIn('in_progress', { progress: 40 });
      expect(
        errorOf(() =>
          applyTransition(project, { action: 'close', date: TODAY, reason: '' }, context),
        ).field,
      ).toBe('reason');

      const closed = run(project, { action: 'close', date: TODAY, reason: 'Patrocínio cancelado' });
      expect(closed.status).toBe('cancelled');
      expect(closed.progress).toBe(40);
      expect(closed.lifecycle).toMatchObject({
        closedAt: TODAY,
        closeReason: 'Patrocínio cancelado',
      });
    });
  });

  describe('reopen', () => {
    it('returns to "in progress" and keeps every past event', () => {
      const reopened = run(
        projectIn('in_progress'),
        { action: 'complete', date: TODAY, reason: null },
        { action: 'reopen', reason: 'Defeito encontrado no aceite' },
      );
      expect(reopened.status).toBe('in_progress');
      expect(reopened.lifecycle.completedAt).toBeNull();
      expect(reopened.lifecycle.history.map((change) => [change.from, change.to])).toEqual([
        [null, 'in_progress'],
        ['in_progress', 'completed'],
        ['completed', 'in_progress'],
      ]);
      expect(reopened.lifecycle.history.at(-1)?.reason).toBe('Defeito encontrado no aceite');
    });

    it('clears the closing reason of a project closed without success', () => {
      const reopened = run(
        projectIn('in_progress'),
        { action: 'close', date: TODAY, reason: 'Sem verba' },
        { action: 'reopen', reason: null },
      );
      expect(reopened.lifecycle).toMatchObject({ closedAt: null, closeReason: null });
      expect(reopened.lifecycle.startedAt).toBe('2026-11-02');
    });
  });
});

describe('isProjectLate', () => {
  it.each<[ProjectStatus, string, boolean]>([
    ['in_progress', '2026-12-19', true],
    ['in_progress', '2026-12-18', false],
    ['planned', '2026-12-19', true],
    ['paused', '2026-12-19', false],
    ['completed', '2026-12-19', false],
    ['cancelled', '2026-12-19', false],
  ])('%s on %s → %s', (status, today, late) => {
    expect(isProjectLate(projectIn(status), d(today))).toBe(late);
  });
});
