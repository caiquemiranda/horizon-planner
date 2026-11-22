import { Diamond, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { createId } from '@/lib/id';
import { cn } from '@/lib/utils';

import { FIELD_LIMITS } from '../constants';
import type { FormErrors, MilestoneFormValues } from '../lib/form';

interface MilestonesEditorProps {
  milestones: readonly MilestoneFormValues[];
  errors: FormErrors;
  /** Project range, used for the new milestone's default date and the date pickers. */
  startDate: string;
  endDate: string;
  onChange: (milestones: MilestoneFormValues[]) => void;
  /** Injected for deterministic tests. */
  generateId?: () => MilestoneFormValues['id'];
}

const DEFAULT_MILESTONE_TITLE = 'Novo marco';

/** Inline list of milestones: done checkbox, title, date and remove. */
export function MilestonesEditor({
  milestones,
  errors,
  startDate,
  endDate,
  onChange,
  generateId = createId,
}: MilestonesEditorProps) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const focusNewRef = useRef<string | null>(null);
  const isFull = milestones.length >= FIELD_LIMITS.milestonesMax;

  // Focus (and select) the title of a milestone that was just added.
  useEffect(() => {
    const id = focusNewRef.current;
    if (!id) return;
    focusNewRef.current = null;
    const input = listRef.current?.querySelector<HTMLInputElement>(
      `[data-milestone-title="${id}"]`,
    );
    input?.focus();
    input?.select();
  }, [milestones]);

  function updateAt(index: number, changes: Partial<MilestoneFormValues>) {
    onChange(
      milestones.map((milestone, current) =>
        current === index ? { ...milestone, ...changes } : milestone,
      ),
    );
  }

  function add() {
    const id = generateId();
    focusNewRef.current = id;
    onChange([
      ...milestones,
      { id, title: DEFAULT_MILESTONE_TITLE, date: startDate || endDate, completed: false },
    ]);
  }

  const completed = milestones.filter((milestone) => milestone.completed).length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3
          id={headingId}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Diamond aria-hidden="true" className="size-3.5" />
          Marcos
          {milestones.length > 0 ? (
            <span className="font-mono text-subtle-foreground tabular-nums">
              {completed}/{milestones.length}
            </span>
          ) : null}
        </h3>
        <Button type="button" variant="ghost" size="xs" disabled={isFull} onClick={add}>
          <Plus />
          Adicionar marco
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-subtle-foreground">
          Marque entregas importantes, como “Versão beta” ou “Prova final”.
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-1.5">
          {milestones.map((milestone, index) => {
            const titleError = errors[`milestones.${String(index)}.title`];
            const dateError = errors[`milestones.${String(index)}.date`];
            const error = titleError ?? dateError;
            const position = String(index + 1);

            return (
              <li key={milestone.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={milestone.completed}
                    aria-label={`Marco ${position} concluído`}
                    onCheckedChange={(checked) => {
                      updateAt(index, { completed: checked === true });
                    }}
                  />
                  <Input
                    value={milestone.title}
                    maxLength={FIELD_LIMITS.milestoneTitleMax}
                    aria-label={`Título do marco ${position}`}
                    aria-invalid={titleError ? true : undefined}
                    data-milestone-title={milestone.id}
                    className={cn(
                      'h-8 min-w-0 flex-1',
                      milestone.completed && 'text-muted-foreground line-through',
                    )}
                    onChange={(event) => {
                      updateAt(index, { title: event.target.value });
                    }}
                  />
                  <Input
                    type="date"
                    value={milestone.date}
                    min={startDate || undefined}
                    max={endDate || undefined}
                    aria-label={`Data do marco ${position}`}
                    aria-invalid={dateError ? true : undefined}
                    className="h-8 w-36 shrink-0 tabular-nums"
                    onChange={(event) => {
                      updateAt(index, { date: event.target.value });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover marco ${position}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      onChange(milestones.filter((_, current) => current !== index));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {error ? <p className="pl-6 text-xs text-destructive">{error}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
