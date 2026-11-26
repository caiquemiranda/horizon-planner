import { suggestHorizon } from '@/features/projects/lib/form';
import { createWorkCalendar, DEFAULT_CALENDAR } from '@/features/schedule/lib/calendar';
import { progressFromWork, WORK_STEP } from '@/features/schedule/lib/checkIns';
import { computeSchedule, getDisplayFinish } from '@/features/schedule/lib/engine';
import { getProjectSyncPatch } from '@/features/schedule/lib/portfolioSync';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, Project, ProjectColor, UUID } from '@/types/project';
import type { DependencyType, ProjectSchedule, ScheduleTask } from '@/types/schedule';

/**
 * The sample projects of "Exemplos" (spec REQ-DEMO-01): fictional data that uses the real
 * features (WBS, links of every supported kind, milestones, parallel work, progress).
 *
 * - Ids are fixed, so installing again replaces the samples instead of adding copies.
 * - Dates are relative to the day they are installed, and progress follows them: work
 *   planned before that day is done, work around it is partly done, the rest is not
 *   started. Tasks listed in `behind` did half of what was planned, so the forecast has
 *   a real delay to show.
 * - Nothing here is invented beyond the plan: no check-ins of fictional people.
 */

interface ExampleTask {
  key: string;
  name: string;
  parent?: string;
  /** Working days; 0 makes a milestone. Ignored for phases. */
  duration?: number;
  assignee?: string;
}

/** Predecessor, successor, type and lag in working days. */
type ExampleLink = [string, string, DependencyType, number?];

interface ExampleDefinition {
  id: UUID;
  title: string;
  description: string;
  category: string;
  color: ProjectColor;
  /** Calendar days from the install day to the first day of work (negative: past). */
  startOffset: number;
  /** A finished project: every task done and the project completed. */
  completed?: boolean;
  /** Tasks that did half of the work planned so far. */
  behind?: readonly string[];
  tasks: readonly ExampleTask[];
  links: readonly ExampleLink[];
}

export const EXAMPLE_IDS = {
  industrial: 'e0000000-0000-4000-8000-000000000001',
  saas: 'e0000000-0000-4000-8000-000000000002',
  retrofit: 'e0000000-0000-4000-8000-000000000003',
} as const;

