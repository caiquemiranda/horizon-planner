import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WEEKDAY_LABELS } from '@/features/schedule/lib/calendar';
import { formatDate } from '@/features/timeline/lib/format';
import { cn } from '@/lib/utils';
import type { ISODate } from '@/types/project';
import type { CalendarHoliday, ProjectCalendar, Weekday } from '@/types/schedule';

interface CalendarDialogProps {
  open: boolean;
  calendar: ProjectCalendar;
  readOnly: boolean;
  onClose: () => void;
  /** Applies the calendar; returns an error message or `null`. */
  onSave: (calendar: ProjectCalendar) => string | null;
}

/** Monday first, as in a Brazilian work week. */
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const fieldClass =
  'h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

/**
 * The project calendar used to count durations and place tasks: working weekdays and
 * holidays. Saving reschedules every task; nothing is hardcoded in the engine.
 */
export function CalendarDialog({ open, calendar, readOnly, onClose, onSave }: CalendarDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        {/* Remounted on every opening, so the draft starts from the saved calendar. */}
        {open ? (
          <CalendarForm calendar={calendar} readOnly={readOnly} onClose={onClose} onSave={onSave} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CalendarForm({ calendar, readOnly, onClose, onSave }: Omit<CalendarDialogProps, 'open'>) {
  const [weekdays, setWeekdays] = useState<Weekday[]>(calendar.workingWeekdays);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>(calendar.holidays);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setError('Informe a data do feriado.');
      return;
    }
    if (holidays.some((holiday) => holiday.date === newDate)) {
      setError('Já existe um feriado nessa data.');
      return;
    }
    setHolidays(
      [...holidays, { date: newDate as ISODate, name: newName.trim() || 'Feriado' }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setNewDate('');
    setNewName('');
    setError(null);
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly) return;
        const message = onSave({ workingWeekdays: weekdays, holidays });
        if (message) setError(message);
        else onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>Calendário do projeto</DialogTitle>
        <DialogDescription>
          Durações contam só dias úteis. Ao salvar, todas as tarefas são reagendadas.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2" disabled={readOnly}>
        <legend className="mb-1 text-label">Dias úteis</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((weekday) => {
            const checked = weekdays.includes(weekday);
            return (
              <label
                key={weekday}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/40',
                  checked && 'border-ring bg-accent',
                )}
              >
                <input
                  type="checkbox"
                  className="size-3.5 accent-current"
                  checked={checked}
                  aria-label={WEEKDAY_LABELS[weekday].long}
                  onChange={() => {
                    setWeekdays(
                      checked ? weekdays.filter((day) => day !== weekday) : [...weekdays, weekday],
                    );
                  }}
                />
                {WEEKDAY_LABELS[weekday].short}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-2" disabled={readOnly}>
        <legend className="mb-1 text-label">Feriados e folgas</legend>
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum feriado cadastrado.</p>
        ) : (
          <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {holidays.map((holiday) => (
              <li
                key={holiday.date}
                className="flex items-center gap-2 rounded-md border px-2 py-1"
              >
                <span className="w-28 shrink-0 font-mono text-xs tabular-nums">
                  {formatDate(holiday.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{holiday.name}</span>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remover feriado ${holiday.name} de ${formatDate(holiday.date)}`}
                    onClick={() => {
                      setHolidays(holidays.filter((item) => item.date !== holiday.date));
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Data do feriado"
              value={newDate}
              onChange={(event) => {
                setNewDate(event.target.value);
              }}
              className={fieldClass}
            />
            <input
              type="text"
              aria-label="Nome do feriado"
              placeholder="Nome (opcional)"
              maxLength={120}
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addHoliday();
                }
              }}
              className={cn(fieldClass, 'min-w-0 flex-1')}
            />
            <Button type="button" variant="outline" size="sm" onClick={addHoliday}>
              Adicionar feriado
            </Button>
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {readOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        {!readOnly ? <Button type="submit">Salvar calendário</Button> : null}
      </div>
    </form>
  );
}
