import {
  audit,
  createFileCache,
  createOllamaCitationFilter,
  createOllamaClaimExtractor,
  createOpenAlexClient,
  renderReport,
  type CitationFilter,
  type ClaimExtractor,
  type OpenAlexClient,
  type ResponseCache,
} from '@paper-auditor/engine';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

export interface RunCliOptions {
  cwd?: string;
  openAlexClient?: OpenAlexClient;
  claimExtractor?: ClaimExtractor;
  citationFilter?: CitationFilter;
  cachePath?: string;
}

const USAGE =
  'Usage: paper-auditor <paper.md> <paper.bib> [--no-cache] [--model <name>] [--ollama-url <url>]';

export async function runCli(
  args: string[],
  opts: RunCliOptions = {},
): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();

  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        'no-cache': { type: 'boolean'; default: false };
        model: { type: 'string' };
        'ollama-url': { type: 'string' };
      };
      allowPositionals: true;
      strict: true;
    }>
  >;
  try {
    parsed = parseArgs({
      args,
      options: {
        'no-cache': { type: 'boolean', default: false },
        model: { type: 'string' },
        'ollama-url': { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(USAGE);
    return 2;
  }

  const noCache = parsed.values['no-cache'];
  const modelName = parsed.values.model;
  const baseURL = parsed.values['ollama-url'];
  const [paperPath, bibPath] = parsed.positionals;

  if (!paperPath || !bibPath) {
    console.error(USAGE);
    return 2;
  }

  try {
    const openAlexClient =
      opts.openAlexClient ??
      buildDefaultOpenAlexClient({
        cachePath: opts.cachePath,
        noCache,
      });
    const claimExtractor =
      opts.claimExtractor ??
      createOllamaClaimExtractor({
        ...(modelName ? { modelName } : {}),
        ...(baseURL ? { baseURL } : {}),
      });
    const citationFilter =
      opts.citationFilter ??
      createOllamaCitationFilter({
        ...(modelName ? { modelName } : {}),
        ...(baseURL ? { baseURL } : {}),
      });
    const result = await audit(paperPath, bibPath, {
      openAlexClient,
      claimExtractor,
      citationFilter,
    });
    const report = renderReport(result.findings);
    await writeFile(path.join(cwd, 'audit-report.md'), report, 'utf8');
    return result.findings.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

function buildDefaultOpenAlexClient(opts: {
  cachePath?: string;
  noCache: boolean;
}): OpenAlexClient {
  let cache: ResponseCache | undefined;
  if (!opts.noCache) {
    const cachePath =
      opts.cachePath ??
      path.join(homedir(), '.cache', 'paper-auditor', 'openalex.json');
    cache = createFileCache(cachePath);
  }
  return createOpenAlexClient({ ...(cache ? { cache } : {}) });
}

if (import.meta.url === `file://${String(process.argv[1])}`) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
