import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState } from 'react';

import type { Project } from '@/types/project';

import { type ProjectFormValues, toFormValues, validateForm } from '../lib/form';
import { useProjectsStore } from '../store/projectsStore';
import { ProjectForm } from './ProjectForm';

interface ProjectEditorProps {
  project: Project;
  categories: readonly string[];
}

/**
 * Edits an existing project with live sync: every valid change goes straight to the
 * store (optimistic), so the timeline updates while typing and the change is persisted.
 * Invalid intermediate states stay local until they are fixed.
 *
 * Mount with `key={project.id}` so switching projects resets the form.
 */
export function ProjectEditor({ project, categories }: ProjectEditorProps) {
  const update = useProjectsStore((state) => state.update);
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
      />
      <p
        role="status"
        className="sticky bottom-0 flex items-center gap-1.5 border-t bg-background px-4 py-3 text-xs text-muted-foreground"
      >
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
    </>
  );
}
