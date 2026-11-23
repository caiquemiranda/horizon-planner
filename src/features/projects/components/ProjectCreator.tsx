import { type SyntheticEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ISODate, Project } from '@/types/project';

import {
  createDefaultFormValues,
  type FormErrors,
  type ProjectFormValues,
  suggestHorizon,
  validateForm,
} from '../lib/form';
import { INITIAL_STATUSES } from '../lib/lifecycle';
import { useProjectsStore } from '../store/projectsStore';
import { MilestonesEditor } from './MilestonesEditor';
import { ProjectForm } from './ProjectForm';

interface ProjectCreatorProps {
  today: ISODate;
  categories: readonly string[];
  onCreated: (project: Project) => void;
  onCancel: () => void;
}

/**
 * Form for a new project. Nothing is saved until "Criar projeto".
 * The horizon follows the date range until the user picks one explicitly.
 */
export function ProjectCreator({ today, categories, onCreated, onCancel }: ProjectCreatorProps) {
  const create = useProjectsStore((state) => state.create);
  const formId = useId();
  const [values, setValues] = useState<ProjectFormValues>(() => createDefaultFormValues(today));
  const [isHorizonManual, setHorizonManual] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setSaving] = useState(false);

  const validation = validateForm(values);
  // Errors appear after the first attempt, except an inverted date range.
  const visibleErrors: FormErrors = submitted
    ? validation.errors
    : { endDate: validation.errors.endDate };

  function handleChange(changes: Partial<ProjectFormValues>) {
    if (changes.horizon) setHorizonManual(true);

    setValues((current) => {
      const next = { ...current, ...changes };
      const datesChanged = 'startDate' in changes || 'endDate' in changes;
      if (!isHorizonManual && !changes.horizon && datesChanged) {
        next.horizon = suggestHorizon(next.startDate, next.endDate) ?? next.horizon;
      }
      return next;
    });
  }

  async function submit() {
    setSubmitted(true);
    if (!validation.success || isSaving) return;

    setSaving(true);
    try {
      onCreated(await create(validation.draft));
    } catch {
      // The store exposes the error message; keep the form as is.
      setSaving(false);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <form id={formId} noValidate className="flex min-h-full flex-col" onSubmit={handleSubmit}>
      <ProjectForm
        values={values}
        errors={visibleErrors}
        categories={categories}
        statusOptions={INITIAL_STATUSES}
        onChange={handleChange}
      >
        <MilestonesEditor
          milestones={values.milestones}
          errors={visibleErrors}
          startDate={values.startDate}
          endDate={values.endDate}
          onChange={(milestones) => {
            handleChange({ milestones });
          }}
        />
      </ProjectForm>

      <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-2 border-t bg-background px-4 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          Criar projeto
        </Button>
      </div>
    </form>
  );
}
