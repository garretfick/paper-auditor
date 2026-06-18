import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';

const execFileAsync = promisify(execFile);
const here = path.dirname(url.fileURLToPath(import.meta.url));
const engineFixturesDir = path.resolve(here, '../../engine/test/fixtures');
const cliEntry = path.resolve(here, '../src/main.ts');
const tsxBin = path.resolve(here, '../node_modules/.bin/tsx');

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      tsxBin,
      [cliEntry, ...args],
      {
        cwd,
      },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.code ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

describe('paper-auditor CLI', () => {
  it('writes the audit report and exits 1 when Findings exist', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'paper-auditor-cli-'));

    const result = await runCli(
      [
        path.join(engineFixturesDir, 'unresolved-citation.md'),
        path.join(engineFixturesDir, 'unresolved-citation.bib'),
      ],
      workDir,
    );

    expect(result.exitCode).toBe(1);
    const report = await readFile(
      path.join(workDir, 'audit-report.md'),
      'utf8',
    );
    expect(report).toContain('[@nonexistent]');
  });
});