const INDUSTRIAL: ExampleDefinition = {
  id: EXAMPLE_IDS.industrial,
  title: 'Implantação de SDAI na planta fabril',
  description:
    'Exemplo com dados fictícios: sistema de detecção e alarme de incêndio, da engenharia ao aceite final, em andamento.',
  category: 'Engenharia',
  color: 'red',
  startOffset: -30,
  behind: ['fab', 'disp'],
  tasks: [
    { key: 'eng', name: 'Engenharia' },
    {
      key: 'lev',
      parent: 'eng',
      name: 'Levantamento em campo',
      duration: 3,
      assignee: 'Ana Ribeiro',
    },
    { key: 'proj', parent: 'eng', name: 'Projeto executivo', duration: 5, assignee: 'Ana Ribeiro' },
    {
      key: 'memo',
      parent: 'eng',
      name: 'Memorial descritivo',
      duration: 2,
      assignee: 'Bruno Lima',
    },
    { key: 'risco', parent: 'eng', name: 'Análise de riscos', duration: 2, assignee: 'Bruno Lima' },
    {
      key: 'aprov',
      parent: 'eng',
      name: 'Projeto aprovado pelo cliente',
      duration: 0,
      assignee: 'Cliente',
    },
    { key: 'sup', name: 'Suprimentos' },
    {
      key: 'esp',
      parent: 'sup',
      name: 'Especificação de materiais',
      duration: 2,
      assignee: 'Suprimentos',
    },
    { key: 'cot', parent: 'sup', name: 'Cotação e compra', duration: 4, assignee: 'Compras' },
    {
      key: 'fab',
      parent: 'sup',
      name: 'Fabricação dos painéis',
      duration: 8,
      assignee: 'Fornecedor',
    },
    {
      key: 'rec',
      parent: 'sup',
      name: 'Recebimento e inspeção',
      duration: 2,
      assignee: 'Qualidade',
    },
    { key: 'inst', name: 'Instalação' },
    {
      key: 'infra',
      parent: 'inst',
      name: 'Eletrocalhas e eletrodutos',
      duration: 6,
      assignee: 'Equipe de campo',
    },
    {
      key: 'cab',
      parent: 'inst',
      name: 'Lançamento de cabos',
      duration: 5,
      assignee: 'Equipe de campo',
    },
    {
      key: 'disp',
      parent: 'inst',
      name: 'Detectores e acionadores',
      duration: 4,
      assignee: 'Equipe de campo',
    },
    {
      key: 'sir',
      parent: 'inst',
      name: 'Sirenes e sinalização',
      duration: 3,
      assignee: 'Equipe de campo',
    },
    {
      key: 'cent',
      parent: 'inst',
      name: 'Montagem da central de alarme',
      duration: 2,
      assignee: 'Carla Souza',
    },
    { key: 'conf', name: 'Configuração' },
    {
      key: 'prog',
      parent: 'conf',
      name: 'Programação da central',
      duration: 3,
      assignee: 'Carla Souza',
    },
    {
      key: 'zonas',
      parent: 'conf',
      name: 'Parametrização das zonas',
      duration: 2,
      assignee: 'Carla Souza',
    },
    {
      key: 'integ',
      parent: 'conf',
      name: 'Integração com o supervisório',
      duration: 4,
      assignee: 'Automação',
    },
    { key: 'telas', parent: 'conf', name: 'Telas de operação', duration: 3, assignee: 'Automação' },
    { key: 'test', name: 'Testes e comissionamento' },
    {
      key: 'pontos',
      parent: 'test',
      name: 'Teste ponto a ponto',
      duration: 4,
      assignee: 'Qualidade',
    },
    {
      key: 'func',
      parent: 'test',
      name: 'Teste funcional integrado',
      duration: 3,
      assignee: 'Qualidade',
    },
    {
      key: 'simul',
      parent: 'test',
      name: 'Simulado de evacuação',
      duration: 1,
      assignee: 'Segurança do trabalho',
    },
    { key: 'com', parent: 'test', name: 'Comissionamento', duration: 2, assignee: 'Carla Souza' },
    { key: 'ent', name: 'Entrega' },
    {
      key: 'trein',
      parent: 'ent',
      name: 'Treinamento dos operadores',
      duration: 2,
      assignee: 'Bruno Lima',
    },
    {
      key: 'asbuilt',
      parent: 'ent',
      name: 'As built e documentação',
      duration: 3,
      assignee: 'Ana Ribeiro',
    },
    { key: 'aceite', parent: 'ent', name: 'Aceite final', duration: 0, assignee: 'Cliente' },
  ],
  links: [
    ['lev', 'proj', 'FS'],
    ['proj', 'memo', 'SS', 2],
    ['proj', 'risco', 'FF'],
    ['proj', 'aprov', 'FS'],
    ['memo', 'aprov', 'FS'],
    ['aprov', 'esp', 'FS'],
    ['esp', 'cot', 'FS'],
    ['cot', 'fab', 'FS'],
    ['fab', 'rec', 'FS'],
    ['aprov', 'infra', 'FS'],
    ['infra', 'cab', 'FS'],
    ['cab', 'disp', 'SS', 2],
    ['cab', 'sir', 'SS', 3],
    ['rec', 'cent', 'FS'],
    ['cab', 'cent', 'FS'],
    ['cent', 'prog', 'FS'],
    ['prog', 'zonas', 'FS'],
    ['zonas', 'integ', 'FS'],
    ['integ', 'telas', 'FF'],
    ['disp', 'pontos', 'FS'],
    ['zonas', 'pontos', 'FS'],
    ['pontos', 'func', 'FS'],
    ['integ', 'func', 'FS'],
    ['func', 'simul', 'FS'],
    ['simul', 'com', 'FS'],
    ['func', 'trein', 'SS'],
    ['com', 'asbuilt', 'FS'],
    ['asbuilt', 'aceite', 'FS'],
    ['trein', 'aceite', 'FS'],
  ],
};

