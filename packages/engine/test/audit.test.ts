import { describe, it, expect } from 'vitest';
import path from 'node:path';
import url from 'node:url';
import { audit } from '../src';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures');

describe('audit', () => {
  it('emits one UnresolvedCitation Finding for a Citation Key not in the Bibliography', async () => {
    const result = await audit(
      path.join(fixturesDir, 'unresolved-citation.md'),
      path.join(fixturesDir, 'unresolved-citation.bib'),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.type).toBe('UnresolvedCitation');
    expect(result.findings[0]!.subject).toContain('nonexistent');
  });
});
