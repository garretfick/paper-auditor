import { describe, it, expect } from 'vitest';
import {
  resolveBibEntry,
  type BibEntry,
  type OpenAlexClient,
} from '../src';

describe('resolveBibEntry', () => {
  it('returns FabricatedSource when OpenAlex returns a mismatched title for the DOI', async () => {
    const entry: BibEntry = {
      citationKey: 'wei2022',
      title: 'Emergent Abilities of Large Language Models',
      authors: ['Wei, Jason'],
      doi: '10.48550/arXiv.2206.07682',
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        return {
          title: 'Some Completely Different Paper',
          authors: ['Wei, Jason'],
        };
      },
      async lookupByArxiv() {
        return null;
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('fabricated-source');
  });

  it('returns resolved when the DOI lookup returns a matching title and authors', async () => {
    const entry: BibEntry = {
      citationKey: 'wei2022',
      title: 'Emergent Abilities of Large Language Models',
      authors: ['Wei, Jason'],
      doi: '10.48550/arXiv.2206.07682',
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        return {
          title: 'Emergent Abilities of Large Language Models',
          authors: ['Wei, Jason'],
        };
      },
      async lookupByArxiv() {
        return null;
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('resolved');
  });

  it('returns FabricatedSource when OpenAlex returns mismatched authors for the DOI', async () => {
    const entry: BibEntry = {
      citationKey: 'wei2022',
      title: 'Emergent Abilities of Large Language Models',
      authors: ['Wei, Jason'],
      doi: '10.48550/arXiv.2206.07682',
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        return {
          title: 'Emergent Abilities of Large Language Models',
          authors: ['Smith, John'],
        };
      },
      async lookupByArxiv() {
        return null;
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('fabricated-source');
  });

  it('falls back to arXiv lookup when there is no DOI and returns FabricatedSource on mismatch', async () => {
    const entry: BibEntry = {
      citationKey: 'preprint2023',
      title: 'A Preprint',
      authors: ['Author, A.'],
      arxivId: '2303.12345',
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error('DOI lookup should not be called when no DOI is present');
      },
      async lookupByArxiv() {
        return {
          title: 'Something Entirely Different',
          authors: ['Author, A.'],
        };
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('fabricated-source');
  });

  it('returns resolved without contacting OpenAlex when there is no DOI and no arXivID (slice 2 punts this case to slice 3)', async () => {
    const entry: BibEntry = {
      citationKey: 'somebook2020',
      title: 'A Book',
      authors: ['Author, A.'],
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error('DOI lookup should not be called');
      },
      async lookupByArxiv() {
        throw new Error('arXiv lookup should not be called');
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('resolved');
  });
});
