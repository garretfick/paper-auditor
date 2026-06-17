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

  it('emits zero Findings when every Citation Key resolves in the Bibliography', async () => {
    const result = await audit(
      path.join(fixturesDir, 'all-resolved.md'),
      path.join(fixturesDir, 'all-resolved.bib'),
    );

    expect(result.findings).toHaveLength(0);
  });

  it('emits one Finding per key in a multi-key Citation', async () => {
    const result = await audit(
      path.join(fixturesDir, 'multikey-citation.md'),
      path.join(fixturesDir, 'multikey-citation.bib'),
    );

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.subject)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('alpha'),
        expect.stringContaining('beta'),
      ]),
    );
  });

  it('rejects with a friendly error when the Bibliography is malformed', async () => {
    await expect(
      audit(
        path.join(fixturesDir, 'unresolved-citation.md'),
        path.join(fixturesDir, 'malformed.bib'),
      ),
    ).rejects.toThrow(/BibTeX/i);
  });

  it('rejects with a friendly error when the Paper file is missing', async () => {
    await expect(
      audit(
        path.join(fixturesDir, 'does-not-exist.md'),
        path.join(fixturesDir, 'unresolved-citation.bib'),
      ),
    ).rejects.toThrow(/Paper/);
  });
});
