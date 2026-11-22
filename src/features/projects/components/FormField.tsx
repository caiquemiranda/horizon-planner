import { cloneElement, type ReactElement, type ReactNode, useId } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

interface FormFieldProps {
  label: string;
  /**
   * A single form control, which receives `id`, `aria-invalid` and `aria-describedby`.
   * Use a function when the focusable element is nested (e.g. a Select trigger).
   */
  children: ReactElement<ControlProps> | ((controlProps: ControlProps) => ReactNode);
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired for screen readers. */
export function FormField({ label, children, error, hint, className }: FormFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const controlProps: ControlProps = {
    id,
    ...(error ? { 'aria-invalid': true } : {}),
    ...(message ? { 'aria-describedby': messageId } : {}),
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {typeof children === 'function'
        ? children(controlProps)
        : cloneElement(children, controlProps)}
      {message ? (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-destructive' : 'text-subtle-foreground')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
