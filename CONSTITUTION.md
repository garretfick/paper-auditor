# Paper Auditor Constitution

This document defines the non-negotiable principles that govern how Paper Auditor is built and how it behaves. It is the coordinate system every spec, ADR, and change operates within: if a rule belongs here but was left out of a particular spec, it is still binding — forgetting to restate a principle does not make it optional.

The domain vocabulary used below (**Paper**, **Claim**, **Citation**, **Source**, **Finding**, **Source Resolution**, **Claim Extractor**, **Author**, …) is defined in [`CONTEXT.md`](./CONTEXT.md) and is itself load-bearing (see Principle II).

**Version:** 1.0.0 · **Ratified:** 2026-06-28 · **Last amended:** 2026-06-28

---

## Principles

### I. Confidence-Tiered Findings

Every **Finding** MUST carry a `Confidence`, and the audit MUST NOT silently suppress a candidate Finding. Higher-severity Finding types (notably `FabricatedSource`) MUST be held to a stricter evidentiary bar than softer ones before they are emitted at high Confidence — but uncertainty is expressed by _lowering Confidence_, never by hiding the Finding.

_Rationale:_ The worst outcome the audit can produce is a **false negative** — a fabricated **Source** it fails to flag, which then sails through to submission. That is the exact failure the tool exists to prevent. A false positive is far less costly: flagging a genuine Source merely sends the **Author** to investigate, and they recover. So the audit MUST NOT withhold a suspicion to look more sure of itself — it surfaces everything it suspects, expresses doubt by _lowering_ `Confidence`, and reserves high Confidence for what it can stand behind.

### II. The Domain Vocabulary Is Law

The canonical terms defined in `CONTEXT.md` MUST be used exactly — in code identifiers, type names, CLI output, reports, documentation, and prose — and the `_Avoid_` synonyms (Document, reference, issue, user, …) MUST NOT appear in their place. Divergence from the canonical vocabulary is a defect, reviewable and fixable like any other.

_Rationale:_ The model's precision is the product. `CONTEXT.md` spends real effort distinguishing **Sentence** from **Claim**, **Source** from **Citation**, **Finding** from "issue"; letting synonyms leak back in quietly re-merges distinctions the design deliberately split.

### III. The Model Is the Truth; the Report Is a View

Every audit MUST produce the structured model of **Claims**, **Citations**, **Sources**, and **Findings**. The Markdown report is one _rendering_ of that model — never the source of truth. No **Finding** may exist only in prose: if it is in the report, it is in the model first.

_Rationale:_ The long-term shape is an interactive exploration of the claim–citation graph; v1 is a one-shot report. Keeping the model authoritative from day one means the report never accumulates information the future viewer can't reach. (Scope for _how much_ model to build is still governed by Principle VII — this principle dictates where truth lives, not how far ahead to build.)

### IV. LLM Output Is Explainable, Never Blind

