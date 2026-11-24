import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_HREF,
  HIDDEN_HREF,
  IMPORT_HREF,
  parseRoute,
  projectHref,
  SECTION_HREFS,
  TRASH_HREF,
} from '../router';

describe('router', () => {
  it('parses the portfolio and unknown hashes as the portfolio', () => {
    expect(parseRoute('')).toEqual({ name: 'portfolio', section: 'all' });
    expect(parseRoute('#/')).toEqual({ name: 'portfolio', section: 'all' });
    expect(parseRoute('#timeline')).toEqual({ name: 'portfolio', section: 'all' });
    expect(parseRoute('#/projetos/')).toEqual({ name: 'portfolio', section: 'all' });
  });

  it('round-trips project ids, including characters that need escaping', () => {
    for (const id of ['00000000-0000-4000-8000-000000000001', 'a b/ç']) {
      expect(parseRoute(projectHref(id))).toEqual({ name: 'project', projectId: id });
    }
  });

  it('parses the timeline sections', () => {
    expect(parseRoute(SECTION_HREFS.active)).toEqual({ name: 'portfolio', section: 'active' });
    expect(parseRoute('#/nao-concluidos/')).toEqual({
      name: 'portfolio',
      section: 'not_completed',
    });
    expect(parseRoute(SECTION_HREFS.completed)).toEqual({
      name: 'portfolio',
      section: 'completed',
    });
  });

  it('parses the hidden projects and the trash', () => {
    expect(parseRoute(HIDDEN_HREF)).toEqual({ name: 'hidden' });
    expect(parseRoute(`${TRASH_HREF}/`)).toEqual({ name: 'trash' });
    expect(parseRoute(DASHBOARD_HREF)).toEqual({ name: 'dashboard' });
    expect(parseRoute(IMPORT_HREF)).toEqual({ name: 'import' });
  });

  it('ignores malformed escapes', () => {
    expect(parseRoute('#/projetos/%E0%A4%A')).toEqual({ name: 'portfolio', section: 'all' });
  });
});
