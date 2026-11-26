import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import { PROJECT_STATUSES, type ProjectStatus } from '@/types/project';

import {
  countSections,
  getHomeSection,
  groupByHorizon,
  isInSection,
  PROJECT_SECTIONS,
  searchProjects,
  selectSection,
  sortByTitle,
} from '../sections';

const AT = '2026-05-01T10:00:00.000Z';
const of = (status: ProjectStatus, extra: { hiddenAt?: string; deletedAt?: string } = {}) =>
  makeProject({ status, title: status, ...extra });

describe('sections', () => {
  const visible = PROJECT_STATUSES.map((status) => of(status));
  const hiddenCompleted = of('completed', { hiddenAt: AT });
  const trashedHidden = of('paused', { hiddenAt: AT, deletedAt: AT });
  const trashed = of('in_progress', { deletedAt: AT });
  const sample = makeProject({ status: 'in_progress', title: 'Exemplo', demo: true });
  const all = [...visible, hiddenCompleted, trashedHidden, trashed, sample];

  it('splits visible projects by status without overlap', () => {
    expect(selectSection(all, 'active').map((project) => project.status)).toEqual([
      'planned',
      'in_progress',
    ]);
    expect(selectSection(all, 'postponed').map((project) => project.status)).toEqual(['paused']);
    expect(selectSection(all, 'not_completed').map((project) => project.status)).toEqual([
      'cancelled',
    ]);
    expect(selectSection(all, 'completed')).toEqual([visible[3]]);

    for (const project of visible) {
      const statusSections = PROJECT_SECTIONS.filter(
        (section) => section !== 'all' && isInSection(project, section),
      );
      expect(statusSections).toHaveLength(1);
    }
  });

  it('keeps a hidden completed project in "Ocultos", not in "Concluídos"', () => {
    expect(isInSection(hiddenCompleted, 'hidden')).toBe(true);
    expect(isInSection(hiddenCompleted, 'completed')).toBe(false);
    expect(isInSection(hiddenCompleted, 'all')).toBe(false);
  });

  it('keeps a sample project in "Exemplos" only, whatever its status', () => {
    expect(PROJECT_SECTIONS.filter((section) => isInSection(sample, section))).toEqual([
      'examples',
    ]);
    expect(getHomeSection(sample)).toBe('examples');
  });

  it('puts every trashed project in the trash only', () => {
    for (const project of [trashedHidden, trashed]) {
      expect(PROJECT_SECTIONS.filter((section) => isInSection(project, section))).toEqual([
        'trash',
      ]);
    }
  });

  it('counts with the same rules as the lists', () => {
    const counts = countSections(all);
    expect(counts).toEqual({
      all: 5,
      active: 2,
      postponed: 1,
      not_completed: 1,
      completed: 1,
      hidden: 1,
      trash: 2,
      examples: 1,
    });
    for (const section of PROJECT_SECTIONS) {
      expect(counts[section]).toBe(selectSection(all, section).length);
    }
    expect(counts.active + counts.postponed + counts.not_completed + counts.completed).toBe(
      counts.all,
    );
  });

  it('counts nothing for an empty portfolio', () => {
    expect(Object.values(countSections([])).every((count) => count === 0)).toBe(true);
  });
});

describe('project search', () => {
  const titles = ['Ação social', 'Reforma da cozinha', 'Campanha de ação', 'Mudança'];
  const projects = titles.map((title) => makeProject({ title }));

  it('ignores case and accents, and puts titles starting with the query first', () => {
    expect(searchProjects(projects, 'ACAO').map((project) => project.title)).toEqual([
      'Ação social',
      'Campanha de ação',
    ]);
    expect(searchProjects(projects, '  mud ').map((project) => project.title)).toEqual(['Mudança']);
  });

  it('finds nothing for an empty query and searches hidden and trashed projects too', () => {
    expect(searchProjects(projects, '   ')).toEqual([]);
    const trashed = makeProject({ title: 'Antigo', deletedAt: AT });
    expect(searchProjects([trashed], 'anti')).toEqual([trashed]);
    expect(getHomeSection(trashed)).toBe('trash');
  });

  it('sorts by title in Portuguese order', () => {
    expect(sortByTitle(projects).map((project) => project.title)).toEqual([
      'Ação social',
      'Campanha de ação',
      'Mudança',
      'Reforma da cozinha',
    ]);
  });

  it('gives each project one home section', () => {
    expect(getHomeSection(of('paused'))).toBe('postponed');
    expect(getHomeSection(of('completed', { hiddenAt: AT }))).toBe('hidden');
    expect(getHomeSection(of('planned'))).toBe('active');
  });
});

describe('groupByHorizon', () => {
  it('splits by horizon in timeline order, sorted by title, without empty groups', () => {
    const projects = [
      makeProject({ title: 'Mestrado', horizon: 'long' }),
      makeProject({ title: 'Corrida', horizon: 'short' }),
      makeProject({ title: 'Aula', horizon: 'short' }),
    ];
    expect(
      groupByHorizon(projects).map((group) => [
        group.horizon,
        group.projects.map((project) => project.title),
      ]),
    ).toEqual([
      ['short', ['Aula', 'Corrida']],
      ['long', ['Mestrado']],
    ]);
    expect(groupByHorizon([])).toEqual([]);
  });
});
