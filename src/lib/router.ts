import { useSyncExternalStore } from 'react';

import type { UUID } from '@/types/project';

/**
 * Minimal hash router. Hash URLs (`#/projetos/<id>`) work on static hosting such as
 * GitHub Pages without server rewrites, and keep the browser's back button working.
 *
 * Routes:
 * - `#/` (or anything unknown): the portfolio timeline;
 * - `#/projetos/<projectId>`: the planning workspace of one project;
 * - `#/ocultos` and `#/lixeira`: hidden projects and the trash.
 */

export type Route =
  | { name: 'portfolio' }
  | { name: 'project'; projectId: UUID }
  | { name: 'hidden' }
  | { name: 'trash' };

const PROJECT_PATTERN = /^#\/projetos\/([^/?#]+)\/?$/;

export const PORTFOLIO_HREF = '#/';
export const HIDDEN_HREF = '#/ocultos';
export const TRASH_HREF = '#/lixeira';

export function projectHref(projectId: UUID): string {
  return `#/projetos/${encodeURIComponent(projectId)}`;
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/\/$/, '');
  if (path === HIDDEN_HREF) return { name: 'hidden' };
  if (path === TRASH_HREF) return { name: 'trash' };
  const match = PROJECT_PATTERN.exec(hash);
  if (match?.[1]) {
    try {
      return { name: 'project', projectId: decodeURIComponent(match[1]) };
    } catch {
      // Malformed escape sequence: fall back to the portfolio.
    }
  }
  return { name: 'portfolio' };
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
