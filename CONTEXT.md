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
A unit of assertion the **Claim Extractor** groups out of the **Paper**'s text. Each **Claim** carries a **Claim Type** that determines whether it requires a **Citation**. A **Claim** may span part of a **Sentence**, an entire **Sentence**, or multiple **Sentences**; one **Sentence** may yield multiple **Claims**.
_Avoid_: Assertion, statement, proposition, sentence (a **Sentence** is a grouping signal, not the unit).

**Sentence**:
A sentence in the **Paper**, identified by sentence-boundary detection during loading. Used as a strong grouping signal by the **Claim Extractor** and as the unit of location anchoring in **Findings**. Not the unit of audit — a **Claim** may span multiple **Sentences** or share one with other **Claims**.
_Avoid_: Line, utterance, span (these conflate the structural unit with the assertion unit).

**Claim Extractor**:
The LLM-driven pass that reads the **Paper**'s text and emits **Claims** — grouping words into **Claims**, assigning each a **Claim Type**, and attaching the **Citations** the LLM judges support each **Claim**. One pass; grouping and typing are not separate stages.
_Avoid_: Classifier (the Extractor does more than classify — it owns the grouping decision too), sentence tagger.

**Citation**:
The in-text marker in the **Paper** that attaches a **Source** to a **Claim** (e.g. `[@smith2020]`). Contains a **Citation Key**.
_Avoid_: Cite, ref.

**Source**:
The cited work itself — the paper, book, or dataset that a **Citation** points to. The **Bibliography** describes it; **Source Resolution** verifies it exists in the world.
_Avoid_: Reference, bibliography entry, work.

**Claim Type**:
The category of a **Claim**, assigned by the **Claim Extractor**. One of:
`Background` (about prior work or established facts — must have a **Citation**; **the only audited type in v1**),
`Method` (describes the author's own approach — no Citation required),
`Result` (the Paper's own findings — no Citation required),
`Discussion` (interpretation — not audited in v1; future work will split it into referential vs. interpretive sub-types),
`Navigation` (structural sentences like "Section 3 presents…" — no Citation required).

**Finding**:
A single issue surfaced by the audit. Has a `Type` (e.g. `UncitedClaim`, `UnresolvedCitation`, `FabricatedSource`, `UnverifiableSource`, `NoCitationsDetected`), a `Location` in the **Paper**, a `Subject` (the offending Claim or Citation text), a `Detail` (human-readable explanation), and a `Confidence` level. Most **Finding** types point at something wrong _in_ the **Paper**; `NoCitationsDetected` is the exception — it reports that the audit ran against essentially no inputs (no **Citations** and an empty **Bibliography**), so that a clean report can never be mistaken for "the tool checked my work and found nothing wrong."
_Avoid_: Issue, problem, error, warning.

**Source Resolution**:
The two-phase check that verifies a **Citation** points to a real **Source**.
Phase 1 (local): does the **Citation Key** appear in the **Bibliography**? — if not, emit `UnresolvedCitation`.
Phase 2 (world): does OpenAlex return a record matching the **Bibliography** entry's metadata? — mismatch emits `FabricatedSource`; no match at all with no DOI/arxiv emits `UnverifiableSource`.
_Avoid_: Lookup, verification, validation.

## Relationships

- An **Author** submits a **Paper** (plus its **Bibliography**) to the auditor.
- A **Paper** is composed of **Sentences** (structural) and contains many **Citations** (each pointing into the **Bibliography** via a **Citation Key**).
- The **Claim Extractor** reads the **Paper** and emits many **Claims**, each with a **Claim Type** and zero or more attached **Citations** — the attachment is the Extractor's judgement, not a positional rule. A **Claim** may span multiple **Sentences** and a **Sentence** may yield multiple **Claims**.
- A **Citation** may be attached to zero, one, or several **Claims** depending on what the Extractor judges it supports. A **Citation** the Extractor attaches to no **Claim** is still subject to **Source Resolution** — orphan **Citations** can still be **UnresolvedCitation** or **FabricatedSource**.
- A **Bibliography** entry describes a **Source**.
- The audit produces zero or more **Findings** about the **Paper**.

## Example dialogue

> **Dev:** The **Author** writes "Transformer models exhibit emergent capabilities `[@wei2022]`." What does the audit do with that?
> **Domain expert:** The **Claim Extractor** emits one **Claim** from that sentence and tags it `Background` — it's making a claim about prior work, not about the **Paper**'s own contribution. The **Citation** `[@wei2022]` is attached, so no `UncitedClaim`. Then **Source Resolution**: Phase 1 checks `wei2022` is in the **Bibliography** — say it is. Phase 2 hits OpenAlex with that entry's DOI. If OpenAlex returns "Wei et al. 2022, Emergent Abilities of Large Language Models" and the title matches the **Bibliography** entry, we're done — no **Finding**.
>
> **Dev:** And if the sentence is "Our model achieves 92% accuracy"?
> **Domain expert:** That's `Result` — it's the **Paper**'s own finding. Not audited. No **Citation** needed.
>
> **Dev:** What if the Author wrote "Transformer models exhibit emergent capabilities" with no Citation at all?
> **Domain expert:** The **Claim Extractor** tags it `Background`, no **Citations** attached → `UncitedClaim` Finding pointing at that **Claim**.
>
> **Dev:** And if the .bib entry for `wei2022` has a DOI that doesn't resolve in OpenAlex?
> **Domain expert:** `FabricatedSource` Finding — high severity. That's exactly the failure mode the audit exists to catch.
>
> **Dev:** Trickier one — the **Author** writes "We achieve 92% accuracy on the test set, which is consistent with prior work `[@smith2021]`." That's one sentence with two assertions. What happens?
> **Domain expert:** The **Claim Extractor** emits two **Claims** from that sentence. The first — "We achieve 92% accuracy on the test set" — gets `Result`; not audited, no **Citation** needed. The second — "which is consistent with prior work" — gets `Background` and the **Extractor** attaches `[@smith2021]` to it. So one **Sentence**, two **Claims**, one of them carrying the **Citation** the LLM judges supports it. If the **Author** had written the same sentence with no **Citation**, the second **Claim** would become an `UncitedClaim` **Finding** and the first would still pass — which is exactly the value the **Claim**-as-unit model unlocks: compound sentences can't hide an uncited assertion behind a cited one.

## Flagged ambiguities

- "Reference" is deliberately not a domain term — it collides with programming meaning. Use **Source** for the cited work.
- **Sentence** vs **Claim** is a deliberate split, not an accident. An earlier draft of this domain model used the **Sentence** as the audit unit; we widened it to **Claim** because compound sentences carry multiple distinct assertions, single assertions span multiple sentences, and shared-context lists fold multiple sibling assertions into one syntactic structure. **Sentence** remains as a structural primitive and **Finding**-location anchor; it is never the unit of audit. See ADR-0002.
