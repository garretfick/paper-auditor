declare module '@retorquere/bibtex-parser' {
  export interface ParsedAuthor {
    lastName?: string;
    firstName?: string;
  }

  export interface ParsedEntry {
    type: string;
    key: string;
    fields: Record<string, string | ParsedAuthor[] | undefined>;
  }

  export interface ParseResult {
    entries: ParsedEntry[];
    errors: unknown[];
  }

  export function parse(bibtex: string): ParseResult;
}
