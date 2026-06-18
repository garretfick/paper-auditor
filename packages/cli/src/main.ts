import {
  audit,
  createFileCache,
  createOpenAlexClient,
  renderReport,
  type OpenAlexClient,
  type ResponseCache,
} from '@paper-auditor/engine';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface RunCliOptions {
  cwd?: string;
  openAlexClient?: OpenAlexClient;
  cachePath?: string;
}

export async function runCli(
  args: string[],
  opts: RunCliOptions = {},
): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const positional = args.filter((a) => !a.startsWith('--'));
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const noCache = flags.has('--no-cache');
  const [paperPath, bibPath] = positional;

  if (!paperPath || !bibPath) {
    console.error('Usage: paper-auditor <paper.md> <paper.bib> [--no-cache]');
    return 2;
  }

  try {
    const openAlexClient = opts.openAlexClient ?? buildDefaultClient({
      cachePath: opts.cachePath,
      noCache,
    });
    const result = await audit(paperPath, bibPath, { openAlexClient });
    const report = renderReport(result.findings);
    await writeFile(path.join(cwd, 'audit-report.md'), report, 'utf8');
    return result.findings.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

function buildDefaultClient(opts: {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
