import type { ZoomPresetId } from '@/types/timeline';

import { ZOOM_PRESETS } from './ticks';

export type ShortcutAction =
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  /** Fraction of the visible width; negative goes back in time. */
  | { type: 'pan'; widthFraction: number }
  | { type: 'today' }
  | { type: 'fit' }
  | { type: 'preset'; presetId: ZoomPresetId }
  | { type: 'help' };

/** The subset of `KeyboardEvent` the shortcuts need (easy to build in tests). */
export interface ShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** Whether focus is in a text field, where keys must keep their normal meaning. */
  isEditing: boolean;
}

const PAN_STEP = 0.2;
const PAN_PAGE = 0.8;

/** Maps a key press to a timeline action, or `null` to let the browser handle it. */
export function resolveShortcut(input: ShortcutInput): ShortcutAction | null {
  if (input.isEditing || input.ctrlKey || input.metaKey || input.altKey) return null;

  const pan = input.shiftKey ? PAN_PAGE : PAN_STEP;

  switch (input.key) {
    case '+':
    case '=':
      return { type: 'zoom-in' };
    case '-':
    case '_':
      return { type: 'zoom-out' };
    case 'ArrowLeft':
      return { type: 'pan', widthFraction: -pan };
    case 'ArrowRight':
      return { type: 'pan', widthFraction: pan };
    case 't':
    case 'T':
      return { type: 'today' };
    case 'f':
    case 'F':
      return { type: 'fit' };
    case '?':
      return { type: 'help' };
  }

  const presetIndex = Number(input.key) - 1;
  const preset = Number.isInteger(presetIndex) ? ZOOM_PRESETS[presetIndex] : undefined;
  return preset ? { type: 'preset', presetId: preset.id } : null;
}

/** Whether keyboard focus is in a place that types text. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export interface ShortcutHelp {
  keys: string[];
  label: string;
}

/** Shortcuts shown in the help panel, in display order. */
export const SHORTCUT_HELP: readonly ShortcutHelp[] = [
  { keys: ['Ctrl', 'Scroll'], label: 'Zoom no cursor (ou pinça)' },
  { keys: ['Shift', 'Scroll'], label: 'Mover no tempo (ou arrastar)' },
  { keys: ['+', '−'], label: 'Aumentar / diminuir zoom' },
  { keys: ['←', '→'], label: 'Mover no tempo (Shift: página)' },
  { keys: ['1', '5'], label: 'Escala: anos … dias' },
  { keys: ['T'], label: 'Ir para hoje' },
  { keys: ['F'], label: 'Ajustar todos os projetos' },
  { keys: ['?'], label: 'Mostrar atalhos' },
];
