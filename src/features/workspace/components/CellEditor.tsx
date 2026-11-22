import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { ColumnDef } from '../lib/columns';

export type EditorExit = 'down' | 'next' | 'previous' | null;

interface CellEditorProps {
  column: ColumnDef;
  initialValue: string;
  label: string;
  /** Message of the last refused value, if any. */
  error: string | null;
  errorId: string;
  /** Applies the value; returns `false` (and the grid shows `error`) when refused. */
  onCommit: (value: string, exit: EditorExit) => boolean;
  onCancel: () => void;
}

/**
 * The input of a cell being edited. It owns the typed value, so typing re-renders only
 * this cell, not the whole table. Enter confirms and goes down, Tab confirms and moves
 * to the next editable cell, Esc cancels, and leaving the cell confirms.
 */
export function CellEditor({
  column,
  initialValue,
  label,
  error,
  errorId,
  onCommit,
  onCancel,
}: CellEditorProps) {
  const [value, setValue] = useState(initialValue);
  // Hide the message as soon as the user changes the value again.
  const [shownError, setShownError] = useState(error);
  const [lastError, setLastError] = useState(error);
  if (error !== lastError) {
    setLastError(error);
    setShownError(error);
  }
  // Enter/Tab/Esc close the editor; the blur that follows must not commit again.
  const closed = useRef(false);

  const finish = (exit: EditorExit) => {
    if (closed.current) return;
    if (onCommit(value, exit)) closed.current = true;
  };

  return (
    <>
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the cell was just opened for editing
        autoFocus
        type={column.key === 'start' || column.key === 'finish' ? 'date' : 'text'}
        inputMode={column.key === 'duration' || column.key === 'progress' ? 'numeric' : undefined}
        aria-label={label}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShownError(null);
        }}
        onFocus={(event) => {
          if (event.target.type === 'text') event.target.select();
        }}
        onBlur={() => {
          finish(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finish('down');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            finish(event.shiftKey ? 'previous' : 'next');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            closed.current = true;
            onCancel();
          }
        }}
        className={cn(
          'h-7 w-full min-w-0 rounded-sm border bg-background px-1.5 text-[13px] font-normal text-foreground outline-none focus:border-ring',
          column.align === 'end' && 'text-right',
          shownError && 'border-destructive',
        )}
      />
      {shownError ? (
        <p
          id={errorId}
          role="alert"
          className="absolute top-full left-0 z-20 mt-0.5 w-64 rounded-md border border-destructive/40 bg-popover px-2 py-1.5 text-xs font-normal text-foreground shadow-popover"
        >
          {shownError}
        </p>
      ) : null}
    </>
  );
}
