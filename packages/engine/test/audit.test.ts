import { describe, it, expect } from 'vitest';
import path from 'node:path';
import url from 'node:url';
import {
  audit,
  stubClaimExtractor,
  type CitationFilter,
  type OpenAlexClient,
} from '../src';

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

  it('emits a FabricatedSource Finding when an injected OpenAlex client reports a DOI mismatch', async () => {
    const fakeClient: OpenAlexClient = {
      async lookupByDoi() {
        return {
          title: 'A Completely Different Title',
          authors: ['Wei, Jason'],
        };
      },
      async lookupByArxiv() {
        return null;
      },
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called for DOI-bearing entries',
        );
      },
    };

    const result = await audit(
      path.join(fixturesDir, 'with-doi.md'),
      path.join(fixturesDir, 'with-doi.bib'),
      { openAlexClient: fakeClient },
    );

    expect(result.findings.some((f) => f.type === 'FabricatedSource')).toBe(
      true,
    );
  });

  it('emits an UnverifiableSource Finding when title+author search returns no candidate', async () => {
    const fakeClient: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error(
          'lookupByDoi should not be called for entries without DOI',
        );
      },
      async lookupByArxiv() {
        throw new Error(
          'lookupByArxiv should not be called for entries without arXiv ID',
        );
      },
      async searchByTitleAuthor() {
        return null;
      },
    };

    const result = await audit(
      path.join(fixturesDir, 'needs-search.md'),
      path.join(fixturesDir, 'needs-search.bib'),
      { openAlexClient: fakeClient },
    );

    expect(result.findings.some((f) => f.type === 'UnverifiableSource')).toBe(
      true,
    );
  });

  it('resolves author-year Citations by surname+year and flags only the unmatched one', async () => {
    const result = await audit(
      path.join(fixturesDir, 'author-year.md'),
      path.join(fixturesDir, 'author-year.bib'),
    );

    // (Wei, 2022) and Smith et al. (2019) resolve against the Bibliography;
    // (Nguyen, 1999) has no matching Source.
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.type).toBe('UnresolvedCitation');
    expect(finding.subject).toBe('(Nguyen, 1999)');
  });

  it('lets a Citation Filter drop a citation-shaped false positive before resolution', async () => {
    const paperPath = path.join(fixturesDir, 'crossref.md');
    const bibPath = path.join(fixturesDir, 'crossref.bib');

    // Without a Filter, the pandoc-crossref [@fig:overview] is mistaken for a
    // Citation and surfaces as an UnresolvedCitation.
    const unfiltered = await audit(paperPath, bibPath);
    expect(
      unfiltered.findings.some(
        (f) => f.type === 'UnresolvedCitation' && f.subject.includes('fig'),
      ),
    ).toBe(true);

    // A Filter that recognizes the cross-reference removes it; wei2022 resolves.
    const dropCrossRefs: CitationFilter = (_paper, candidates) =>
      Promise.resolve(candidates.filter((c) => c.citationKey !== 'fig'));
    const filtered = await audit(paperPath, bibPath, {
      citationFilter: dropCrossRefs,
    });
    expect(filtered.findings).toHaveLength(0);
  });

  it('emits UncitedClaim Findings via the injected ClaimExtractor', async () => {
    const result = await audit(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
      { claimExtractor: stubClaimExtractor },
    );

    expect(result.findings.some((f) => f.type === 'UncitedClaim')).toBe(true);
  });
});
