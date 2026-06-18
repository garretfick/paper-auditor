import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createOpenAlexClient,
  createMemoryCache,
  createFileCache,
} from '../src';

describe('createOpenAlexClient', () => {
  it('lookupByDoi queries OpenAlex by DOI and maps the work to an OpenAlexRecord', async () => {
    let requestedUrl: string | URL = '';
    const fakeFetch: typeof fetch = async (url) => {
      requestedUrl = url as string | URL;
      return new Response(
        JSON.stringify({
          title: 'Returned Title',
          authorships: [{ author: { display_name: 'Returned Author' } }],
        }),
        { status: 200 },
      );
    };

    const client = createOpenAlexClient({ fetch: fakeFetch });
    const record = await client.lookupByDoi('10.1234/test');

    expect(String(requestedUrl)).toContain('doi:');
    expect(String(requestedUrl)).toContain('10.1234');
    expect(record).toEqual({
      title: 'Returned Title',
      authors: ['Returned Author'],
    });
  });

  it('lookupByArxiv queries OpenAlex by arXiv ID and maps the first result', async () => {
    let requestedUrl: string | URL = '';
    const fakeFetch: typeof fetch = async (url) => {
      requestedUrl = url as string | URL;
      return new Response(
        JSON.stringify({
          results: [
            {
              title: 'arXiv Returned Title',
              authorships: [{ author: { display_name: 'arXiv Author' } }],
            },
          ],
        }),
        { status: 200 },
      );
    };

    const client = createOpenAlexClient({ fetch: fakeFetch });
    const record = await client.lookupByArxiv('2206.07682');

    expect(String(requestedUrl)).toContain('arxiv');
    expect(String(requestedUrl)).toContain('2206.07682');
    expect(record).toEqual({
      title: 'arXiv Returned Title',
      authors: ['arXiv Author'],
    });
  });

  it('caches lookupByDoi responses so the second call does not hit fetch', async () => {
    let fetchCount = 0;
    const fakeFetch: typeof fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          title: 'Cached Title',
          authorships: [{ author: { display_name: 'Cached Author' } }],
        }),
        { status: 200 },
      );
    };

    const cache = createMemoryCache();
    const client = createOpenAlexClient({ fetch: fakeFetch, cache });

    const first = await client.lookupByDoi('10.1234/test');
    const second = await client.lookupByDoi('10.1234/test');

    expect(fetchCount).toBe(1);
    expect(second).toEqual(first);
  });

  it('createFileCache persists records across instances', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pa-cache-'));
    const cachePath = path.join(workDir, 'cache.json');

    const cache1 = createFileCache(cachePath);
    cache1.set('doi:10.1234/test', {
      title: 'Persisted Title',
      authors: ['Persisted Author'],
    });

    const cache2 = createFileCache(cachePath);

    expect(cache2.get('doi:10.1234/test')).toEqual({
      title: 'Persisted Title',
      authors: ['Persisted Author'],
    });
  });

  it('retries lookupByDoi on 5xx responses and returns the eventual success', async () => {
    let attempts = 0;
    const fakeFetch: typeof fetch = async () => {
      attempts++;
      if (attempts < 3) {
        return new Response('Server Error', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          title: 'Eventual Success',
          authorships: [{ author: { display_name: 'Author' } }],
        }),
        { status: 200 },
      );
    };

    const client = createOpenAlexClient({
      fetch: fakeFetch,
      retry: { maxAttempts: 5, baseDelayMs: 1 },
    });

    const record = await client.lookupByDoi('10.1234/test');

    expect(attempts).toBe(3);
    expect(record?.title).toBe('Eventual Success');
  });

  // Live smoke test — hits real OpenAlex. Skipped unless RUN_LIVE_SMOKE=1 is
  // set in the environment, so CI and offline runs stay clean.
  it.skipIf(process.env.RUN_LIVE_SMOKE !== '1')(
    'live smoke: lookupByDoi returns a real record for a known DOI',
    async () => {
      const client = createOpenAlexClient();
      const record = await client.lookupByDoi('10.48550/arXiv.2206.07682');
      expect(record).not.toBeNull();
      expect(record!.title.toLowerCase()).toContain('emergent');
    },
    30_000,
  );

  it('sends a User-Agent header identifying paper-auditor', async () => {
    let receivedUA: string | undefined;
    const fakeFetch: typeof fetch = async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      receivedUA = headers['User-Agent'];
      return new Response('{}', { status: 200 });
    };

    const client = createOpenAlexClient({ fetch: fakeFetch });
    await client.lookupByDoi('10.1234/test');

    expect(receivedUA).toContain('paper-auditor');
  });
});
