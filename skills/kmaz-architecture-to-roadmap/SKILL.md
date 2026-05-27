---
name: kmaz-architecture-to-roadmap
description: >-
  Decompose an architecture or technical design document into a parallelizable
  delivery plan: a ROADMAP.md plus a docs/features/ directory of one-file-per-deliverable
  feature specs. Use this skill whenever the user has an architecture/design/spec document
  and wants to break it into independently buildable pieces, plan parallel work, identify
  the critical path, create a work breakdown, generate feature/ticket files for parallel
  agents or teammates, or asks to "turn the architecture into a roadmap", "break this into
  chunks we can build in parallel", "create feature files", or "plan the build". Trigger
  even when the user doesn't say the word "roadmap" but is clearly asking to slice a design
  into deliverables or organize parallel implementation work.
---

# Architecture → Parallelizable Roadmap

## Purpose & philosophy

A good architecture document says *what the system is*. It does not say *in what order, by
how many people, can this be built without everyone blocking on each other*. That second
question is what this skill answers.

The output is a **delivery plan optimized for parallelism**: as many pieces as possible
buildable concurrently, with dependencies made explicit and the convergence points (the
critical path) called out so the team knows where careful sequencing matters. Each
deliverable becomes a self-contained feature file that one agent or person can pick up,
read alongside the architecture, and implement without needing the original planning
context in their head.

The core tension to manage: **maximize parallel work, minimize coordination cost.** Slicing
too finely creates churn where many features touch the same code; slicing too coarsely
serializes the team. Let the architecture's own component boundaries guide the cut — they
usually already encode the seams the designer intended.

A crucial separation of concerns runs through everything: **this skill plans *what* and
*why* and *acceptance*, never *how*.** Implementation decisions belong to the agent that
picks up each feature — it has the most context at build time and should review the
feature spec, the architecture, and whatever has already been built before deciding
implementation. Feature files leave a dedicated space for that agent to record the
decisions it makes. Prescribing implementation up front in the plan would both be wrong
often and rob the builder of necessary latitude.

## When to use

Use this when the user has a design/architecture/spec artifact and wants it turned into
buildable, parallelizable work. If there is no such document yet, say so — this skill
decomposes an existing plan; it does not invent the architecture. (If they want the
architecture itself, that is a different task.)

## Workflow

### Step 1 — Read the architecture and its referenced context

Read the architecture document in full. Follow its inbound links to supporting docs
(research, brand/design contracts, prior decisions) enough to understand the locked
decisions, the components, the non-goals, and any stated risks or sequencing hints. The
architecture's "components", "system overview", "locked decisions", and "non-goals"
sections are the richest source of natural feature seams.

Also scan what already exists in the repo/docs so the plan reflects reality, not a
greenfield assumption — some pieces may be partly built.

### Step 2 — Draft the decomposition, then surface ambiguities to the user

Form a candidate breakdown into independently-deliverable pieces, **letting the
architecture's own component boundaries dictate granularity** rather than forcing a fixed
size. A piece is the right size when one agent can own it end-to-end, it has a crisp
acceptance boundary, and it minimizes overlap with other pieces' code.

Before writing any files, surface the genuine ambiguities to the user and get answers —
do not silently guess on anything that materially changes the plan. Ask about things like:

- Seams that could reasonably be one feature or several (and why it matters).
- Anything that looks like a dependency but the architecture doesn't pin down.
- Scope calls where the non-goals are unclear.
- What counts as a standalone feature vs. a cross-cutting concern (see Step 4).
- Sequencing/priority intent if the architecture implies a deadline or demo.
- Where the system will first be wired end-to-end (the Walking Skeleton — see Step 2.5)
  and what the thinnest possible path through every layer looks like.
- Which convergence points in the dependency graph deserve their own integration feature
  (see Step 2.5) versus being absorbed into the features that converge.

