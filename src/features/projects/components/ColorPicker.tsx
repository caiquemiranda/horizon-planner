import { Check } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';
import { PROJECT_COLORS, type ProjectColor } from '@/types/project';

import { COLOR_META } from '../constants';

interface ColorPickerProps {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  'aria-labelledby'?: string;
}

/** Swatches as an accessible radio group (arrow keys move the selection). */
export function ColorPicker({ value, onChange, ...props }: ColorPickerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;

    event.preventDefault();
    const index = PROJECT_COLORS.indexOf(value);
    const next = PROJECT_COLORS[(index + step + PROJECT_COLORS.length) % PROJECT_COLORS.length];
    if (!next) return;

    onChange(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLElement>(`[data-color="${next}"]`)
      ?.focus();
  }

  return (
    <div role="radiogroup" className="flex flex-wrap gap-2" {...props}>
      {PROJECT_COLORS.map((color) => {
        const meta = COLOR_META[color];
        const checked = color === value;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={meta.label}
            title={meta.label}
            data-color={color}
            tabIndex={checked ? 0 : -1}
            onKeyDown={handleKeyDown}
            onClick={() => {
              onChange(color);
            }}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform duration-(--duration-fast) hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              meta.swatchClassName,
              checked && 'ring-2 ring-foreground/70',
            )}
          >
            {checked ? <Check aria-hidden="true" className="size-3.5 text-white" /> : null}
          </button>
        );
      })}
    </div>
  );
}
