import { ChartGantt, CopyPlus, FlaskConical, RotateCcw, Trash2 } from 'lucide-react';
import { type SyntheticEvent, useId, useMemo, useState } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { StatusPill } from '@/features/projects/components/LifecycleSection';
import {
  NavigationDrawerButton,
  NavigationRail,
} from '@/features/projects/components/NavigationSidebar';
import { COLOR_META, FIELD_LIMITS } from '@/features/projects/constants';
import { selectByPlacement } from '@/features/projects/lib/visibility';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { formatDateRange } from '@/features/timeline/lib/format';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { navigate, projectHref } from '@/lib/router';
import type { ISODate, Project } from '@/types/project';

import { createFromExample, installExamples, removeExamples } from '../store/examplesActions';

/**
 * "Exemplos": sample projects with fictional data, installed only on request. They stay
 * in this section (never in the other lists, the timeline or "Meu painel"), open
 * read-only, and can be copied into a new real project.
 */
export function ExamplesPage() {
  const allProjects = useProjectsStore((state) => state.projects);
  const examples = useMemo(() => selectByPlacement(allProjects, 'examples'), [allProjects]);
  const showNotice = useNoticeStore((state) => state.show);
  const [busy, setBusy] = useState(false);
  const [toClone, setToClone] = useState<Project | null>(null);
  const installed = examples.length > 0;

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      showNotice(done);
    } catch {
      showNotice('Não foi possível atualizar os exemplos. Tente novamente.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader
        leading={<NavigationDrawerButton current="examples" />}
        actions={<ThemeToggle />}
      />

      <div className="flex min-h-0 flex-1">
        <NavigationRail current="examples" />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface-sunken">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Projetos de exemplo</h2>
              <p className="text-sm text-muted-foreground">
                Projetos com dados fictícios para conhecer o Horizon: cronograma com fases,
                vínculos, marcos e progresso. Ficam só nesta seção, fora das suas listas, da linha
                do tempo e do Meu painel, e não podem ser editados. Para usar um como ponto de
                partida, crie um projeto a partir dele.
              </p>
            </div>

            {installed ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void run(
                        () => installExamples(getTodayIsoDate()),
                        'Exemplos reiniciados. Seus projetos não foram alterados.',
                      );
                    }}
                  >
                    <RotateCcw />
                    Reiniciar exemplos
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      void run(
                        removeExamples,
                        'Exemplos removidos. Seus projetos não foram alterados.',
                      );
                    }}
                  >
                    <Trash2 />
                    Remover exemplos
                  </Button>
                </div>
                <ul aria-label="Projetos de exemplo" className="flex flex-col gap-2">
                  {examples.map((project) => (
                    <ExampleRow key={project.id} project={project} onClone={setToClone} />
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
                <FlaskConical aria-hidden="true" className="size-6 text-muted-foreground" />
                <p className="max-w-md text-sm text-muted-foreground">
                  Três projetos: a implantação de um sistema industrial em andamento, o lançamento
                  de um produto SaaS e uma obra curta já concluída. Nenhum dado seu é alterado.
                </p>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void run(
                      () => installExamples(getTodayIsoDate()),
                      'Exemplos instalados: 3 projetos com dados fictícios.',
                    );
                  }}
                >
                  <FlaskConical />
                  Explorar exemplos
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      <CloneDialog
        example={toClone}
        onClose={() => {
          setToClone(null);
        }}
      />
    </div>
  );
}

function ExampleRow({
  project,
  onClone,
}: {
  project: Project;
  onClone: (project: Project) => void;
}) {
  const expand = useDrawerStore((state) => state.expand);

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${COLOR_META[project.color].cssVar})` }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <a
              href={projectHref(project.id)}
              className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
            >
              {project.title}
            </a>
            <span className="shrink-0 rounded border px-1.5 text-[11px] font-medium text-muted-foreground">
              Exemplo
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {project.category} · {formatDateRange(project.startDate, project.endDate)} ·{' '}
            {project.progress}% concluído
          </span>
        </div>
        <StatusPill status={project.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-5">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Abrir cronograma de “${project.title}”`}
          onClick={() => {
            expand(project.id);
          }}
        >
          <ChartGantt />
          Abrir cronograma
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Criar projeto a partir de “${project.title}”`}
          onClick={() => {
            onClone(project);
          }}
        >
          <CopyPlus />
          Criar projeto a partir deste exemplo
        </Button>
      </div>
    </li>
  );
}

function CloneDialog({ example, onClose }: { example: Project | null; onClose: () => void }) {
  return (
    <Dialog
      open={example !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {/* Remounted for every example, so each opening starts from its defaults. */}
        {example ? <CloneForm key={example.id} example={example} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CloneForm({ example, onClose }: { example: Project; onClose: () => void }) {
  const ids = { title: useId(), start: useId(), error: useId() };
  const [title, setTitle] = useState(example.title);
  const [start, setStart] = useState<string>(getTodayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showNotice = useNoticeStore((state) => state.show);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (title.trim() === '') {
      setError('Informe o título do novo projeto.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setError('Informe a data de início.');
      return;
    }
    setSaving(true);
    try {
      const project = await createFromExample(example, { title, start: start as ISODate });
      onClose();
      showNotice(`Projeto “${project.title}” criado a partir do exemplo.`);
      navigate(projectHref(project.id));
    } catch {
      setError('Não foi possível criar o projeto. Nada foi gravado; tente novamente.');
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>Criar projeto a partir do exemplo</DialogTitle>
        <DialogDescription>
          O novo projeto recebe as fases, tarefas, durações e vínculos de “{example.title}”, a
          partir da data escolhida. Não leva o progresso, as datas realizadas nem os responsáveis
          fictícios do exemplo.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.title}>Título do novo projeto</Label>
        <Input
          id={ids.title}
          value={title}
          maxLength={FIELD_LIMITS.titleMax}
          required
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.start}>Data de início</Label>
        <Input
          id={ids.start}
          type="date"
          value={start}
          required
          onChange={(event) => {
            setStart(event.target.value);
          }}
        />
      </div>

      {error ? (
        <p id={ids.error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <button type="button" className={buttonVariants({ variant: 'outline' })} onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Criando…' : 'Criar projeto'}
        </Button>
      </DialogFooter>
    </form>
  );
}
