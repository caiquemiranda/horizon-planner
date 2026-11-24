import { useMemo, useState } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { cn } from '@/lib/utils';

import {
  computeStatistics,
  PERIOD_LABELS,
  STATISTICS_PERIODS,
  type StatisticsPeriod,
} from '../lib/statistics';
import { useProjectsStore } from '../store/projectsStore';
import { NavigationDrawerButton, NavigationRail } from './NavigationSidebar';

interface Indicator {
  label: string;
  value: string;
  /** What exactly is counted, so the number can be checked. */
  rule: string;
}

/**
 * "Meu painel": indicators of the projects stored in this browser. Each card says what
 * it counts; the period applies to the indicators dated by an event (start, completion,
 * closing) and never to the current states.
 */
export function DashboardPage() {
  const projects = useProjectsStore((state) => state.projects);
  const [period, setPeriod] = useState<StatisticsPeriod>('all');
  const today = getTodayIsoDate();
  const stats = useMemo(
    () => computeStatistics(projects, period, today),
    [projects, period, today],
  );

  const inPeriod: Indicator[] = [
    {
      label: 'Projetos iniciados',
      value: String(stats.started),
      rule: 'Com início real no período.',
    },
    {
      label: 'Projetos concluídos',
      value: String(stats.completed),
      rule: 'Concluídos com data de conclusão no período.',
    },
    {
      label: 'Projetos não concluídos',
      value: String(stats.notCompleted),
      rule: 'Encerrados sem êxito no período.',
    },
    {
      label: 'Taxa de conclusão',
      value: stats.completionRate === null ? '—' : `${String(stats.completionRate)}%`,
      rule:
        stats.completionRate === null
          ? 'Sem projetos encerrados no período.'
          : 'Concluídos ÷ (concluídos + não concluídos). Projetos em andamento não entram.',
    },
  ];
  const now: Indicator[] = [
    { label: 'Em andamento', value: String(stats.inProgress), rule: 'Status atual.' },
    { label: 'Adiados', value: String(stats.postponed), rule: 'Status atual.' },
    { label: 'Planejados', value: String(stats.planned), rule: 'Ainda não iniciados.' },
    {
      label: 'Progresso médio',
      value: stats.averageProgress === null ? '—' : `${String(stats.averageProgress)}%`,
      rule: 'Média simples dos projetos em andamento: cada projeto pesa o mesmo.',
    },
  ];

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader
        leading={<NavigationDrawerButton current="dashboard" />}
        actions={<ThemeToggle />}
      />
      <div className="flex min-h-0 flex-1">
        <NavigationRail current="dashboard" />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface-sunken">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">Meu painel</h2>
                <p className="text-sm text-muted-foreground">
                  Projetos salvos neste navegador, incluindo os ocultos.
                </p>
              </div>
              <div role="group" aria-label="Período" className="flex flex-wrap gap-1">
                {STATISTICS_PERIODS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={period === option}
                    onClick={() => {
                      setPeriod(option);
                    }}
                    className={cn(
                      'h-8 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      period === option
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {PERIOD_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <IndicatorGroup title={`No período: ${PERIOD_LABELS[period]}`} items={inPeriod} />
            <IndicatorGroup title="Agora" items={now} />

            <p className="text-xs text-muted-foreground">
              Os indicadores não são categorias exclusivas: um projeto iniciado e concluído no
              período aparece nos dois, então os números não devem ser somados. Projetos ocultos
              contam normalmente; os {String(stats.inTrash)} da lixeira ficam de fora até serem
              restaurados. Total considerado: {String(stats.total)}.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function IndicatorGroup({ title, items }: { title: string; items: Indicator[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 rounded-lg border bg-background p-3">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{item.value}</dd>
            <dd className="text-xs text-subtle-foreground">{item.rule}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
