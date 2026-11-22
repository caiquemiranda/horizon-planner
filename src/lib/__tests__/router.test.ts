import { describe, expect, it } from 'vitest';

import { parseRoute, projectHref } from '../router';

describe('router', () => {
  it('parses the portfolio and unknown hashes as the portfolio', () => {
    expect(parseRoute('')).toEqual({ name: 'portfolio' });
    expect(parseRoute('#/')).toEqual({ name: 'portfolio' });
    expect(parseRoute('#timeline')).toEqual({ name: 'portfolio' });
    expect(parseRoute('#/projetos/')).toEqual({ name: 'portfolio' });
  });

  it('round-trips project ids, including characters that need escaping', () => {
    for (const id of ['00000000-0000-4000-8000-000000000001', 'a b/ç']) {
      expect(parseRoute(projectHref(id))).toEqual({ name: 'project', projectId: id });
    }
  });

  it('ignores malformed escapes', () => {
    expect(parseRoute('#/projetos/%E0%A4%A')).toEqual({ name: 'portfolio' });
  });
});