const SAAS: ExampleDefinition = {
  id: EXAMPLE_IDS.saas,
  title: 'Lançamento de produto SaaS',
  description:
    'Exemplo com dados fictícios: da descoberta ao lançamento de um produto de software, com frentes em paralelo.',
  category: 'Software',
  color: 'cyan',
  startOffset: -20,
  behind: ['front'],
  tasks: [
    { key: 'desc', name: 'Descoberta' },
    {
      key: 'entr',
      parent: 'desc',
      name: 'Entrevistas com clientes',
      duration: 4,
      assignee: 'Produto',
    },
    { key: 'merc', parent: 'desc', name: 'Análise de mercado', duration: 3, assignee: 'Produto' },
    { key: 'proto', parent: 'desc', name: 'Protótipo navegável', duration: 3, assignee: 'Design' },
    { key: 'req', parent: 'desc', name: 'Requisitos do MVP', duration: 3, assignee: 'Produto' },
    { key: 'arq', name: 'Arquitetura' },
    {
      key: 'sist',
      parent: 'arq',
      name: 'Desenho da arquitetura',
      duration: 3,
      assignee: 'Tech lead',
    },
    {
      key: 'banco',
      parent: 'arq',
      name: 'Modelagem do banco de dados',
      duration: 2,
      assignee: 'Backend',
    },
    { key: 'plano', parent: 'arq', name: 'Plano de segurança', duration: 2, assignee: 'Segurança' },
    { key: 'dev', name: 'Desenvolvimento' },
    { key: 'api', parent: 'dev', name: 'Backend e API', duration: 10, assignee: 'Backend' },
    { key: 'front', parent: 'dev', name: 'Frontend web', duration: 10, assignee: 'Frontend' },
    { key: 'auth', parent: 'dev', name: 'Autenticação', duration: 4, assignee: 'Backend' },
    {
      key: 'pag',
      parent: 'dev',
      name: 'Integração de pagamentos',
      duration: 5,
      assignee: 'Backend',
    },
    { key: 'docapi', parent: 'dev', name: 'Documentação da API', duration: 2, assignee: 'Backend' },
    { key: 'qa', name: 'Qualidade e segurança' },
    { key: 'auto', parent: 'qa', name: 'Testes automatizados', duration: 6, assignee: 'QA' },
    { key: 'rev', parent: 'qa', name: 'Revisão de segurança', duration: 2, assignee: 'Segurança' },
    {
      key: 'hom',
      parent: 'qa',
      name: 'Homologação com clientes piloto',
      duration: 5,
      assignee: 'Produto',
    },
    { key: 'lanc', name: 'Lançamento' },
    {
      key: 'prod',
      parent: 'lanc',
      name: 'Infraestrutura de produção',
      duration: 3,
      assignee: 'DevOps',
    },
    { key: 'deploy', parent: 'lanc', name: 'Deploy', duration: 1, assignee: 'DevOps' },
    {
      key: 'mkt',
      parent: 'lanc',
      name: 'Campanha de lançamento',
      duration: 5,
      assignee: 'Marketing',
    },
    { key: 'golive', parent: 'lanc', name: 'Produto no ar', duration: 0, assignee: 'Produto' },
  ],
  links: [
    ['entr', 'merc', 'SS'],
    ['entr', 'proto', 'FS'],
    ['proto', 'req', 'FS'],
    ['merc', 'req', 'FS'],
    ['req', 'sist', 'FS'],
    ['sist', 'banco', 'SS', 1],
    ['sist', 'plano', 'FS'],
    ['banco', 'api', 'FS'],
    ['api', 'front', 'SS', 2],
    ['api', 'auth', 'SS', 3],
    ['api', 'pag', 'FS'],
    ['api', 'docapi', 'FF'],
    ['api', 'auto', 'SS', 3],
    ['plano', 'rev', 'FS'],
    ['auth', 'rev', 'FS'],
    ['front', 'hom', 'FS'],
    ['pag', 'hom', 'FS'],
    ['auto', 'hom', 'FS'],
    ['sist', 'prod', 'FS'],
    ['hom', 'deploy', 'FS'],
    ['rev', 'deploy', 'FS'],
    ['prod', 'deploy', 'FS'],
    ['hom', 'mkt', 'SS', 2],
    ['deploy', 'golive', 'FS'],
    ['mkt', 'golive', 'FF'],
  ],
};

