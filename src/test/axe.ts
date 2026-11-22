import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core on the document and fails with a readable list of violations.
 *
 * jsdom has no layout or computed colors, so rules that need them (color contrast,
 * target size, …) cannot run here; contrast is covered by the design tokens instead.
 */
export async function expectNoAxeViolations(context: axe.ElementContext = document.body) {
  const results = await axe.run(context, {
    resultTypes: ['violations'],
    rules: {
      'color-contrast': { enabled: false },
      // Tests render components without the page skeleton (no <main> landmark, no title).
      'page-has-heading-one': { enabled: false },
      region: { enabled: false },
    },
  });

  const report = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help}\n${violation.nodes
        .map((node) => `  - ${node.target.join(' ')}`)
        .join('\n')}`,
  );
  expect(report, report.join('\n\n')).toEqual([]);
}
