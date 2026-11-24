import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectsStore } from '@/features/projects/store/projectsStore';
import {
  LANE_COLUMN_STORAGE_KEY,
  useLaneColumnStore,
} from '@/features/timeline/store/laneColumnStore';
import { PORTFOLIO_HREF } from '@/lib/router';
import { projectRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';

import { App } from '../App';
import { Providers } from '../providers';

async function renderPortfolio() {
  window.location.hash = PORTFOLIO_HREF;
  await projectRepository.replaceAll([
    makeProject({ title: 'Corrida', horizon: 'short', progress: 55 }),
    makeProject({ title: 'Mestrado', horizon: 'long' }),
  ]);
  useProjectsStore.setState({ projects: [], status: 'idle', error: null });
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

describe('compact timeline column', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLaneColumnStore.setState({ compact: false });
  });

  it('shrinks to a strip, keeps every name for assistive technology and is remembered', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const toggle = screen.getByRole('button', { name: 'Recolher coluna de projetos' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Expandir coluna de projetos' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const section = screen.getByLabelText('Horizontes', { selector: 'section' });
    expect(section).toHaveClass('w-11');
    // Names and lanes stay in the accessible tree, and rows still select projects.
    const short = within(section).getByRole('list', { name: 'Projetos de curto prazo' });
    expect(within(short).getByRole('button', { name: /Corrida/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(LANE_COLUMN_STORAGE_KEY)).toBe('compact');

    await user.hover(within(short).getByRole('button', { name: /Corrida/ }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Corrida · 55%');
  });

  it('still folds a horizon when compact', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    await user.click(screen.getByRole('button', { name: 'Recolher coluna de projetos' }));
    const section = screen.getByLabelText('Horizontes', { selector: 'section' });
    const lane = within(section).getByRole('button', { name: /Longo prazo/ });
    expect(lane).toHaveAttribute('aria-expanded', 'true');
    await user.click(lane);
    expect(lane).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no axe violations when compact', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    await user.click(screen.getByRole('button', { name: 'Recolher coluna de projetos' }));
    await expectNoAxeViolations(document.body);
  });
});
