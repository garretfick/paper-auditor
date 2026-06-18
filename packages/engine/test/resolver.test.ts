import { describe, it, expect } from 'vitest';
import { resolveBibEntry, type BibEntry, type OpenAlexClient } from '../src';

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
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called when a DOI is present',
        );
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
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called when a DOI is present',
        );
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
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called when a DOI is present',
        );
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
        throw new Error(
          'DOI lookup should not be called when no DOI is present',
        );
      },
      async lookupByArxiv() {
        return {
          title: 'Something Entirely Different',
          authors: ['Author, A.'],
        };
      },
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called when an arXiv ID is present',
        );
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('fabricated-source');
  });

  it('falls back to title+author search when there is no DOI or arXiv ID and returns resolved on a matching record', async () => {
    let searchCalledWith: { title: string; author: string } | null = null;

    const entry: BibEntry = {
      citationKey: 'somebook2020',
      title: 'A Book About Things',
      authors: ['Smith, Jane'],
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error('DOI lookup should not be called when there is no DOI');
      },
      async lookupByArxiv() {
        throw new Error(
          'arXiv lookup should not be called when there is no arXivID',
        );
      },
      async searchByTitleAuthor(title, author) {
        searchCalledWith = { title, author };
        return {
          title: 'A Book About Things',
          authors: ['Smith, Jane'],
        };
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(searchCalledWith).toEqual({
      title: 'A Book About Things',
      author: 'Smith, Jane',
    });
    expect(resolution.kind).toBe('resolved');
  });

  it('returns FabricatedSource when title+author search returns a non-matching candidate', async () => {
    const entry: BibEntry = {
      citationKey: 'somebook2020',
      title: 'My Original Book Title',
      authors: ['Smith, Jane'],
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error('DOI lookup should not be called when there is no DOI');
      },
      async lookupByArxiv() {
        throw new Error(
          'arXiv lookup should not be called when there is no arXivID',
        );
      },
      async searchByTitleAuthor() {
        return {
          title: 'Different Title But Returned Anyway',
          authors: ['Other, Person'],
        };
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('fabricated-source');
  });

  it('returns UnverifiableSource when title+author search finds no candidate', async () => {
    const entry: BibEntry = {
      citationKey: 'obscurebook',
      title: 'A Very Obscure Book',
      authors: ['Unknown, Person'],
    };

    const client: OpenAlexClient = {
      async lookupByDoi() {
        throw new Error('DOI lookup should not be called when there is no DOI');
      },
      async lookupByArxiv() {
        throw new Error(
          'arXiv lookup should not be called when there is no arXivID',
        );
      },
      async searchByTitleAuthor() {
        return null;
      },
    };

    const resolution = await resolveBibEntry(entry, client);

    expect(resolution.kind).toBe('unverifiable-source');
  });
});
