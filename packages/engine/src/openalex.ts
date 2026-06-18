import type { OpenAlexClient, OpenAlexRecord } from './resolver';

export interface OpenAlexClientOptions {
  fetch?: typeof fetch;
  userAgent?: string;
}

interface OpenAlexWork {
  title?: string;
  display_name?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
}

interface OpenAlexSearchResult {
  results?: OpenAlexWork[];
}

function workToRecord(work: OpenAlexWork): OpenAlexRecord {
  return {
    title: work.title ?? work.display_name ?? '',
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name ?? '')
      .filter((n) => n !== ''),
  };
}

export function createOpenAlexClient(
  opts: OpenAlexClientOptions = {},
): OpenAlexClient {
  const fetchImpl = opts.fetch ?? fetch;
  const userAgent =
    opts.userAgent ??
    'paper-auditor/0.0.0 (https://github.com/garretfick/paper-auditor)';
  const headers = { 'User-Agent': userAgent };

  return {
    async lookupByDoi(doi) {
      const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
      const res = await fetchImpl(url, { headers });
      if (!res.ok) return null;
      const work = (await res.json()) as OpenAlexWork;
      return workToRecord(work);
    },
    async lookupByArxiv(arxivId) {
      const url = `https://api.openalex.org/works?filter=ids.arxiv:${encodeURIComponent(arxivId)}`;
      const res = await fetchImpl(url, { headers });
      if (!res.ok) return null;
      const result = (await res.json()) as OpenAlexSearchResult;
      const first = result.results?.[0];
      if (!first) return null;
      return workToRecord(first);
    },
  };
}
