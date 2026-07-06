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
  });

  it('matches an author-year Citation like [IEC 2013] to the Bibliography entry whose first author and year align', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'author-year-single.md'),
      path.join(fixturesDir, 'author-year-single.bib'),
    );

    expect(paper.citations).toHaveLength(1);
    expect(paper.citations[0]!.citationKey).toBe('iec61131');
  });

  it('matches an "et al." author-year Citation on the first-author lastName + year', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'author-year-etal.md'),
      path.join(fixturesDir, 'author-year-etal.bib'),
    );

    expect(paper.citations).toHaveLength(1);
    expect(paper.citations[0]!.citationKey).toBe('tisserant2007');
  });

  it('matches a multi-word author-year Citation like [Microsoft Security 2023]', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'author-year-multiword.md'),
      path.join(fixturesDir, 'author-year-multiword.bib'),
    );

    expect(paper.citations).toHaveLength(1);
    expect(paper.citations[0]!.citationKey).toBe('mssecurity2023');
  });

  it('emits one Citation per semicolon-separated author-year inside one bracket', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'author-year-semicolon.md'),
      path.join(fixturesDir, 'author-year-semicolon.bib'),
    );

    expect(paper.citations).toHaveLength(2);
    expect(paper.citations.map((c) => c.citationKey)).toEqual([
      'falliere2011',
      'langner2013',
    ]);
  });

  it('extracts both Pandoc [@key] and author-year [Author Year] Citations from the same Paper', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'mixed-citation-styles.md'),
      path.join(fixturesDir, 'mixed-citation-styles.bib'),
    );

    expect(paper.citations.map((c) => c.citationKey).sort()).toEqual([
      'iec61131',
      'wei2022',
    ]);
  });

  it('does not emit Citations from bracketed text that lacks a Pandoc key or a 4-digit year (e.g. [See Section 3], [1, 2], [TODO])', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'bracket-false-positives.md'),
      path.join(fixturesDir, 'bracket-false-positives.bib'),
    );

    expect(paper.citations).toHaveLength(0);
  });
});
