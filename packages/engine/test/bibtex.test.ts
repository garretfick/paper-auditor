import { describe, it, expect } from 'vitest';
import { parseBibliography } from '../src';

describe('parseBibliography', () => {
  it('extracts the citationKey and title from a single article entry', () => {
    const bibtex = `@article{wei2022,
  title = {Emergent Abilities of Large Language Models},
  year = {2022}
}`;

    const entries = parseBibliography(bibtex);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.citationKey).toBe('wei2022');
    // Parser lowercases titles per BibTeX convention (single-brace values are
    // case-foldable); double braces or {Word} groupings preserve case.
    expect(entries[0]!.title).toMatch(/emergent abilities of large language models/i);
  });

  it('extracts authors as a list, splitting on " and "', () => {
    const bibtex = `@article{paper2022,
  title = {Some Paper},
  author = {Wei, Jason and Smith, John},
  year = {2022}
}`;

    const entries = parseBibliography(bibtex);

    expect(entries[0]!.authors).toEqual(['Wei, Jason', 'Smith, John']);
  });

  it('extracts the DOI field when present', () => {
    const bibtex = `@article{paper2022,
  title = {X},
  author = {A},
  doi = {10.1000/foo}
}`;

    const entries = parseBibliography(bibtex);

    expect(entries[0]!.doi).toBe('10.1000/foo');
  });

  it('extracts the eprint field as arxivId', () => {
    const bibtex = `@article{preprint2022,
  title = {Preprint},
  author = {A},
  eprint = {2206.07682}
}`;

    const entries = parseBibliography(bibtex);

    expect(entries[0]!.arxivId).toBe('2206.07682');
  });
});