Use the project's question-asking affordance. Keep questions decision-relevant — don't ask
what you can determine from the architecture yourself. Once answered, proceed without
further check-ins unless a new material ambiguity appears.

### Step 2.5 — Identify the Walking Skeleton and the integration features

Two structural moves prevent the failure mode where every feature is independently green
but nothing is wired together until the end:

**Walking Skeleton (always F-01).** Before any real feature, there must be a trivial
end-to-end path through every layer the architecture defines — UI → API → persistence →
response, or whatever the system's full stack is. It does *one* trivial thing
(returns a hard-coded value, displays a static string, persists and reads one record).
Its purpose is not the functionality; its purpose is that **every subsequent feature
plugs into a real, running, end-to-end system from day one.** Make this F-01 in the
roadmap, mark every other feature as depending on it (directly or transitively), and
write its acceptance criteria so that a request demonstrably traverses the whole stack.

**Integration features.** Whenever two or more parallel tracks must converge — a frontend
track meeting a backend track, two services that must talk to each other, a feature that
depends on contracts from several others — write that convergence as **its own feature
file**, not just as a "convergence point" in prose. Integration features have:

- Dependencies on the features they integrate (multiple).
- Acceptance criteria written against the *combined* behavior — i.e. an end-to-end test
  or scenario that only passes when the pieces are genuinely wired together, not when
  each piece works in isolation.
- A place in the dependency graph that makes the convergence visible.

A roadmap with N feature features and zero integration features is a strong signal that
integration has been deferred to the end — exactly what this step exists to prevent.

### Step 3 — Write `docs/ROADMAP.md`

Place it next to the architecture (typically `docs/`). Use this structure:

```markdown
# Roadmap — <Project Name>

**Status:** <draft/agreed> · **Date:** <date> · **Source:** [ARCHITECTURE.md](...) [+ BRAND/etc.]

## Overview
2–4 sentences: what we're building, the delivery strategy in one line
(e.g. "scaffold + engine first, then parallel manipulative/lesson/voice tracks
converging on integration").

## Project Pieces
A table of the high-level pieces. Each row: ID, name, one-line purpose,
depends-on (piece IDs), unblocks (piece IDs), parallelizable-with.

| ID | Piece | Purpose | Depends on | Unblocks | Parallel with |
|----|-------|---------|-----------|----------|---------------|

## Dependency Graph
An ASCII or mermaid graph showing the DAG. Make the parallel tracks visually obvious.

## Critical Path
The longest dependency chain — the sequence that determines minimum schedule.
Call out the convergence/integration points explicitly: where parallel tracks
must weave back together and what makes that risky.

## Parallelization Plan
Which pieces can be built simultaneously, grouped into waves/tracks. State what
a fresh agent needs before starting each track.

## Cross-Cutting Concerns
Things that span multiple features and must be consistent across them
(e.g. design/brand contract, error/telemetry conventions, type/data contracts,
testing strategy, accessibility, the shared lesson-graph schema). For each:
state the concern, where the source of truth lives (this doc, the architecture,
or a named contract doc), and the rule features must follow. If a concern is
better owned by the architecture or a design contract, say so and point there
rather than duplicating (duplication drifts).

## High-Level Acceptance Criteria
Per piece, 1–3 bullet outcomes that mean "this piece is done" at the roadmap
altitude (detailed criteria live in the feature files).
```

### Step 4 — Write one file per feature in `docs/features/`

Create `docs/features/` and one Markdown file per deliverable. Name files
`NN-kebab-name.md` (zero-padded order index for natural sorting; the index reflects a
sensible build order, not a hard sequence). Use this template for every feature, in this
exact order:

