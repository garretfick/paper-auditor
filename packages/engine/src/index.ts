import { readFile } from 'node:fs/promises';

export * from './resolver';

export type FindingType = 'UnresolvedCitation';

export interface Finding {
  type: FindingType;
  location: { line: number; column: number };
  subject: string;
  detail: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AuditResult {
  findings: Finding[];
}

export function renderReport(findings: Finding[]): string {
  if (findings.length === 0) return '# Audit report\n\nNo Findings.\n';
  const lines = findings.map(
    (f) =>
      `- \`${f.subject}\` (line ${f.location.line}, column ${f.location.column}) — ${f.detail} [confidence: ${f.confidence}]`,
  );
  return lines.join('\n');
}

export async function audit(
  paperPath: string,
  bibPath: string,
): Promise<AuditResult> {
  const [paperText, bibText] = await Promise.all([
    readFile(paperPath, 'utf8').catch((err: Error) => {
      throw new Error(`Cannot read Paper at ${paperPath}: ${err.message}`);
    }),
    readFile(bibPath, 'utf8').catch((err: Error) => {
      throw new Error(`Cannot read Bibliography at ${bibPath}: ${err.message}`);
    }),
  ]);

  const citationKeys: string[] = [];
  for (const bracket of paperText.matchAll(/\[([^\]]+)\]/g)) {
    const inside = bracket[1];
    if (!inside) continue;
    for (const keyMatch of inside.matchAll(/@(\w+)/g)) {
      const key = keyMatch[1];
      if (key) citationKeys.push(key);
    }
  }

  const bibKeys = new Set<string>();
  for (const match of bibText.matchAll(/@\w+\{([^,]+),/g)) {
    const key = match[1];
    if (key) bibKeys.add(key.trim());
  }
  if (bibText.trim().length > 0 && bibKeys.size === 0) {
    throw new Error(
      `Malformed BibTeX in ${bibPath}: file has content but no entries were found`,
    );
  }

  const findings: Finding[] = [];
  for (const key of citationKeys) {
    if (!bibKeys.has(key)) {
      findings.push({
        type: 'UnresolvedCitation',
        location: { line: 0, column: 0 },
        subject: `[@${key}]`,
        detail: `Citation Key "${key}" not found in Bibliography`,
        confidence: 'high',
      });
    }
  }

  return { findings };
}
