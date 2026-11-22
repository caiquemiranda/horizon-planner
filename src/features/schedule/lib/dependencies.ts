import type { UUID } from '@/types/project';
import type { DependencyType, TaskDependency } from '@/types/schedule';

import { ScheduleRuleError } from './errors';

/**
 * The precedence graph: which task constrains which. Independent from the WBS tree.
 *
 * Policies (see docs/planning-module.md):
 * - links connect leaf tasks and milestones; summary tasks get their dates from their
 *   children, so they can neither be linked nor become summaries while linked;
 * - at most one link per (predecessor, successor) pair, whatever its type;
 * - the graph must stay acyclic (A → B → C → A is rejected), for every link type.
 */

export const LAG_LIMIT = 999;

export const DEPENDENCY_TYPE_META: Record<
  DependencyType,
  { label: string; short: string; description: string }
> = {
  FS: {
    label: 'Término-início',
    short: 'TI',
    description: 'a sucessora começa depois que a predecessora termina',
  },
  SS: {
    label: 'Início-início',
    short: 'II',
    description: 'a sucessora começa depois que a predecessora começa',
  },
  FF: {
    label: 'Término-término',
    short: 'TT',
    description: 'a sucessora termina depois que a predecessora termina',
  },
  SF: {
    label: 'Início-término',
    short: 'IT',
    description: 'a sucessora termina depois que a predecessora começa',
  },
};

export interface DependencyCandidate {
  predecessorId: UUID;
  successorId: UUID;
  type: DependencyType;
  lag: number;
}

export interface GraphContext {
  taskIds: ReadonlySet<UUID>;
  /** Tasks with children (summary tasks). */
  summaryIds: ReadonlySet<UUID>;
  dependencies: readonly TaskDependency[];
  /** Display name for messages, e.g. `2.1 Aquisição`. */
  describeTask: (id: UUID) => string;
}

/** Whether `to` can be reached from `from` following links forward. */
export function isReachable(
  dependencies: readonly TaskDependency[],
  from: UUID,
  to: UUID,
): boolean {
  const successors = new Map<UUID, UUID[]>();
  for (const link of dependencies) {
    successors.set(link.predecessorId, [
      ...(successors.get(link.predecessorId) ?? []),
      link.successorId,
    ]);
  }
  const stack = [from];
  const seen = new Set<UUID>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(successors.get(current) ?? []));
  }
  return false;
}

/**
 * Checks a new or edited link against every rule.
 * @param ignoreId Id of the link being edited, so it does not conflict with itself.
 * @throws {ScheduleRuleError} with a pt-BR message explaining the problem.
 */
export function assertValidDependency(
  candidate: DependencyCandidate,
  context: GraphContext,
  ignoreId?: UUID,
): void {
  const { predecessorId, successorId } = candidate;
  for (const id of [predecessorId, successorId]) {
    if (!context.taskIds.has(id)) {
      throw new ScheduleRuleError(
        'task-not-found',
        'O vínculo aponta para uma tarefa que não existe.',
      );
    }
  }

  if (predecessorId === successorId) {
    throw new ScheduleRuleError(
      'self-dependency',
      `${context.describeTask(predecessorId)} não pode depender dela mesma.`,
    );
  }

  for (const id of [predecessorId, successorId]) {
    if (context.summaryIds.has(id)) {
      throw new ScheduleRuleError(
        'summary-dependency',
        `${context.describeTask(id)} é uma tarefa resumo: suas datas vêm das subtarefas. Vincule as subtarefas.`,
      );
    }
  }

  if (!Number.isInteger(candidate.lag) || Math.abs(candidate.lag) > LAG_LIMIT) {
    throw new ScheduleRuleError(
      'invalid-predecessors',
      `O atraso deve ser um número inteiro de dias úteis entre -${String(LAG_LIMIT)} e ${String(LAG_LIMIT)}.`,
    );
  }

  const others = context.dependencies.filter((link) => link.id !== ignoreId);

  if (
    others.some(
      (link) =>
        (link.predecessorId === predecessorId && link.successorId === successorId) ||
        (link.predecessorId === successorId && link.successorId === predecessorId),
    )
  ) {
    throw new ScheduleRuleError(
      'duplicate-dependency',
      `Já existe um vínculo entre ${context.describeTask(predecessorId)} e ${context.describeTask(successorId)}.`,
    );
  }

  if (isReachable(others, successorId, predecessorId)) {
    throw new ScheduleRuleError(
      'dependency-cycle',
      `Vínculo circular: ${context.describeTask(successorId)} já vem antes de ${context.describeTask(predecessorId)} na sequência.`,
    );
  }
}

export interface TopologicalOrder {
  /** Task ids so that every predecessor comes before its successors. */
  order: UUID[];
  /** Tasks caught in a cycle (only possible with corrupted data); left unconstrained. */
  cyclicIds: Set<UUID>;
}

/**
 * Kahn's algorithm. Ties are broken by the given `taskIds` order (the WBS order), so the
 * result never depends on the order records happen to be stored in.
 */