const RETROFIT: ExampleDefinition = {
  id: EXAMPLE_IDS.retrofit,
  title: 'Retrofit da iluminação do galpão',
  description:
    'Exemplo com dados fictícios: um projeto curto e já concluído, com todas as tarefas e marcos realizados.',
  category: 'Manutenção',
  color: 'green',
  startOffset: -75,
  completed: true,
  tasks: [
    { key: 'plan', name: 'Planejamento' },
    {
      key: 'lev',
      parent: 'plan',
      name: 'Levantamento dos pontos de luz',
      duration: 2,
      assignee: 'Diego Alves',
    },
    {
      key: 'proj',
      parent: 'plan',
      name: 'Projeto luminotécnico',
      duration: 3,
      assignee: 'Diego Alves',
    },
    { key: 'orc', parent: 'plan', name: 'Orçamento aprovado', duration: 0, assignee: 'Gerência' },
    { key: 'exec', name: 'Execução' },
    {
      key: 'compra',
      parent: 'exec',
      name: 'Compra das luminárias LED',
      duration: 3,
      assignee: 'Compras',
    },
    {
      key: 'rem',
      parent: 'exec',
      name: 'Remoção das luminárias antigas',
      duration: 2,
      assignee: 'Manutenção',
    },
    {
      key: 'inst',
      parent: 'exec',
      name: 'Instalação das novas luminárias',
      duration: 4,
      assignee: 'Manutenção',
    },
    {
      key: 'med',
      parent: 'exec',
      name: 'Medição de iluminância',
      duration: 1,
      assignee: 'Diego Alves',
    },
    { key: 'ence', name: 'Encerramento' },
    {
      key: 'rel',
      parent: 'ence',
      name: 'Relatório de entrega',
      duration: 1,
      assignee: 'Diego Alves',
    },
    {
      key: 'aceite',
      parent: 'ence',
      name: 'Aceite da operação',
      duration: 0,
      assignee: 'Operação',
    },
  ],
  links: [
    ['lev', 'proj', 'FS'],
    ['proj', 'orc', 'FS'],
    ['orc', 'compra', 'FS'],
    ['compra', 'rem', 'FS'],
    ['rem', 'inst', 'SS', 1],
    ['inst', 'med', 'FS'],
    ['med', 'rel', 'FS'],
    ['rel', 'aceite', 'FS'],
  ],
};

const DEFINITIONS: readonly ExampleDefinition[] = [INDUSTRIAL, SAAS, RETROFIT];

export interface Example {
  project: Project;
  schedule: ProjectSchedule;
}

function taskId(projectId: UUID, key: string): UUID {
  return `${projectId}-${key}`;
}

/** The plan alone: every task requested on the first working day, nothing done yet. */
function buildPlan(definition: ExampleDefinition, firstDay: ISODate, now: Date): ProjectSchedule {
  const orders = new Map<string, number>();
  const tasks: ScheduleTask[] = definition.tasks.map((task) => {
    const group = task.parent ?? '';
    const order = orders.get(group) ?? 0;
    orders.set(group, order + 1);
    return {
      id: taskId(definition.id, task.key),
      parentId: task.parent === undefined ? null : taskId(definition.id, task.parent),
      order,
      name: task.name,
      assignee: task.assignee ?? null,
      notes: '',
      mode: 'auto',
      start: firstDay,
      duration: task.duration ?? 1,
      progress: 0,
      completedWork: 0,
      actualStart: null,
      actualFinish: null,
    };
  });
  return {
    projectId: definition.id,
    revision: 0,
    calendar: DEFAULT_CALENDAR,
    tasks,
    dependencies: definition.links.map(([predecessor, successor, type, lag = 0]) => ({
      id: `${definition.id}-${predecessor}-${successor}`,
      predecessorId: taskId(definition.id, predecessor),
      successorId: taskId(definition.id, successor),
      type,
      lag,
    })),
    checkIns: [],
    baseline: null,
    updatedAt: now.toISOString(),
  };
}