A **Finding** that rests on LLM judgment alone (e.g. a `UncitedClaim` flowing from the **Claim Extractor**'s grouping and typing) is permitted, but it MUST carry a human-readable rationale and a `Confidence` that reflects the LLM's uncertainty. The audit MUST NOT present an unexplained LLM verdict as fact.

_Rationale:_ The **Claim Extractor** is the dominant source of noise in **Findings** (ADR-0002). The **Author** can only triage that noise if every judgment-based Finding tells them _why_ it fired and _how sure_ the tool is.

### V. The Resolver Is Abstracted and Degrades Gracefully

**Source Resolution** MUST sit behind a provider-agnostic boundary — the world-verification provider (today OpenAlex, per ADR-0001) MUST NOT be hardwired through the engine. Availability, rate-limit, and network failures MUST degrade to `UnverifiableSource`; they MUST NEVER crash the audit or produce a false `FabricatedSource`. Provider responses are cached.

_Rationale:_ The audit's headline value — catching fabricated citations — depends on an external service that will sometimes be down or wrong. Treating "couldn't reach the provider" as "the Source is fabricated" would manufacture exactly the false accusation Principle I forbids.

### VI. Split Testing Discipline

Deterministic code — BibTeX parsing, **Source Resolution** logic, report rendering, exit-code behavior — MUST follow test-first development: a failing test exists before the implementation. Non-deterministic, LLM-driven components (the **Claim Extractor**) MUST instead be governed by contract and evaluation tests over fixtures plus explicit graceful-degradation rules; they MUST NOT be pinned to exact-match output assertions.

_Rationale:_ Test-first is the right default, but asserting an exact LLM completion produces brittle tests that lie. Evals over fixtures test the property that matters (does the Extractor behave acceptably across representative **Papers**) without pretending the model is deterministic.

### VII. Strict YAGNI

Build only what the current slice needs. Speculative complexity — abstractions, configuration, extensibility for features that do not yet exist — MUST be justified by an ADR before it is added. The structured model (Principle III) is the _declared architecture_, not speculation; but its surface area still grows only as far as a current slice requires.

_Rationale:_ The project is deliberately a sequence of thin slices. Forcing speculative work to earn an ADR keeps the codebase honest about what is actually load-bearing today, and keeps the interactive-viewer vision from smuggling in unused machinery.

### VIII. ADRs for Significant, Hard-to-Reverse Decisions

Architecturally significant or hard-to-reverse decisions — the resolution provider, the data model, the LLM strategy, scope cuts, language and runtime choices — MUST be captured as an ADR in `docs/adr/`. Routine, easily-reversed decisions do not require one; reviewer judgment draws the line.

_Rationale:_ The repo already reasons through its major choices in `docs/adr/`. Requiring ADRs only for the consequential calls preserves that record where it matters without taxing everyday work.

### IX. Every Finding Is Actionable and Located

No **Finding** ships without all of: a resolvable `Location` in the **Paper**, the offending `Subject` (the **Claim** or **Citation** text), a plain-language `Detail` the **Author** can act on, and a `Confidence`. A Finding the Author cannot locate or act on is a defect, not a feature.

_Rationale:_ The audit exists to send the Author back into their draft to fix something specific. A Finding they can't find or understand is noise wearing the costume of signal. (`Location` precision is coarse today; this principle is the standard that work bends toward.)

### X. Best-Effort Reproducibility

The audit SHOULD produce stable output and stable ordering for a fixed **Paper**, **Bibliography**, and cache state, and SHOULD avoid gratuitous run-to-run churn. LLM-driven variation between runs is accepted and need not be engineered away.

_Rationale:_ Stable output makes the report diffable and the tool trustworthy across runs, but Principle VI already concedes the **Claim Extractor** is non-deterministic. Mandating bit-for-bit reproducibility would either be a lie or force temperature/seed contortions out of proportion to the benefit.

### XI. The Build Is the Arbiter; Releases Are Hands-Off

If the build passes, the change is valid — there is no separate, informal bar a change must clear. Consequently, the gates the build enforces (lint, type-check, tests, and any other automated check) MUST be deliberately hard to pass with poor code or weak tests; investment goes into making "green" _mean_ something. Publishing a new release MUST be fully automated and hands-off — a release that requires manual steps is a defect in the release pipeline.

_Rationale:_ A green build is only a meaningful contract if it is also a demanding one. Pushing all quality enforcement into automated gates — rather than reviewer vigilance — is what makes both "green means valid" and "releases ship themselves" true at the same time.

---

## Non-Principles

These are deliberately **not** constitutional, recorded here so their absence is understood as a decision rather than an oversight:

- **Paper privacy / local-only processing.** Running the LLM locally via Ollama is an ADR-level choice (ADR-0004), _not_ a constitutional guarantee. Nothing in this constitution forbids a future feature from sending the **Paper** to a cloud service. If local-only processing should become a hard guarantee, that is a future amendment (and a MAJOR bump).

---

## Governance

**Authority.** This constitution supersedes ad-hoc convention. Where a spec, ADR, or change conflicts with a principle here, the principle wins until the constitution is amended.

**Amendment.** Principles are added, changed, or removed by a normal change to this file, accompanied by an ADR when the amendment reflects an architecturally significant decision (Principle VIII). Each amendment updates the version and the "Last amended" date.

**Versioning.** The constitution is versioned semantically:

- **MAJOR** — a backward-incompatible change: a principle removed or redefined in a way that invalidates existing practice (e.g. making privacy a hard guarantee, or reversing the YAGNI stance).
- **MINOR** — a new principle, or materially expanded guidance within an existing one.
- **PATCH** — clarifications, wording, and typo fixes that do not change what is required.

**Compliance.** Code review is the compliance checkpoint: a reviewer may block a change for violating a principle here, and SHOULD cite the principle by number. Because the build is the arbiter (Principle XI), principles that can be mechanically enforced SHOULD migrate into automated gates over time rather than living only as review-time judgment.