export function sortTopologically(
  taskIds: readonly UUID[],
  dependencies: readonly TaskDependency[],
): TopologicalOrder {
  const position = new Map(taskIds.map((id, index) => [id, index]));
  const indegree = new Map<UUID, number>(taskIds.map((id) => [id, 0]));
  const successors = new Map<UUID, UUID[]>();

  for (const link of dependencies) {
    if (!position.has(link.predecessorId) || !position.has(link.successorId)) continue;
    successors.set(link.predecessorId, [
      ...(successors.get(link.predecessorId) ?? []),
      link.successorId,
    ]);
    indegree.set(link.successorId, (indegree.get(link.successorId) ?? 0) + 1);
  }

  // Ready tasks sorted by WBS position; a simple sorted array is enough for our sizes.
  const ready = taskIds.filter((id) => indegree.get(id) === 0);
  const order: UUID[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const successor of successors.get(id) ?? []) {
      const remaining = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) {
        const at = ready.findIndex(
          (other) => (position.get(other) ?? 0) > (position.get(successor) ?? 0),
        );
        if (at === -1) ready.push(successor);
        else ready.splice(at, 0, successor);
      }
    }
  }

  const placed = new Set(order);
  const cyclicIds = new Set(taskIds.filter((id) => !placed.has(id)));
  return { order: [...order, ...taskIds.filter((id) => cyclicIds.has(id))], cyclicIds };
}

// ── Readable format: `3`, `3FS+2d`, `4SS-1d`, `5TT` ────────────────────────────────────

const TYPE_ALIASES: Record<string, DependencyType> = {
  FS: 'FS',
  SS: 'SS',
  FF: 'FF',
  SF: 'SF',
  TI: 'FS',
  II: 'SS',
  TT: 'FF',
  IT: 'SF',
};

function formatLag(lag: number): string {
  if (lag === 0) return '';
  return `${lag > 0 ? '+' : '-'}${String(Math.abs(lag))}d`;
}

/** `2.1FS+3d`; a plain finish-to-start link without lag is just `2.1`. */
export function formatDependency(link: DependencyCandidate, wbs: string): string {
  if (link.type === 'FS' && link.lag === 0) return wbs;
  return `${wbs}${link.type}${formatLag(link.lag)}`;
}

/** All predecessors of a task in readable form, in WBS order: `1.1; 1.2SS+2d`. */
export function formatPredecessors(
  successorId: UUID,
  dependencies: readonly TaskDependency[],
  wbsById: ReadonlyMap<UUID, string>,
): string {
  return dependencies
    .filter((link) => link.successorId === successorId)
    .map((link) => ({ link, wbs: wbsById.get(link.predecessorId) ?? '?' }))
    .sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true }))
    .map(({ link, wbs }) => formatDependency(link, wbs))
    .join('; ');
}

const ENTRY_PATTERN = /^(\d+(?:\.\d+)*)\s*([A-Z]{2})?\s*(?:([+-])\s*(\d+)\s*(?:D|DIAS?)?)?$/;

export interface ParsedPredecessor {
  predecessorId: UUID;
  type: DependencyType;
  lag: number;
}

/**
 * Parses the "Predecessoras" cell. Accepts `;` or `,` separators, English or Portuguese
 * types (`FS`/`TI`, `SS`/`II`, `FF`/`TT`, `SF`/`IT`) and lags in working days (`+2d`).
 * WBS numbers are only an input format: the result references immutable task ids.
 * @throws {ScheduleRuleError} `invalid-predecessors` naming the first invalid entry.
 */
export function parsePredecessors(
  text: string,
  idByWbs: ReadonlyMap<string, UUID>,
): ParsedPredecessor[] {
  const entries = text
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  const result: ParsedPredecessor[] = [];
  for (const entry of entries) {
    const match = ENTRY_PATTERN.exec(entry.toUpperCase());
    if (!match) {
      throw new ScheduleRuleError(
        'invalid-predecessors',
        `"${entry}" não é um vínculo válido. Use o número EAP, o tipo e o atraso, ex.: 2.1TI+2d.`,
      );
    }
    const [, wbs = '', rawType, sign, amount] = match;
    const predecessorId = idByWbs.get(wbs);
    if (!predecessorId) {
      throw new ScheduleRuleError('invalid-predecessors', `Não existe tarefa com EAP ${wbs}.`);
    }
    const type = rawType === undefined ? 'FS' : TYPE_ALIASES[rawType];
    if (!type) {
      throw new ScheduleRuleError(
        'invalid-predecessors',
        `Tipo de vínculo "${rawType ?? ''}" desconhecido. Use TI, II, TT ou IT (ou FS, SS, FF, SF).`,
      );
    }
    const lag = amount === undefined ? 0 : Number(amount) * (sign === '-' ? -1 : 1);
    if (result.some((item) => item.predecessorId === predecessorId)) {
      throw new ScheduleRuleError(
        'duplicate-dependency',
        `A tarefa ${wbs} aparece mais de uma vez nas predecessoras.`,
      );
    }
    result.push({ predecessorId, type, lag });
  }
  return result;
}

/** Spoken description of a link, for screen readers and tooltips. */
export function describeDependency(
  link: DependencyCandidate,
  describeTask: (id: UUID) => string,
): string {
  const meta = DEPENDENCY_TYPE_META[link.type];
  const lag =
    link.lag === 0
      ? ''
      : link.lag > 0
        ? `, com ${String(link.lag)} ${link.lag === 1 ? 'dia útil' : 'dias úteis'} de atraso`
        : `, com ${String(-link.lag)} ${link.lag === -1 ? 'dia útil' : 'dias úteis'} de antecipação`;
  return `${meta.label}: ${describeTask(link.predecessorId)} → ${describeTask(link.successorId)} (${meta.description}${lag})`;
}
