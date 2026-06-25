import { describe, it, expect } from 'vitest';
import path from 'node:path';
import url from 'node:url';
import { loadPaper } from '../src';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures');

describe('loadPaper', () => {
  it('extracts sentences from a Markdown paper', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
    );

    expect(paper.sentences).toHaveLength(2);
    expect(paper.sentences[0]!.text).toContain('first');
    expect(paper.sentences[1]!.text).toContain('second');
  });

  it('attaches accurate TextSpans that round-trip back to the source', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
    );

    for (const sentence of paper.sentences) {
      const sliced = paper.source.slice(
        sentence.span.start.offset,
        sentence.span.end.offset,
      );
      expect(sliced).toBe(sentence.text);
    }

    expect(paper.sentences[0]!.span.start.line).toBe(1);
    expect(paper.sentences[0]!.span.start.column).toBe(1);
  });

  it('extracts Citations with TextSpans pointing back into the source', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'unresolved-citation.md'),
      path.join(fixturesDir, 'unresolved-citation.bib'),
    );

    expect(paper.citations).toHaveLength(1);
    const citation = paper.citations[0]!;
    expect(citation.citationKey).toBe('nonexistent');
    const sliced = paper.source.slice(
      citation.span.start.offset,
      citation.span.end.offset,
    );
    expect(sliced).toBe('@nonexistent');
    expect(citation.syntax).toBe('pandoc');
  });

  it('extracts author-year Citations (parenthetical and narrative) as candidates', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'author-year.md'),
      path.join(fixturesDir, 'author-year.bib'),
    );

    const authorYear = paper.citations.filter(
      (c) => c.syntax === 'author-year',
    );
    expect(authorYear).toHaveLength(3);

    const bySurname = new Map(authorYear.map((c) => [c.surname, c]));
    expect(bySurname.get('Wei')?.year).toBe('2022');
    expect(bySurname.get('Smith')?.year).toBe('2019');
    expect(bySurname.get('Nguyen')?.year).toBe('1999');

    // Spans round-trip back to the verbatim source text.
    for (const c of authorYear) {
      const sliced = paper.source.slice(c.span.start.offset, c.span.end.offset);
      expect(sliced).toBe(c.rawText);
    }
    expect(bySurname.get('Wei')?.rawText).toBe('(Wei, 2022)');
    expect(bySurname.get('Smith')?.rawText).toBe('Smith et al. (2019)');
  });

  it('does not treat a bare parenthetical year as a Citation', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
    );

    expect(paper.citations).toHaveLength(0);
  });
});
