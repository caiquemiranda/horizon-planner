import { useSyncExternalStore } from 'react';

import type { ProjectSection, TimelineSection } from '@/features/projects/lib/sections';
import type { UUID } from '@/types/project';

/**
 * Minimal hash router. Hash URLs (`#/projetos/<id>`) work on static hosting such as
 * GitHub Pages without server rewrites, and keep the browser's back button working.
 *
 * Routes:
 * - `#/` (or anything unknown): the portfolio timeline with every visible project;
 * - `#/ativos`, `#/adiados`, `#/nao-concluidos`, `#/concluidos`: one section of it;
 * - `#/projetos/<projectId>`: the planning workspace of one project;
 * - `#/ocultos` and `#/lixeira`: hidden projects and the trash;
 * - `#/painel`: portfolio statistics ("Meu painel").
 */

export type Route =
  | { name: 'portfolio'; section: TimelineSection }
  | { name: 'project'; projectId: UUID }
  | { name: 'hidden' }
  | { name: 'trash' }
  | { name: 'dashboard' };

const PROJECT_PATTERN = /^#\/projetos\/([^/?#]+)\/?$/;

export const PORTFOLIO_HREF = '#/';
export const HIDDEN_HREF = '#/ocultos';
export const TRASH_HREF = '#/lixeira';
export const DASHBOARD_HREF = '#/painel';

/** Address of every navigation section. */
export const SECTION_HREFS = {
  all: PORTFOLIO_HREF,
  active: '#/ativos',
  postponed: '#/adiados',
  not_completed: '#/nao-concluidos',
  completed: '#/concluidos',
  hidden: HIDDEN_HREF,
  trash: TRASH_HREF,
} as const satisfies Record<ProjectSection, string>;

const TIMELINE_SECTIONS_BY_HREF = new Map<string, TimelineSection>([
  [SECTION_HREFS.active, 'active'],
  [SECTION_HREFS.postponed, 'postponed'],
  [SECTION_HREFS.not_completed, 'not_completed'],
  [SECTION_HREFS.completed, 'completed'],
]);

export function projectHref(projectId: UUID): string {
  return `#/projetos/${encodeURIComponent(projectId)}`;
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/\/$/, '');
  if (path === HIDDEN_HREF) return { name: 'hidden' };
  if (path === TRASH_HREF) return { name: 'trash' };
  if (path === DASHBOARD_HREF) return { name: 'dashboard' };
  const section = TIMELINE_SECTIONS_BY_HREF.get(path);
  if (section) return { name: 'portfolio', section };
  const match = PROJECT_PATTERN.exec(hash);
  if (match?.[1]) {
    try {
      return { name: 'project', projectId: decodeURIComponent(match[1]) };
    } catch {
      // Malformed escape sequence: fall back to the portfolio.
    }
  }
  return { name: 'portfolio', section: 'all' };
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

const getHash = () => window.location.hash;

/** The current route; re-renders on navigation (links, back/forward buttons). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  // Parse outside the snapshot so the snapshot stays a stable string.
  return parseRoute(hash);
}

export function navigate(href: string): void {
  if (window.location.hash !== href) window.location.hash = href;
}
