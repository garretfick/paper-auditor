import { audit, renderReport } from '@paper-auditor/engine';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const [paperPath, bibPath] = process.argv.slice(2);

if (!paperPath || !bibPath) {
  console.error('Usage: paper-auditor <paper.md> <paper.bib>');
  process.exit(2);
}

try {
  const result = await audit(paperPath, bibPath);
  const report = renderReport(result.findings);
  await writeFile(path.join(process.cwd(), 'audit-report.md'), report, 'utf8');
  process.exit(result.findings.length > 0 ? 1 : 0);
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
