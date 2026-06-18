import { describe, it, expect } from 'vitest';
import { createOpenAlexClient } from '../src';

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
