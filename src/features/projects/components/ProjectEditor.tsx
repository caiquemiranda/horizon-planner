import { CircleAlert, CircleCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import type { Project } from '@/types/project';

import { type ProjectFormValues, toFormValues, validateForm } from '../lib/form';
import { useProjectsStore } from '../store/projectsStore';
import { MilestonesEditor } from './MilestonesEditor';
import { ProjectForm } from './ProjectForm';

interface ProjectEditorProps {
  project: Project;
  categories: readonly string[];
  /** Called after the project is deleted. */
  onDeleted: () => void;
}

/**
 * Edits an existing project with live sync: every valid change goes straight to the
 * store (optimistic), so the timeline updates while typing and the change is persisted.
 * Invalid intermediate states stay local until they are fixed.
 *
 * Mount with `key={project.id}` so switching projects resets the form.
 */
export function ProjectEditor({ project, categories, onDeleted }: ProjectEditorProps) {
  const update = useProjectsStore((state) => state.update);
  const remove = useProjectsStore((state) => state.remove);
  const [values, setValues] = useState<ProjectFormValues>(() => toFormValues(project));
  const validation = validateForm(values);

  function handleChange(changes: Partial<ProjectFormValues>) {
    const next = { ...values, ...changes };
    setValues(next);

    const result = validateForm(next);
    if (result.success) void update(project.id, result.draft);
  }

  return (
    <>
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

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
              Excluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir “{project.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                O projeto, seus marcos e seu cronograma (tarefas e vínculos) serão removidos. Esta
                ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                onClick={() => {
                  void remove(project.id);
                  onDeleted();
                }}
              >
                Excluir projeto
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
