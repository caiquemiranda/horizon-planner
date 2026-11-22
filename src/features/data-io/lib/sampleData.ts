import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { createId } from '@/lib/id';
import type { Horizon, ISODate, Project, ProjectColor, ProjectStatus, UUID } from '@/types/project';

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

/** Builds the sample projects around `today`. Every call returns fresh ids. */
export function createSampleProjects(
  today: ISODate,
  { generateId = createId, now = new Date() }: SampleDataOptions = {},
): Project[] {
  const todayDay = isoDateToDay(today);
  const timestamp = now.toISOString();
  const sortOrders: Partial<Record<Horizon, number>> = {};

  return SAMPLE_PROJECTS.map((sample) => {
    const startDay = todayDay + sample.start;
    const sortOrder = sortOrders[sample.horizon] ?? 0;
    sortOrders[sample.horizon] = sortOrder + 1;

    return {
      id: generateId(),
      title: sample.title,
      description: sample.description,
      horizon: sample.horizon,
      category: sample.category,
      status: sample.status,
      color: sample.color,
      startDate: dayToIsoDate(startDay),
      endDate: dayToIsoDate(startDay + sample.duration - 1),
      progress: sample.progress,
      milestones: (sample.milestones ?? []).map((milestone) => ({
        id: generateId(),
        title: milestone.title,
        date: dayToIsoDate(startDay + milestone.offset),
        completed: milestone.completed,
      })),
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
