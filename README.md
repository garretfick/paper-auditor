# Paper Auditor

A tool that audits a draft of an academic research paper and surfaces issues for the author to address before submission.

> **⚠️ Nascent project.** Paper Auditor is in early development. The domain model is settled (see [`CONTEXT.md`](./CONTEXT.md)), but only a slice of the planned audit is implemented today. Expect missing features, rough edges, and breaking changes. There is no published package yet — you run it from source.

## What it does

You give Paper Auditor a Paper (a Markdown draft) and its companion Bibliography (a Pandoc-style `.bib` file). It checks that the works the Paper cites actually exist and match what the Bibliography claims about them, then writes a Markdown report of any problems it finds.

Each problem is a **Finding**. Today the auditor emits three Finding types, all produced by **Source Resolution** — the check that a Citation points to a real Source:

- **`UnresolvedCitation`** — a Citation Key used in the Paper (e.g. `[@smith2020]`) has no matching entry in the Bibliography.
- **`FabricatedSource`** — a Bibliography entry's metadata does not match any record found in [OpenAlex](https://openalex.org), the open catalog of scholarly works. This is the headline failure mode: a citation to a paper that does not exist.
- **`UnverifiableSource`** — a Bibliography entry could not be confirmed in OpenAlex and carries no DOI or arXiv id to verify it against.

The vocabulary above (Paper, Bibliography, Citation, Source, Finding, …) is precise and load-bearing. If a term is capitalized in the docs, it has a specific meaning defined in [`CONTEXT.md`](./CONTEXT.md).

## What it does *not* do yet

The long-term design centers on a **Claim Extractor** — an LLM pass that breaks the Paper into individual Claims, types each one, and flags `Background` Claims that lack a supporting Citation (`UncitedClaim`). That layer is **not implemented yet**: the current auditor works only at the Citation/Bibliography level, not the Claim level, so it cannot yet tell you that a sentence asserting prior work was left uncited. Finding locations are also still coarse (line/column are not yet resolved to real positions in the Paper).

The eventual goal is an interactive experience for navigating the Paper's claim–citation graph. v1 is the one-shot Markdown report you see here.

See the [Architecture Decision Records](./docs/adr/) for the reasoning behind the major choices (OpenAlex as the resolver, LLM-based claim extraction, TypeScript, a local LLM via Ollama).

## Requirements

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 9 (the repo pins `pnpm@9.15.0`)
- Network access to OpenAlex for Source Resolution (results are cached locally)

## Install

```sh
git clone https://github.com/garretfick/paper-auditor.git
cd paper-auditor
pnpm install --frozen-lockfile
```

## Usage

Run the CLI against your Paper and its Bibliography:

```sh
pnpm --filter @paper-auditor/cli exec tsx src/main.ts path/to/paper.md path/to/paper.bib
```

```
Usage: paper-auditor <paper.md> <paper.bib> [--no-cache]
```

The audit writes its report to `audit-report.md` in the current directory.

**Options**

- `--no-cache` — skip the on-disk OpenAlex response cache for this run.

**Caching.** OpenAlex responses are cached at `~/.cache/paper-auditor/openalex.json` so repeated runs are fast and avoid re-querying the API.

**Exit codes**

- `0` — audit completed, no Findings.
- `1` — audit completed, one or more Findings (see `audit-report.md`).
- `2` — could not run (bad arguments, unreadable Paper or Bibliography, malformed BibTeX).

## Development

The repo is a pnpm workspace with two packages:

- **`packages/engine`** — the audit engine: BibTeX parsing, OpenAlex client, Source Resolution, and report rendering.
- **`packages/cli`** — the command-line front end.

Common tasks are wired through [`just`](https://github.com/casey/just):

```sh
just          # list available recipes
just setup    # pnpm install --frozen-lockfile
just build    # typecheck, run tests, lint, and check formatting
```

Or run the pieces directly:

```sh
pnpm -r test                  # run all package tests (vitest)
pnpm exec tsc -b              # typecheck
pnpm exec eslint packages     # lint
pnpm exec prettier --check .  # formatting
```

## Project documents

- [`CONTEXT.md`](./CONTEXT.md) — the domain model and canonical vocabulary.
- [`docs/adr/`](./docs/adr/) — Architecture Decision Records.
- [`AGENTS.md`](./AGENTS.md) — conventions for agents working in this repo.
