import { describe, it, expect } from 'vitest';
import path from 'node:path';
import url from 'node:url';
import { loadPaper, stubClaimExtractor } from '../src';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures');

describe('stubClaimExtractor', () => {
  it('emits one Background Claim per Sentence with low Confidence', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
    );

    const claims = await stubClaimExtractor(paper);

    expect(claims).toHaveLength(2);
    for (const claim of claims) {
      expect(claim.type).toBe('Background');
      expect(claim.confidence).toBe('low');
    }
  });

  it('attaches Citations whose span falls inside the Sentence span', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'cite-in-sentence.md'),
      path.join(fixturesDir, 'cite-in-sentence.bib'),
    );

    const claims = await stubClaimExtractor(paper);

    expect(claims.some((c) => c.citationKeys.includes('wei2022'))).toBe(true);
  });
});
