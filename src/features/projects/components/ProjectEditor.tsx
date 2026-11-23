import { CircleAlert, CircleCheck, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import type { Project } from '@/types/project';

import { type ProjectFormValues, toFormValues, validateForm } from '../lib/form';
import { useProjectsStore } from '../store/projectsStore';
import { LifecycleSection } from './LifecycleSection';
import { MilestonesEditor } from './MilestonesEditor';
import { ProjectForm } from './ProjectForm';

interface ProjectEditorProps {
  project: Project;
  categories: readonly string[];
  /** Called after the project is hidden or moved to the trash (it leaves the list). */
  onDismissed: () => void;
}

/**
 * Edits an existing project with live sync: every valid change goes straight to the
 * store (optimistic), so the timeline updates while typing and the change is persisted.
 * Invalid intermediate states stay local until they are fixed.
 *
 * Mount with `key={project.id}` so switching projects resets the form.
 */
export function ProjectEditor({ project, categories, onDismissed }: ProjectEditorProps) {
  const update = useProjectsStore((state) => state.update);
  const hide = useProjectsStore((state) => state.hide);
  const unhide = useProjectsStore((state) => state.unhide);
  const moveToTrash = useProjectsStore((state) => state.moveToTrash);
  const restore = useProjectsStore((state) => state.restore);
  const showNotice = useNoticeStore((state) => state.show);
  const [values, setValues] = useState<ProjectFormValues>(() => toFormValues(project));
  const validation = validateForm(values);

  function handleChange(changes: Partial<ProjectFormValues>) {
    const next = { ...values, ...changes };
    setValues(next);

    const result = validateForm(next);
    if (result.success) {
      // The status is changed by the lifecycle section, never by the form.
      const { status: _status, ...fields } = result.draft;
      void update(project.id, fields);
    }
  }

  return (
    <>
      <LifecycleSection project={project} today={getTodayIsoDate()} />
      <ProjectForm
        values={values}
        errors={validation.errors}
        categories={categories}
        onChange={handleChange}
      >
        <MilestonesEditor
          milestones={values.milestones}
          errors={validation.errors}
          startDate={values.startDate}
          endDate={values.endDate}
          onChange={(milestones) => {
            handleChange({ milestones });
          }}
        />
      </ProjectForm>

      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-4 py-2.5">
        <p role="status" className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          {validation.success ? (
            <>
              <CircleCheck aria-hidden="true" className="size-3.5 text-subtle-foreground" />
              Alterações salvas automaticamente
            </>
          ) : (
            <>
              <CircleAlert aria-hidden="true" className="size-3.5 text-destructive" />
              Corrija os campos destacados para salvar
            </>
          )}
        </p>

        {/*
         * Hiding and deleting are different on purpose: hiding only takes the project out
         * of the default lists; deleting moves it to the trash. Both can be undone.
         */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            void hide(project.id);
            onDismissed();
            showNotice(`“${project.title}” foi ocultado.`, 'success', {
              label: 'Desfazer',
              run: () => {
                void unhide(project.id);
              },
            });
          }}
        >
          <EyeOff />
          Ocultar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            void moveToTrash(project.id);
            onDismissed();
            showNotice(`“${project.title}” foi movido para a lixeira.`, 'success', {
              label: 'Desfazer',
              run: () => {
                void restore(project.id);
              },
            });
          }}
        >
          <Trash2 />
          Excluir
        </Button>
      </div>
    </>
  );
}