/** Rounds work down to the step the check-ins use. */
function toWorkStep(work: number): number {
  return Math.floor(work / WORK_STEP) * WORK_STEP;
}

function buildExample(definition: ExampleDefinition, today: ISODate, now: Date): Example {
  const calendar = createWorkCalendar(DEFAULT_CALENDAR);
  const todayDay = isoDateToDay(today);
  const firstDay = dayToIsoDate(calendar.nextWorkingDay(todayDay + definition.startOffset));
  const plan = buildPlan(definition, firstDay, now);
  const planned = computeSchedule(plan);
  const parents = new Set(plan.tasks.map((task) => task.parentId));
  const behind = new Set(definition.behind ?? []);

  const tasks = plan.tasks.map((task): ScheduleTask => {
    const scheduled = planned.tasks.get(task.id);
    if (!scheduled || parents.has(task.id)) return task;
    const key = task.id.slice(definition.id.length + 1);
    const elapsed = definition.completed
      ? task.duration
      : calendar.countWorkingDays(scheduled.start, Math.min(todayDay, scheduled.finish));
    const isMilestone = task.duration === 0;
    const milestoneDone =
      isMilestone && (definition.completed === true || scheduled.start < todayDay);
    const work = Math.min(
      task.duration,
      toWorkStep(behind.has(key) ? Math.max(0, elapsed) / 2 : Math.max(0, elapsed)),
    );
    const progress = progressFromWork(work, task.duration, milestoneDone);
    const done = progress === 100;
    return {
      ...task,
      completedWork: work,
      progress,
      actualStart: progress > 0 ? dayToIsoDate(scheduled.start) : null,
      actualFinish: done ? dayToIsoDate(getDisplayFinish(scheduled)) : null,
    };
  });

  const schedule: ProjectSchedule = { ...plan, tasks };
  const result = computeSchedule(schedule);
  const timestamp = now.toISOString();
  const status = definition.completed ? 'completed' : 'in_progress';
  const base: Project = {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    horizon: 'short',
    category: definition.category,
    status,
    color: definition.color,
    startDate: firstDay,
    endDate: firstDay,
    progress: 0,
    milestones: [],
    lifecycle: {
      startedAt: firstDay,
      completedAt: null,
      closedAt: null,
      closeReason: null,
      postponement: null,
      history: [],
    },
    hiddenAt: null,
    deletedAt: null,
    demo: true,
    sortOrder: DEFINITIONS.indexOf(definition),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const project = { ...base, ...getProjectSyncPatch(base, result) };
  const horizon = suggestHorizon(project.startDate, project.endDate) ?? 'short';
  return {
    project: {
      ...project,
      horizon,
      lifecycle: {
        ...project.lifecycle,
        completedAt: definition.completed ? project.endDate : null,
        history: [
          { from: null, to: 'planned', at: timestamp, effectiveDate: firstDay, reason: null },
          {
            from: 'planned',
            to: 'in_progress',
            at: timestamp,
            effectiveDate: firstDay,
            reason: null,
          },
          ...(definition.completed
            ? [
                {
                  from: 'in_progress' as const,
                  to: 'completed' as const,
                  at: timestamp,
                  effectiveDate: project.endDate,
                  reason: null,
                },
              ]
            : []),
        ],
      },
    },
    schedule,
  };
}

/** Every sample project with its schedule, as of `today`. */
export function createExamples(today: ISODate, now = new Date()): Example[] {
  return DEFINITIONS.map((definition) => buildExample(definition, today, now));
}
