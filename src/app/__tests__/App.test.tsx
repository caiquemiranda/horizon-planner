import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import { Providers } from '../providers';

function renderApp() {
  return render(
    <Providers>
      <App />
    </Providers>,
  );
}

describe('App', () => {
  it('renders the application title and version', () => {
    renderApp();

    expect(screen.getByRole('heading', { level: 1, name: 'Horizon' })).toBeInTheDocument();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it('shows the three planning horizons', () => {
    renderApp();

    for (const label of ['Curto prazo', 'Médio prazo', 'Longo prazo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the empty state', () => {
    renderApp();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Sua linha do tempo está vazia' }),
    ).toBeInTheDocument();
  });
});
