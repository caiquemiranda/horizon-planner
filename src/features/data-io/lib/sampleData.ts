import { createInitialLifecycle } from '@/features/projects/lib/lifecycle';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { getProjectSyncPatch } from '@/features/schedule/lib/portfolioSync';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { createId } from '@/lib/id';
import type {
  Horizon,
  ISODate,
  Project,
  ProjectColor,
  ProjectLifecycle,
  ProjectStatus,
  UUID,
} from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

interface SampleMilestone {
  title: string;
  /** Days from the project start. */
  offset: number;
  completed: boolean;
}

interface SampleProject {
  title: string;
  description: string;
  horizon: Horizon;
  category: string | null;
  status: ProjectStatus;
  color: ProjectColor;
  /** Days from today; negative values are in the past. */
  start: number;
  /** Duration in days, inclusive of the start day. */
  duration: number;
  progress: number;
  milestones?: SampleMilestone[];
}

/**
 * Demo portfolio. Dates are relative to "today" so the sample always looks current:
 * something finished, work in progress across the today line and long-term plans.
 */
const SAMPLE_PROJECTS: readonly SampleProject[] = [
  {
    title: 'Reforma da cozinha',
    description: 'Trocar bancada, armários e iluminação.',
    horizon: 'short',
    category: 'Casa',
    status: 'in_progress',
    color: 'orange',
    start: -20,
    duration: 50,
    progress: 45,
    milestones: [
      { title: 'Orçamentos aprovados', offset: 5, completed: true },
      { title: 'Armários instalados', offset: 35, completed: false },
    ],
  },
  {
    title: 'Certificação AWS',
    description: 'Estudar para a certificação Solutions Architect Associate.',
    horizon: 'short',
    category: 'Carreira',
    status: 'planned',
    color: 'amber',
    start: 10,
    duration: 75,
    progress: 0,
    milestones: [{ title: 'Simulado completo', offset: 60, completed: false }],
  },
  {
    title: 'Corrida de 10 km',
    description: 'Treino três vezes por semana até a prova.',
    horizon: 'short',
    category: 'Saúde',
    status: 'in_progress',
    color: 'green',
    start: -35,
    duration: 80,
    progress: 55,
    milestones: [{ title: 'Primeiros 5 km sem parar', offset: 20, completed: true }],
  },
  {
    title: 'Curso de inglês avançado',
    description: 'Aulas semanais com foco em conversação.',
    horizon: 'medium',
    category: 'Carreira',
    status: 'in_progress',
    color: 'violet',
    start: -90,
    duration: 270,
    progress: 30,
    milestones: [
      { title: 'Nível B2', offset: 60, completed: true },
      { title: 'Exame de proficiência', offset: 250, completed: false },
    ],
  },
  {
    title: 'Side project SaaS',
    description: 'Validar a ideia, construir o MVP e conseguir os primeiros clientes.',
    horizon: 'medium',
    category: 'Carreira',
    status: 'planned',
    color: 'cyan',
    start: 45,
    duration: 240,
    progress: 0,
    milestones: [{ title: 'MVP no ar', offset: 120, completed: false }],
  },
  {
    title: 'Reserva de emergência',
    description: 'Juntar seis meses de despesas.',
    horizon: 'medium',
    category: 'Finanças',
    status: 'paused',
    color: 'teal',
    start: -150,
    duration: 330,
    progress: 40,
  },
  {
    title: 'Organizar fotos de família',
    description: 'Digitalizar e catalogar os álbuns antigos.',
    horizon: 'medium',
    category: null,
    status: 'completed',
    color: 'slate',
    start: -200,
    duration: 120,
    progress: 100,
  },
  {
    title: 'Mestrado',
    description: 'Escolher o programa, preparar a candidatura e cursar.',
    horizon: 'long',
    category: 'Carreira',
    status: 'planned',
    color: 'blue',
    start: 120,
    duration: 730,
    progress: 0,
    milestones: [{ title: 'Candidatura enviada', offset: 60, completed: false }],
  },
  {
    title: 'Comprar apartamento',
    description: 'Juntar a entrada e financiar o restante.',
    horizon: 'long',
    category: 'Finanças',
    status: 'in_progress',
    color: 'pink',
    start: -60,
    duration: 900,
    progress: 10,
  },
];

