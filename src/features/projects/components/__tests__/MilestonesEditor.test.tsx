import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { FIELD_LIMITS } from '../../constants';
import type { FormErrors, MilestoneFormValues } from '../../lib/form';
import { MilestonesEditor } from '../MilestonesEditor';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_NEW = '00000000-0000-4000-8000-0000000000ff';

function Harness({
  initial = [],
  errors = {},
  onValue,
}: {
  initial?: MilestoneFormValues[];
  errors?: FormErrors;
  onValue?: (milestones: MilestoneFormValues[]) => void;
}) {
  const [milestones, setMilestones] = useState(initial);
  return (
    <MilestonesEditor
      milestones={milestones}
      errors={errors}
      startDate="2026-03-01"
      endDate="2026-06-30"
      generateId={() => ID_NEW}
      onChange={(next) => {
        setMilestones(next);
        onValue?.(next);
      }}
    />
  );
}

const beta: MilestoneFormValues = {
  id: ID_A,
  title: 'Beta',
  date: '2026-04-15',
  completed: false,
};

describe('MilestonesEditor', () => {
  it('shows a hint when there are no milestones', () => {
    render(<Harness />);
    expect(screen.getByText(/Marque entregas importantes/)).toBeInTheDocument();
  });

  it('adds a milestone at the project start and focuses its title', async () => {
    const user = userEvent.setup();
    let latest: MilestoneFormValues[] = [];
    render(
      <Harness
        onValue={(value) => {
          latest = value;
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar marco' }));

    expect(latest).toEqual([
      { id: ID_NEW, title: 'Novo marco', date: '2026-03-01', completed: false },
    ]);
    expect(screen.getByRole('textbox', { name: 'Título do marco 1' })).toHaveFocus();
  });

  it('edits, completes and removes a milestone', async () => {
    const user = userEvent.setup();
    let latest: MilestoneFormValues[] = [beta];
    render(
      <Harness
        initial={[beta]}
        onValue={(value) => {
          latest = value;
        }}
      />,
    );

    const title = screen.getByRole('textbox', { name: 'Título do marco 1' });
    await user.clear(title);
    await user.type(title, 'Lançamento');
    await user.click(screen.getByRole('checkbox', { name: 'Marco 1 concluído' }));

    expect(latest[0]).toMatchObject({ title: 'Lançamento', completed: true });
    expect(screen.getByText('1/1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover marco 1' }));
    expect(latest).toEqual([]);
  });

  it('shows validation errors for a milestone', () => {
    render(
      <Harness
        initial={[beta]}
        errors={{ 'milestones.0.date': 'O marco deve estar entre as datas.' }}
      />,
    );

    expect(screen.getByText('O marco deve estar entre as datas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Data do marco 1')).toHaveAttribute('aria-invalid', 'true');
  });

  it('stops adding at the limit', () => {
    const full = Array.from({ length: FIELD_LIMITS.milestonesMax }, (_, index) => ({
      ...beta,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    render(<Harness initial={full} />);

    expect(screen.getByRole('button', { name: 'Adicionar marco' })).toBeDisabled();
  });
});
