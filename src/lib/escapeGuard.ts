/**
 * Lets a gesture claim the Escape key while it runs (e.g. cancelling a bar drag), so a
 * surrounding dialog does not also close on the same key press. Dialogs listen to Escape
 * before the gesture handlers do, so they ask here first.
 */
let holders = 0;

/** Claims Escape until the returned function is called (call it exactly once). */
export function holdEscape(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
  };
}

export function isEscapeHeld(): boolean {
  return holders > 0;
}

/** Whether Escape belongs to the focused element, e.g. cancelling a cell edit. */
export function isEditingText(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}
