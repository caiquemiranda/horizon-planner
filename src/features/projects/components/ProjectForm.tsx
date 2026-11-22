import { type CSSProperties, type ReactNode, useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Horizon, HORIZONS, PROJECT_STATUSES, type ProjectStatus } from '@/types/project';

import { COLOR_META, FIELD_LIMITS, HORIZON_META, STATUS_META } from '../constants';
import { countDays, type FormErrors, type ProjectFormValues } from '../lib/form';
import { ColorPicker } from './ColorPicker';
import { FormField } from './FormField';

interface ProjectFormProps {
  values: ProjectFormValues;
  errors: FormErrors;
  onChange: (changes: Partial<ProjectFormValues>) => void;
  /** Existing categories, offered as suggestions. */
  categories?: readonly string[];
  /** Extra sections rendered after the main fields (e.g. milestones). */
  children?: ReactNode;
}

function isHorizon(value: string): value is Horizon {
  return (HORIZONS as readonly string[]).includes(value);
}

function isStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

function formatDays(days: number | null): string | undefined {
  if (days === null || days < 1) return undefined;
  return days === 1 ? '1 dia' : `${String(days)} dias`;
}

/** Fields of a project. Stateless: the parent owns values, validation and saving. */
export function ProjectForm({
  values,
  errors,
  onChange,
  categories = [],
  children,
}: ProjectFormProps) {
  const categoriesId = useId();
  const colorLabelId = useId();
  const progressId = useId();
  const accent = { '--project-color': `var(${COLOR_META[values.color].cssVar})` } as CSSProperties;

  return (
    <div className="flex flex-col gap-5 p-4" style={accent}>
      <FormField label="Título" error={errors.title}>
        <Input
          value={values.title}
          maxLength={FIELD_LIMITS.titleMax}
          placeholder="Ex.: Aprender piano"
          data-autofocus
          autoComplete="off"
          className="h-10 text-base font-medium"
          onChange={(event) => {
            onChange({ title: event.target.value });
          }}
        />
      </FormField>

      <FormField label="Descrição" error={errors.description}>
        <Textarea
          value={values.description}
          maxLength={FIELD_LIMITS.descriptionMax}
          placeholder="Objetivo, contexto, próximos passos…"
          rows={3}
          className="resize-y"
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Horizonte" error={errors.horizon}>
          {(controlProps) => (
            <Select
              value={values.horizon}
              onValueChange={(value) => {
                if (isHorizon(value)) onChange({ horizon: value });
              }}
            >
              <SelectTrigger className="w-full" {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORIZONS.map((horizon) => (
                  <SelectItem key={horizon} value={horizon}>
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: `var(${HORIZON_META[horizon].cssVar})` }}
                    />
                    {HORIZON_META[horizon].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="Status" error={errors.status}>
          {(controlProps) => (
            <Select
              value={values.status}
              onValueChange={(value) => {
                if (isStatus(value)) onChange({ status: value });
              }}
            >
              <SelectTrigger className="w-full" {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_META[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Início" error={errors.startDate}>
          <Input
            type="date"
            value={values.startDate}
            className="tabular-nums"
            onChange={(event) => {
              onChange({ startDate: event.target.value });
            }}
          />
        </FormField>
        <FormField
          label="Término"
          error={errors.endDate}
          hint={formatDays(countDays(values.startDate, values.endDate))}
        >
          <Input
            type="date"
            value={values.endDate}
            min={values.startDate || undefined}
            className="tabular-nums"
            onChange={(event) => {
              onChange({ endDate: event.target.value });
            }}
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={progressId} className="text-xs font-medium text-muted-foreground">
            Progresso
          </Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {values.progress}%
          </span>
        </div>
        <input
          id={progressId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={values.progress}
          aria-valuetext={`${String(values.progress)}%`}
          className="h-5 w-full cursor-pointer accent-(--project-color)"
          onChange={(event) => {
            onChange({ progress: Number(event.target.value) });
          }}
        />
      </div>

      <FormField label="Categoria" error={errors.category} hint="Opcional. Ex.: Carreira, Saúde">
        <Input
          value={values.category}
          maxLength={FIELD_LIMITS.categoryMax}
          list={categoriesId}
          autoComplete="off"
          onChange={(event) => {
            onChange({ category: event.target.value });
          }}
        />
      </FormField>
      <datalist id={categoriesId}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2">
        <span id={colorLabelId} className="text-xs font-medium text-muted-foreground">
          Cor
        </span>
        <ColorPicker
          value={values.color}
          aria-labelledby={colorLabelId}
          onChange={(color) => {
            onChange({ color });
          }}
        />
      </div>

      {children}
    </div>
  );
}
