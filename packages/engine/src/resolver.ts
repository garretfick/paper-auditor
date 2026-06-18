export interface BibEntry {
  citationKey: string;
  title: string;
  authors: string[];
  doi?: string;
  arxivId?: string;
}

export interface OpenAlexRecord {
  title: string;
  authors: string[];
}

export interface OpenAlexClient {
  lookupByDoi(doi: string): Promise<OpenAlexRecord | null>;
  lookupByArxiv(arxivId: string): Promise<OpenAlexRecord | null>;
  searchByTitleAuthor(
    title: string,
    author: string,
  ): Promise<OpenAlexRecord | null>;
}

export type Resolution =
  | { kind: 'resolved' }
  | { kind: 'fabricated-source'; detail: string }
  | { kind: 'unverifiable-source'; detail: string };

function authorsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

function detectMismatch(
  entry: BibEntry,
  record: OpenAlexRecord,
): Resolution | null {
  if (record.title !== entry.title) {
    return {
      kind: 'fabricated-source',
      detail: `Title mismatch for ${entry.citationKey}: bibliography says "${entry.title}", OpenAlex returns "${record.title}"`,
    };
  }
  if (!authorsMatch(record.authors, entry.authors)) {
    return {
      kind: 'fabricated-source',
      detail: `Author mismatch for ${entry.citationKey}: bibliography says ${JSON.stringify(entry.authors)}, OpenAlex returns ${JSON.stringify(record.authors)}`,
    };
  }
  return null;
}

export async function resolveBibEntry(
  entry: BibEntry,
  client: OpenAlexClient,
): Promise<Resolution> {
  let record: OpenAlexRecord | null = null;
  let usedTitleAuthorSearch = false;
  if (entry.doi) {
    record = await client.lookupByDoi(entry.doi);
  } else if (entry.arxivId) {
    record = await client.lookupByArxiv(entry.arxivId);
  } else {
    usedTitleAuthorSearch = true;
    record = await client.searchByTitleAuthor(
      entry.title,
      entry.authors[0] ?? '',
    );
  }

  if (record) {
    const mismatch = detectMismatch(entry, record);
    if (mismatch) return mismatch;
    return { kind: 'resolved' };
  }
  if (usedTitleAuthorSearch) {
    return {
      kind: 'unverifiable-source',
      detail: `OpenAlex title+author search for ${entry.citationKey} returned no candidate (no DOI or arXivID to verify against)`,
    };
  }
  return { kind: 'resolved' };
}