```markdown
# Feature: <Name>

**ID:** <F-NN> · **Roadmap piece:** <roadmap ID> · **Status:** Not started

## Description
What this delivers and why it exists, in plain language. 1–2 paragraphs. No
implementation detail.

## How it fits the roadmap
Where this sits in the delivery plan and on/off the critical path; which
parallel track it belongs to.

## Dependencies (must exist before this starts)
- <F-XX Feature name> — what specifically is needed from it (an interface, a
  contract, a deployed shell, etc.)
- External: <accounts/services that must be provisioned first>
(If none: "None — can start immediately.")

## Unblocks (what waits on this)
- <F-YY Feature name> — what it will consume from this feature.

## Acceptance criteria
Detailed, verifiable outcomes that define "done" — observable behavior and
contracts, NOT how to implement them. Write them so a reviewer who never saw
the build can check each one. Cover the happy path, the important edge/failure
cases named in the architecture, and conformance to any cross-cutting contract
(e.g. "voice/text conforms to BRAND.md §2").

## Testing requirements
What automated testing is required for this feature to be accepted: the kinds
of tests (unit / integration / contract / visual / e2e), what they must cover
(especially the architecture's named risks and the acceptance criteria above),
and any test that must run on the target environment (e.g. the real device).
Specify coverage of behavior, not specific test code.

## Manual setup required
Anything a human must do that an agent cannot: API keys / secrets and where they
go, external service provisioning, paid accounts, on-device manual testing,
asset generation that needs human review, etc. Be explicit so the builder isn't
blocked mid-stream. (If none: "None.")

## Implementation notes (filled in by the building agent)
> The agent implementing this feature records its implementation decisions and
> rationale here as it builds — chosen libraries/patterns within the
> architecture's constraints, trade-offs made, deviations from assumptions and
> why, and anything the next agent or the integrator needs to know. This section
> starts empty and is owned by the builder, not the planner. Cross-cutting
> discoveries that affect other features must also be propagated to ROADMAP.md
> or the architecture doc, not just left here.
```

Leave "Implementation notes" genuinely empty (just the guidance blockquote). It is the
builder's space and a key part of why the plan stays decoupled from the how.

### Step 5 — Verify the plan is coherent

Before finishing, check:

- **The dependency graph is a DAG** — no cycles. If two features depend on each other,
  the seam is wrong; re-split (often by extracting the shared contract into its own
  early feature).
- **Every "unblocks" has a matching "depends on"** in the named feature, and vice versa.
  Inconsistent edges are the most common defect — reconcile them.
- **Every roadmap piece maps to at least one feature file**, and every feature maps to a
  roadmap piece.
- **Acceptance criteria contain no implementation prescriptions.** If a criterion says
  *how*, rewrite it as the observable outcome it's really trying to guarantee.
- **Cross-cutting concerns are documented once**, in the right home, and referenced — not
  copied into every feature.
- **The critical path and convergence points are explicit** — the reader can see where
  parallel work must re-synchronize and why that's the schedule risk.
- **F-01 is a Walking Skeleton.** It exercises every architectural layer end-to-end with
  trivial functionality, and every other feature depends on it (directly or transitively).
  If F-01 is a real feature instead, the integration spine is missing.
- **Every convergence point in the graph has an integration feature**, with acceptance
  criteria that only pass when the pieces are wired together. A graph where parallel
  tracks just "meet" with no integration feature is deferring the hardest work to the end.

Then give the user a short summary: number of pieces/features, the critical path in one
line, what can start in parallel immediately, and any decisions still open.

## Notes on judgment

- Favor fewer, well-bounded features over many fiddly ones; coordination cost is real and
  usually underestimated. But honor the architecture's seams — if it cleanly separates a
  component, that is a feature.
- A "cross-cutting concern" is something multiple features must obey *consistently*
  (a contract), not a feature itself. A shared schema, a design system, a telemetry
  convention. Its home is the roadmap or architecture; features *reference* it.
- It is correct and expected for some features to depend on others. The goal is not zero
  dependencies — it is a wide, shallow graph with a clearly identified critical path,
  rather than one long chain.
- Never invent architecture. If the design doc is silent on something that blocks
  decomposition, that is a Step 2 question for the user, not an assumption to bury in a
  feature file.
