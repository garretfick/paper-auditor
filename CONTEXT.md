# Paper Auditor

A tool that audits a draft of an academic research paper and surfaces issues for the author to address before submission.

The long-term shape is an **interactive exploration experience** where the author navigates the Paper's claim–citation graph. v1 is a one-shot audit that emits a Markdown report; the engine produces a navigable structured model of **Claims**, **Citations**, **Sources**, and **Findings** that a future viewer can consume.

## Language

**Paper**:
An in-progress draft of an academic research paper that the tool reads as input. v1 expects a single Markdown file paired with a single companion BibTeX file (Pandoc-style); multi-file Papers (book-style, chapter-per-file) are out of scope.
_Avoid_: Document, manuscript, article, draft (use "Paper" as the canonical term).

**Bibliography**:
The companion `.bib` file accompanying a **Paper**. Contains one entry per **Source** the **Paper** intends to cite, keyed by **Citation Key**.
_Avoid_: References, refs, bib file (use "Bibliography" in prose).

**Citation Key**:
The identifier used inside a **Citation** to point into the **Bibliography** (e.g. `smith2020` in `[@smith2020]`).
_Avoid_: Bibkey, ref key, key.

**Author**:
The person writing the **Paper** and running the audit on their own work.
_Avoid_: User, writer, researcher.

**Claim**:
An assertion made in the **Paper** that requires support from a **Source**.
_Avoid_: Assertion, statement, proposition.

**Citation**:
The in-text marker in the **Paper** that attaches a **Source** to a **Claim** (e.g. `[@smith2020]`). Contains a **Citation Key**.
_Avoid_: Cite, ref.

**Source**:
The cited work itself — the paper, book, or dataset that a **Citation** points to. The **Bibliography** describes it; **Source Resolution** verifies it exists in the world.
_Avoid_: Reference, bibliography entry, work.

**Claim Type**:
The category of a **Claim**, assigned by the classifier. One of:
`Background` (about prior work or established facts — must have a **Citation**; **the only audited type in v1**),
`Method` (describes the author's own approach — no Citation required),
`Result` (the Paper's own findings — no Citation required),
`Discussion` (interpretation — not audited in v1; future work will split it into referential vs. interpretive sub-types),
`Navigation` (structural sentences like "Section 3 presents…" — no Citation required).

**Finding**:
A single issue surfaced by the audit. Has a `Type` (e.g. `UncitedClaim`, `UnresolvedCitation`, `FabricatedSource`, `UnverifiableSource`), a `Location` in the **Paper**, a `Subject` (the offending Claim or Citation text), a `Detail` (human-readable explanation), and a `Confidence` level.
_Avoid_: Issue, problem, error, warning.

**Source Resolution**:
The two-phase check that verifies a **Citation** points to a real **Source**.
Phase 1 (local): does the **Citation Key** appear in the **Bibliography**? — if not, emit `UnresolvedCitation`.
Phase 2 (world): does OpenAlex return a record matching the **Bibliography** entry's metadata? — mismatch emits `FabricatedSource`; no match at all with no DOI/arxiv emits `UnverifiableSource`.
_Avoid_: Lookup, verification, validation.

## Relationships

- An **Author** submits a **Paper** (plus its **Bibliography**) to the auditor.
- A **Paper** contains many **Claims**.
- Each **Claim** has a **Claim Type** assigned by the classifier.
- A **Claim** may have zero or more **Citations** attached.
- A **Citation** contains a **Citation Key** that points into the **Bibliography**.
- A **Bibliography** entry describes a **Source**.
- The audit produces zero or more **Findings** about the **Paper**.

## Example dialogue

> **Dev:** The **Author** writes "Transformer models exhibit emergent capabilities `[@wei2022]`." What does the audit do with that?
> **Domain expert:** Classifier tags it `Background` — it's making a claim about prior work, not about the **Paper**'s own contribution. The **Citation** is present, so no `UncitedClaim`. Then **Source Resolution**: Phase 1 checks `wei2022` is in the **Bibliography** — say it is. Phase 2 hits OpenAlex with that entry's DOI. If OpenAlex returns "Wei et al. 2022, Emergent Abilities of Large Language Models" and the title matches the **Bibliography** entry, we're done — no **Finding**.
>
> **Dev:** And if the sentence is "Our model achieves 92% accuracy"?
> **Domain expert:** That's `Result` — it's the **Paper**'s own finding. Not audited. No **Citation** needed.
>
> **Dev:** What if the Author wrote "Transformer models exhibit emergent capabilities" with no Citation at all?
> **Domain expert:** Classifier tags it `Background`, no Citations attached → `UncitedClaim` Finding pointing at that sentence.
>
> **Dev:** And if the .bib entry for `wei2022` has a DOI that doesn't resolve in OpenAlex?
> **Domain expert:** `FabricatedSource` Finding — high severity. That's exactly the failure mode the audit exists to catch.

## Flagged ambiguities

- "Reference" is deliberately not a domain term — it collides with programming meaning. Use **Source** for the cited work.
