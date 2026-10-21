import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, CURRENT_PHASE } from '@shared/constants/navigation';

/**
 * Every nav item must lead somewhere.
 *
 * Two Phase 1 screens were deferred, and when the phase marker moved past
 * them their sidebar links started 404ing — the router generated placeholders
 * only for *future* phases. These tests pin both halves of the fix: nothing
 * 404s, and a screen claimed as delivered really is built or explicitly
 * marked deferred.
 */
describe('routing covers the nav model', () => {
  // jsdom gives import.meta.url an http origin, so resolve from the cwd.
  const source = readFileSync(path.resolve('src/app/router/index.jsx'), 'utf8');
  const isImplemented = (item) => source.includes(`path: '${item.path}'`);

  it('builds or explicitly defers every screen up to the current phase', () => {
    const unexplained = ALL_NAV_ITEMS
      .filter((item) => item.phase <= CURRENT_PHASE)
      .filter((item) => !isImplemented(item) && !item.deferred)
      .map((item) => `${item.label} → ${item.path}`);

    expect(unexplained).toEqual([]);
  });

  it('leaves nothing in the sidebar without a route', () => {
    // Anything not implemented must fall to the placeholder generator, which
    // keys off the implemented set rather than off the phase number.
    const generator = source.slice(source.indexOf('const placeholderRoutes'));
    expect(generator).toContain('ALL_NAV_ITEMS.filter((item) => !implementedPaths.has(item.path))');
  });

  it('says which phase now carries a deferred screen', () => {
    for (const item of ALL_NAV_ITEMS.filter((i) => i.deferred)) {
      expect(item.deferred, item.path).toBeGreaterThan(item.phase);
    }
  });
});
