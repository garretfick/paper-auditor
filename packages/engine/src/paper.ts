import { readFile } from 'node:fs/promises';
import { sentences as splitSentences } from 'sbd';
import { parseBibliography } from './bibtex';
import type { BibEntry } from './resolver';

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface TextSpan {
  start: Position;
  end: Position;
}

export interface Sentence {
  text: string;
  span: TextSpan;
}

export type CitationSyntax = 'pandoc' | 'author-year';

export interface Citation {
  citationKey: string;
  span: TextSpan;
  /** How the Citation was written in the Paper. */
  syntax: CitationSyntax;
  /** Author-year only: first author's surname, used for surname+year resolution. */
  surname?: string;
  /** Author-year only: the cited year. */
  year?: string;
  /** The verbatim matched text (e.g. "@smith2020" or "(Smith, 2020)"). */
  rawText?: string;
}

export interface Paper {
  source: string;
  sentences: Sentence[];
  citations: Citation[];
  bibliography: BibEntry[];
}

export async function loadPaper(
  paperPath: string,
  bibPath: string,
): Promise<Paper> {
  const [source, bibText] = await Promise.all([
    readFile(paperPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Paper at ${paperPath}: ${detail}`);
    }),
    readFile(bibPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Bibliography at ${bibPath}: ${detail}`);
    }),
  ]);

  const bibliography = parseBibliography(bibText);
  if (bibText.trim().length > 0 && bibliography.length === 0) {
    throw new Error(
      `Malformed BibTeX in ${bibPath}: file has content but no entries were found`,
    );
  }

  return {
    source,
    sentences: extractSentences(source),
    citations: extractCitations(source),
    bibliography,
  };
}

// Author-year recognition is deliberately high-recall: the regexes over-match
// (e.g. "(Table 2020)"), and the optional LLM Citation Filter is what discards
// the false positives. Survivors resolve against the Bibliography by surname+year
// — never by feeding the Bibliography to the LLM. See ADR-0007.
const NAME = "[A-Z][A-Za-z.'’-]+";
const CONNECTIVE = `(?:\\s+et\\s+al\\.?|\\s+(?:and|&)\\s+${NAME})?`;
const YEAR = '(?:18|19|20)\\d{2}[a-z]?';
// (Smith, 2020) / (Smith et al. 2020) / (Smith and Jones, 2020)
const AUTHOR_YEAR_PARENTHETICAL = new RegExp(
  `\\(\\s*(${NAME}${CONNECTIVE})\\s*,?\\s*(${YEAR})\\s*\\)`,
  'g',
);
// Smith (2020) / Smith et al. (2019) / Smith and Jones (2020)
const AUTHOR_YEAR_NARRATIVE = new RegExp(
  `(${NAME}${CONNECTIVE})\\s+\\((${YEAR})\\)`,
  'g',
);

function authorYearCitation(
  source: string,
  match: RegExpMatchArray,
  phrase: string,
  year: string,
): Citation {
  const start = match.index ?? 0;
  const endOffset = start + match[0].length;
  const surname = (phrase.split(/\s+/)[0] ?? '').replace(/[.,]+$/, '');
  return {
    citationKey: '',
    syntax: 'author-year',
    surname,
    year,
    rawText: match[0],
    span: {
      start: positionAt(source, start),
      end: positionAt(source, endOffset),
    },
  };
}

function extractCitations(source: string): Citation[] {
  const citations: Citation[] = [];

  // Pandoc [@key] — the authoritative citation syntax.
  for (const bracket of source.matchAll(/\[([^\]]+)\]/g)) {
    const inside = bracket[1];
    if (!inside) continue;
    const insideStart = bracket.index + 1;
    for (const keyMatch of inside.matchAll(/@(\w+)/g)) {
      const key = keyMatch[1];
      if (!key) continue;
      const atOffset = insideStart + keyMatch.index;
      const endOffset = atOffset + keyMatch[0].length;
      citations.push({
        citationKey: key,
        syntax: 'pandoc',
        rawText: source.slice(atOffset, endOffset),
        span: {
          start: positionAt(source, atOffset),
          end: positionAt(source, endOffset),
        },
      });
    }
  }

  // Author-year candidates — high recall, filtered/resolved downstream.
  for (const m of source.matchAll(AUTHOR_YEAR_PARENTHETICAL)) {
    const phrase = m[1];
    const year = m[2];
    if (!phrase || !year) continue;
    citations.push(authorYearCitation(source, m, phrase, year));
  }
  for (const m of source.matchAll(AUTHOR_YEAR_NARRATIVE)) {
    const phrase = m[1];
    const year = m[2];
    if (!phrase || !year) continue;
    citations.push(authorYearCitation(source, m, phrase, year));
  }

  return citations.sort((a, b) => a.span.start.offset - b.span.start.offset);
}

function extractSentences(source: string): Sentence[] {
  const texts = splitSentences(source);
  const result: Sentence[] = [];
  let cursor = 0;
  for (const text of texts) {
    const offset = source.indexOf(text, cursor);
    if (offset === -1) continue;
    const endOffset = offset + text.length;
    cursor = endOffset;
    result.push({
      text,
      span: {
        start: positionAt(source, offset),
        end: positionAt(source, endOffset),
      },
    });
  }
  return result;
}

export function positionAt(source: string, offset: number): Position {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column, offset };
}