export interface SampleDataOptions {
  generateId?: () => UUID;
  now?: Date;
}

/** How many days before today the detailed sample schedule starts. */
const INDUSTRIAL_START_OFFSET = -6;

export interface SampleData {
  projects: Project[];
  /** Detailed plans (WBS, links, calendar) for some of the projects. */
  schedules: ProjectSchedule[];
}

/**
 * Sample portfolio plus one fully planned project, "Implantação de Sistema Industrial",
 * whose dates and progress come from its schedule. Every call returns fresh ids.
 */
export function createSampleData(today: ISODate, options: SampleDataOptions = {}): SampleData {
  const { generateId = createId, now = new Date() } = options;
  const projects = createPortfolio(today, { generateId, now });
  const projectId = generateId();
  const schedule = createIndustrialSchedule({
    projectId,
    start: dayToIsoDate(isoDateToDay(today) + INDUSTRIAL_START_OFFSET),
    generateId: () => generateId(),
    now,
  });
  const timestamp = now.toISOString();
  const base: Project = {
    id: projectId,
    title: 'Implantação de Sistema Industrial',
    description: 'Cronograma detalhado com fases, dependências entre tarefas e marco de aceite.',
    horizon: 'short',
    category: 'Trabalho',
    status: 'in_progress',
    color: 'red',
    startDate: today,
    endDate: today,
    progress: 0,
    milestones: [],
    lifecycle: sampleLifecycle('in_progress', today, today, today, timestamp),
    sortOrder: projects.filter((project) => project.horizon === 'short').length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const industrial = { ...base, ...getProjectSyncPatch(base, computeSchedule(schedule)) };
  return { projects: [...projects, industrial], schedules: [schedule] };
}

/**
 * Lifecycle consistent with a sample's status and dates: started on its planned start,
 * completed on its end date (or today when that is still ahead), postponed with a
 * reason and an expected resume date.
 */
function sampleLifecycle(
  status: ProjectStatus,
  startDate: ISODate,
  endDate: ISODate,
  today: ISODate,
  timestamp: string,
): ProjectLifecycle {
  const lifecycle = createInitialLifecycle(status, today, timestamp);
  return {
    ...lifecycle,
    startedAt: status === 'planned' ? null : startDate,
    completedAt: status === 'completed' ? (endDate < today ? endDate : today) : null,
    postponement:
      status === 'paused'
        ? {
            reason: 'Outras prioridades neste trimestre.',
            expectedResumeAt: dayToIsoDate(isoDateToDay(today) + 30),
            revisedFinish: null,
          }
        : null,
  };
}

/** The sample projects alone (see `createSampleData`). */
export function createSampleProjects(today: ISODate, options: SampleDataOptions = {}): Project[] {
  return createSampleData(today, options).projects;
}

function createPortfolio(
  today: ISODate,
  { generateId, now }: Required<SampleDataOptions>,
): Project[] {
  const todayDay = isoDateToDay(today);
  const timestamp = now.toISOString();
  const sortOrders: Partial<Record<Horizon, number>> = {};

  return SAMPLE_PROJECTS.map((sample) => {
    const startDay = todayDay + sample.start;
    const sortOrder = sortOrders[sample.horizon] ?? 0;
    sortOrders[sample.horizon] = sortOrder + 1;
    const startDate = dayToIsoDate(startDay);
    const endDate = dayToIsoDate(startDay + sample.duration - 1);

    return {
      id: generateId(),
      title: sample.title,
      description: sample.description,
      horizon: sample.horizon,
      category: sample.category,
      status: sample.status,
      color: sample.color,
      startDate,
      endDate,
      progress: sample.progress,
      milestones: (sample.milestones ?? []).map((milestone) => ({
        id: generateId(),
        title: milestone.title,
        date: dayToIsoDate(startDay + milestone.offset),
        completed: milestone.completed,
      })),
      lifecycle: sampleLifecycle(sample.status, startDate, endDate, today, timestamp),
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
