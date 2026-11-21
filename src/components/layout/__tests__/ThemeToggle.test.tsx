import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/app/ThemeProvider';
import { THEME_STORAGE_KEY } from '@/lib/theme';

import { ThemeToggle } from '../ThemeToggle';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.className = '';
  });

  it('applies the dark theme by default', () => {
    renderToggle();

    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Tema: Escuro' })).toBeInTheDocument();
  });

  it('restores the saved preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderToggle();

    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('switches theme and persists the choice', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Tema: Escuro' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Claro' }));

    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(screen.getByRole('button', { name: 'Tema: Claro' })).toBeInTheDocument();
  });

  it('follows the system preference when set to "system"', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Tema: Escuro' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Sistema' }));

    // The test setup mocks matchMedia as "light".
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});
