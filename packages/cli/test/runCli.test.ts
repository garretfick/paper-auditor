import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { runCli } from '../src/main';
import { stubClaimExtractor, type OpenAlexClient } from '@paper-auditor/engine';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const engineFixturesDir = path.resolve(here, '../../engine/test/fixtures');

describe('runCli', () => {
  it('emits FabricatedSource Findings via the wired OpenAlex client', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pa-runcli-'));
    const fakeClient: OpenAlexClient = {
      async lookupByDoi() {
        return {
          title: 'A Completely Different Title',
          authors: ['Wei, Jason'],
        };
      },
      async lookupByArxiv() {
        return null;
      },
      async searchByTitleAuthor() {
        throw new Error(
          'searchByTitleAuthor should not be called for DOI-bearing entries',
        );
      },
    };

    const exitCode = await runCli(
      [
        path.join(engineFixturesDir, 'with-doi.md'),
        path.join(engineFixturesDir, 'with-doi.bib'),
      ],
      {
        cwd: workDir,
        openAlexClient: fakeClient,
        claimExtractor: stubClaimExtractor,
      },
    );

    expect(exitCode).toBe(1);
    const report = await readFile(
      path.join(workDir, 'audit-report.md'),
      'utf8',
    );
    expect(report).toContain('FabricatedSource');
  });

  it('rejects unknown flags with exit code 2 instead of silently ignoring them', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pa-runcli-'));

    const exitCode = await runCli(
      [
        path.join(engineFixturesDir, 'unresolved-citation.md'),
        path.join(engineFixturesDir, 'unresolved-citation.bib'),
        '--no-cahce',
      ],
      { cwd: workDir },
    );

    expect(exitCode).toBe(2);
  });

  it('with --no-cache, does not write a cache file', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'pa-runcli-'));
    const cachePath = path.join(workDir, 'openalex.json');

    // Stub fetch so the default OpenAlex client never touches the network:
    // an empty result set means the (DOI-less) bib entry is unverifiable.
    const stubFetch = (async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
      })) as typeof fetch;

    const exitCode = await runCli(
      [
        path.join(engineFixturesDir, 'unresolved-citation.md'),
        path.join(engineFixturesDir, 'unresolved-citation.bib'),
        '--no-cache',
      ],
      {
        cwd: workDir,
        cachePath,
        claimExtractor: stubClaimExtractor,
        fetch: stubFetch,
      },
    );

    expect(exitCode).toBe(1);
    await expect(access(cachePath)).rejects.toThrow();
  });
});
