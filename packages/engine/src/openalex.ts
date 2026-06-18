import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { OpenAlexClient, OpenAlexRecord } from './resolver';

export interface ResponseCache {
  get(key: string): OpenAlexRecord | null | undefined;
  set(key: string, value: OpenAlexRecord | null): void;
}

export function createMemoryCache(): ResponseCache {
  const store = new Map<string, OpenAlexRecord | null>();
  return {
    get(key) {
      return store.has(key) ? store.get(key)! : undefined;
    },
    set(key, value) {
      store.set(key, value);
    },
  };
}

export function createFileCache(filePath: string): ResponseCache {
  const store = new Map<string, OpenAlexRecord | null>();

  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<
        string,
        OpenAlexRecord | null
      >;
      for (const [k, v] of Object.entries(data)) store.set(k, v);
    } catch {
      // Corrupt cache file — start fresh
    }
  }

  return {
    get(key) {
      return store.has(key) ? store.get(key)! : undefined;
    },
    set(key, value) {
      store.set(key, value);
      const dir = path.dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(Object.fromEntries(store), null, 2));
    },
  };
}

export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface OpenAlexClientOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  cache?: ResponseCache;
  retry?: RetryConfig;
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
  const cache = opts.cache;
  const maxAttempts = opts.retry?.maxAttempts ?? 3;
  const baseDelayMs = opts.retry?.baseDelayMs ?? 200;
  const headers = { 'User-Agent': userAgent };

  async function fetchWithRetry(url: string): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetchImpl(url, { headers });
        if (res.status >= 500) {
          throw new Error(`OpenAlex returned ${res.status}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (i < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
        }
      }
    }
    throw lastErr;
  }

  async function memoize(
    key: string,
    doFetch: () => Promise<OpenAlexRecord | null>,
  ): Promise<OpenAlexRecord | null> {
    if (cache) {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
    }
    const result = await doFetch();
    if (cache) cache.set(key, result);
    return result;
  }

  return {
    async lookupByDoi(doi) {
      return memoize(`doi:${doi}`, async () => {
        const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
        const res = await fetchWithRetry(url);
        if (!res.ok) return null;
        const work = (await res.json()) as OpenAlexWork;
        return workToRecord(work);
      });
    },
    async lookupByArxiv(arxivId) {
      return memoize(`arxiv:${arxivId}`, async () => {
        const url = `https://api.openalex.org/works?filter=ids.arxiv:${encodeURIComponent(arxivId)}`;
        const res = await fetchWithRetry(url);
        if (!res.ok) return null;
        const result = (await res.json()) as OpenAlexSearchResult;
        const first = result.results?.[0];
        if (!first) return null;
        return workToRecord(first);
      });
    },
  };
}
