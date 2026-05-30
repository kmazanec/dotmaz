---
name: kmaz-prd-to-architecture
description: >-
  Turn a locked Product Requirements Document (docs/PRD.md, the kind kmaz-prd produces) into a
  defensible system design: a decision-by-decision walkthrough that teaches the user the tradeoffs,
  then an ADR-style ARCHITECTURE.md (every decision with its WHY) and a docs/adrs/ directory. The
  PRD owns WHAT/WHY (behavior, technology-agnostic); this skill owns HOW (the stack, the system
  shape, every architectural decision). It grounds those decisions in a deep technology/tradeoff
  research pass via the kmaz-research workflow, reusing any earlier research rather than redoing it.
  Use this whenever the user has a PRD (or a brief/spec) and wants it turned into an architecture —
  "design the system", "decide the architecture", "what stack should I use", "walk me through the
  decisions", "turn this PRD into a design". If a raw brief arrives with no PRD, point the user at
  kmaz-prd first (the WHAT must be locked before the HOW); only fall back to designing from a raw
  brief if they explicitly skip the PRD stage. Hands off to kmaz-architecture-to-roadmap once the
  design is locked. This is the second stage of the build pipeline.
---

# PRD → Defensible Architecture

> **Pipeline conventions:** shared rules (model tiering, contract discipline, the teach-the-human
> mandate, the quality bars, the compound loop) live in
> [`../kmaz-pipeline/CONVENTIONS.md`](../kmaz-pipeline/CONVENTIONS.md). This skill owns HOW (the
> system design) and is where security, non-functional, and observability decisions are MADE — see
> the quality bars there.

## Purpose & philosophy

A PRD says *what to build and why* — in behavior, technology-agnostic terms. It deliberately does
**not** say *how*. This skill closes that gap. It turns the locked requirements into a set of
**deliberate, defensible design decisions** — each researched, explained to the user in plain
language, chosen by the user (not silently by the model), and recorded with the reasoning that
justifies it.

The pipeline split is strict: **`kmaz-prd` owns WHAT/WHY; this skill owns HOW.** The PRD is your
input and your source of truth for requirements — do not re-litigate scope or invent requirements
here. If a requirement is genuinely missing or contradictory, that's a PRD defect: surface it and
send it back, don't paper over it with an architectural assumption.

The guiding standard is simple and demanding: **plan and build as if this were production-grade
software you will defend in front of a CTO.** Every decision in the output must survive *"why did
you do it that way and not the obvious alternative?"* If a decision can't survive that question, it
isn't finished.

Three commitments follow:

1. **The user must understand, not just receive.** Explain each decision as you would to a sharp
   novice — the options, what each buys and costs, why one wins *here*. The user has to be able to
   re-explain it without you in the room. A correct decision the user can't defend is a failure.

2. **Decisions are the user's to make.** Research the options, form a recommendation, say which
   you'd pick and why — but present real alternatives and let the user choose. Document what they
   chose. This is their architecture to defend.

3. **The WHY is the product.** A list of choices is worthless; a list of *justified* choices is an
   architecture. Every decision is recorded ADR-style: context, options weighed, choice, rationale,
   tradeoffs accepted. The tradeoffs are not optional — naming what you gave up is how a CTO knows
   you actually thought about it.

This skill plans the *system*. It does not write feature code and it does not slice the build into
tickets — that's the next stage (`kmaz-architecture-to-roadmap`). Keep the altitude at design
decisions and their justification.

## When to use

Use when the user has a **PRD** (`docs/PRD.md`) and wants it designed into a defensible
architecture. The PRD is the primary input.

- **No PRD yet?** Point the user at **`kmaz-prd`** first — the WHAT must be locked before the HOW.
  Only design from a raw brief if the user explicitly chooses to skip the PRD stage, and say
  plainly that you're working from un-interrogated requirements (degraded mode).
- The PRD's *Requirements*, *Acceptance Criteria*, *Scope*, *Dependencies*, and *Open Questions &
  Risks* sections are the richest source for the decision surface.

## Outputs

Outputs land in `docs/` (create it if absent):

| File | What it is | Who consumes it |
|------|------------|-----------------|
| `docs/ARCHITECTURE.md` | A **living overview**: executive summary, system + data-flow diagrams, prose on how the system fits together, and a **decision index** linking every ADR. Evolves as the design refines. | The user (to defend), `kmaz-architecture-to-roadmap` next, and every later skill that needs the system's current shape. |
| `docs/adrs/ADR-NNN-<slug>.md` | **One file per decision**, ADR-style with full context/options/decision/rationale/tradeoffs. Largely static once accepted; a changed decision gets a *new* ADR that supersedes the old one rather than editing in place. | Anyone defending or revisiting a decision. |
| `docs/research/*.md` | The cited research grounding (DOMAIN/TECHNOLOGY/MARKET/COMPANY + README index), produced by `kmaz-research`. | The user (to learn), and the design decisions (technology tradeoffs). |
| `docs/architecture-diagrams/*.html` | Interactive visual explainers (modules / data flows / calls), produced by `kmaz-create-diagram` once the design is locked. | The user (to *see* and internalize the system). |

`docs/research/COMPANY.md`'s **brand/voice section remains the binding design contract** the build
phase (`kmaz-build-iteration` / `kmaz-feature-builder`) consumes for UI/copy. Keep that thread
unbroken.

The split between ARCHITECTURE.md and ADRs matters: the overview gets edited dozens of times as the
project evolves; the ADRs are the durable record of *why* and shouldn't churn. Mixing them buries
real decisions under doc-evolution noise.

## Workflow

### Step 1 — Read the PRD and map the decision surface

Read `docs/PRD.md` in full. Then produce, for your own use, two lists:

- **The decision surface**: every genuine design decision the requirements force or leave open —
  data layer, persistence, auth, frontend framework, API style, hosting/infra, real-time vs.
  polling, state management, testing strategy, etc. Group them into coherent *rounds* (e.g. "Data &
  persistence", "Frontend & client", "Infra & deployment", "Cross-cutting: auth, testing,
  observability"). You walk the user through one round at a time.
- **The technologies in play**: every technology, framework, API, or platform a requirement
  implies. This seeds the technology research.
- **The shared cross-cutting contracts**: which decisions establish a *shape multiple features will
  share* — a tagged union/enum of operations, a wire/message schema, a shared validator, a
  provider/plugin interface, the brand/voice contract. Flag these now, because their ADRs need extra
  detail (shape + exhaustive consumers — see Step 4a's "Contract consequences"): the roadmap indexes
  them as contract source-of-truth and `kmaz-plan-iteration` freezes concrete signatures against
  them. A shared contract whose ADR is thin forces the build to guess the shape.

Note the **target company**, if the PRD or its research names one. Scan what already exists in the
repo so the design reflects reality, not greenfield assumptions.

Map each architectural decision back to the PRD requirement(s) it serves — a decision that serves
no requirement is scope creep; a requirement with no decision is a gap.

### Step 2 — Ground decisions in research (reuse first, then deepen)

Check `docs/research/` first. If `kmaz-prd` already ran research, **reuse it** — read the README
index and the relevant files. Do not re-research what's already cited.

Then run the **deeper technology/tradeoff pass** the architecture stage needs (the PRD stage
deliberately left this shallow). Dispatch **`kmaz-research`** at `depth: 'deep'`, scoped to
`technology` (and `domain`/`market` only if still thin), with a `focus` naming the specific
tradeoffs your decision surface raises — e.g. *"Postgres vs. DynamoDB for this read-heavy
access pattern; session-cookie vs. JWT for this trust model."* Invoke it inline via the
`workflow()` hook if available, else tell the user to run `/kmaz-research` and weave it back in.

If there is **no company research yet** and the PRD names a target company, include `company` in
this pass so COMPANY.md (and its brand/voice design contract) exists for the build stage.

While research runs, draft the Step 3 walkthrough from what you know — but **wait for findings
before finalizing recommendations**, since they may change what's defensible (e.g. "they're an
all-TypeScript shop" tilts a language choice). Cite the load-bearing findings in the ADRs;
**carry forward low-confidence flags** so the user never defends a shaky claim to a CTO.

### Step 3 — Walk the user through decisions, one round at a time

This is the heart of the skill, and its purpose is as much to **educate the user as to decide** —
they should leave each round understanding the tradeoff well enough to re-explain it to a CTO
without you. For each round:

1. **Teach the decision.** Plain language: what's being decided and why it matters *for this PRD*.
   Assume a sharp novice; define jargon in a clause. **Ground the teaching in the research** —
   pull the relevant finding from `docs/research/` (TECHNOLOGY.md, COMPANY.md, etc.), state it,
   and cite it with its confidence, so what you teach is verifiable, not a hand-wave. The research
   you gathered exists to make this teaching real; don't let it sit unread in a file.
2. **Lay out the real options.** 2–4 genuine alternatives, each with what it buys and costs *in
   this context* — not a generic pros/cons dump. Fold in company/research context: "their stack is
   already Postgres + Rails, so X fits; Y would be novel and you'd have to justify the divergence."
3. **Recommend, with reasoning.** Say which you'd pick and why, including how it plays to a CTO. Make
   clear it's the user's call.
4. **Ask the user to choose.** Use the harness's question affordance; put your recommended option
   first and mark it. Let the user pick, adjust, or push back — genuinely incorporate pushback.

Keep questions decision-relevant. Don't ask what the PRD already answers or what you can determine
yourself. Move round by round; record each locked decision as you go (Step 4), not batched at the end.

#### Two cross-cutting rounds are MANDATORY (the quality bars)

Per CONVENTIONS.md's "Quality bars," a great product is secure, scales, is observable, and is
simple. These are architectural decisions, not review-time afterthoughts — catching a trust-boundary
flaw at review means rebuilding; deciding it here means designing it out. Run both rounds for every
project, teach them the same way (research-grounded options → recommend → user chooses), and record
the outcomes as ADRs:

- **Security & trust boundaries.** Walk: the authn/authz model; what data is sensitive and how it's
  protected (in transit, at rest, in logs); the trust boundaries (where untrusted input crosses into
  the system) and the validation strategy at each; secret handling; and any domain-specific safety
  invariant the research surfaced (e.g. SSRF exposure for a URL-fetching feature, multi-tenant
  isolation). Each material decision is its own ADR; the build's security review enforces against
  them. Don't hand-wave "we'll validate inputs" — name *where* and *how*.
- **Non-functional & operability.** Decide and record, as ADRs: the **scale/throughput** target the
  design must hold (and the approach that meets it — and explicitly when you're deferring scale, so
  it's a conscious choice not an omission); **performance budgets** for the load-bearing paths;
  **availability** expectations; **data retention/compliance** if the domain demands it; and
  **observability** — what's logged, what's measured, how an operator knows the system is healthy.
  An unstated target can't be verified downstream, so state the ones that matter and say which you're
  deferring.

Keep these proportionate — a small internal tool needs lighter answers than a public multi-tenant
product — but never skip the rounds. "We're deferring horizontal scale to post-MVP, single instance
is fine for the target load (ADR-NNN)" is a perfectly good outcome; silence is not.

After the core (PRD-mandated) decisions, run a **stretch-features round**: using the
company/domain/market research, propose 2–4 features *beyond the PRD's current scope* that would (a)
impress this specific CTO, (b) deepen the user's grasp of the domain and stack, and (c) fit the
company's portfolio. Explain why each is worth it; let the user pick which to commit. **If a stretch
feature is accepted, it changes WHAT is being built — flag that it should be reflected back into the
PRD** (a new PRD version per that skill's revision-history rule), so the WHAT stays the source of
truth. Committed stretch features become first-class entries in ARCHITECTURE.md, flagged as stretch.

### Step 4 — Write ADRs as you lock them, and ARCHITECTURE.md as the living overview

#### 4a. Each accepted decision becomes its own ADR file

As soon as a decision is locked, write `docs/adrs/ADR-NNN-<short-slug>.md`. Number sequentially from
001; never re-number, never edit an accepted ADR in place. A later decision that overturns an
earlier one gets a *new* ADR that supersedes it.

```markdown
# ADR-NNN: <the decision, stated as a choice>

**Status:** Accepted · **Date:** <YYYY-MM-DD> · **Stretch:** <yes/no> · **Contract:** <yes/no>
**Supersedes:** <ADR-XXX or none> · **Superseded by:** <ADR-YYY or none>

## Context
What in the PRD / company / constraints forced this decision. Link the PRD requirement(s) it
serves. What's true that makes this a real choice and not a default.

## Options considered
The genuine alternatives, each with the tradeoff that matters here. No strawmen.

## Decision
What was chosen.

## Rationale
Why this option wins *for this PRD and this company*. The sentence the user repeats to the CTO.
Cite the research finding it rests on where applicable.

## Tradeoffs & risks
What we gave up, what could go wrong, how we'd mitigate or when we'd revisit. Naming the cost is
non-negotiable — it's the proof we actually chose.

## Consequences for the build
Anything downstream features or skills need to know. Two kinds — include whichever apply:

- **Policy consequences** — a rule every feature must follow (e.g. "all persistence uses Drizzle; no
  raw SQL", "auth is session-cookie based, not JWT"). State them plainly.
- **Contract consequences** — present ONLY if this decision establishes a *shared cross-cutting
  contract*: an extensible shape multiple features introduce/consume/extend (a tagged union, an enum,
  a wire/message schema, a shared validator, a provider interface, a brand/voice contract). When it
  does, set **Contract: yes** in the header above and give the build stages enough to freeze it:
  - **Source of truth** — the file the shape will live in (e.g. `packages/core/src/action.ts`).
  - **Shape** — the minimum-viable form: the type/union/enum and its initial members/fields. Not a
    final signature (the planner freezes that), but the concrete starting shape, not a hand-wave.
  - **Exhaustive consumers** — the *categories* of code that must handle every case of this shape and
    must not silently fall out of sync (e.g. "every reducer, the wire (de)serializer, the API
    validator"). This is what lets the build land all variants up front instead of breaking later.

  The roadmap will index this ADR as the contract's source of truth, and `kmaz-plan-iteration` freezes
  a concrete signature *consistent with this section*. A contract decision whose build consequences
  are just "we use a tagged union" is too thin — name the shape and the exhaustive consumers.
```

Add **· Contract: <yes/no>** to the ADR header line for any decision that establishes a shared
cross-cutting contract, so the roadmap stage can find them at a glance.

When a decision changes: write a new ADR with `**Supersedes:** ADR-NNN`, and set the old one's
header to `**Status:** Superseded` / `**Superseded by:** ADR-MMM`. Never delete or rewrite the old
ADR's body — its reasoning is the historical record.

#### 4b. ARCHITECTURE.md is the living overview, not a decision dump

```markdown
# Architecture — <Project Name>

**Status:** <draft / agreed> · **Last updated:** <date> · **PRD:** [PRD.md](./PRD.md)
**Research:** [docs/research/](./research/) · **ADRs:** [docs/adrs/](./adrs/)

## Executive summary
A tight, standalone overview a CTO reads in one minute: what we're building and for whom, the
headline architectural approach in a sentence or two, the 2–3 most consequential decisions (linking
their ADRs), the stretch features committed, and the key risks. Write last, place first; update
whenever a load-bearing decision changes.

## System overview
The architecture in prose plus diagrams. Include at minimum:
- A **system / component diagram** (mermaid `graph`/`flowchart`).
- A **data-flow diagram** (mermaid `sequenceDiagram` for a key request path, or a `flowchart`).
Render as fenced ```mermaid blocks, each followed by a short walkthrough. This section evolves as
features add components.

## Decision index
A table of every ADR with one-line summaries. The ADR files are the source of truth; this index
makes them findable. Never restate an ADR's rationale/tradeoffs here. The **Contract** column flags
ADRs that establish a shared cross-cutting contract — the roadmap stage indexes exactly these as
contract source-of-truth.

| ADR | Decision | Status | Stretch | Contract |
|-----|----------|--------|---------|----------|
| [ADR-001](./adrs/ADR-001-<slug>.md) | <one-line summary> | Accepted | no | no |

## Stretch features
For each committed stretch feature: what it is, why it impresses this CTO / fits the portfolio /
teaches the domain, and which ADR(s) it depends on. Note that the PRD was updated to include it.

## Non-goals
What we are deliberately not doing, and why — so scope is defensible and the roadmap stage doesn't
re-litigate it. (Mirror the PRD's Out-of-Scope/Deferred where relevant.)

## Open questions
Anything unresolved a builder or CTO would reasonably ask. Resolve by writing new ADRs.
```

Write ADR files and update the decision index as you lock decisions, not all at the end. Rationale
you can't write strongly belongs to a decision that isn't actually made — go back to the user.

### Step 5 — Finalize and verify defensibility

Ensure the research docs are complete and at the right altitude (novice-friendly, sourced); confirm
COMPANY.md's brand/voice section is concrete enough to act as a design contract for the build stage.

Then verify the package is CTO-ready:

- **The executive summary stands alone** — a CTO reading only it understands what's being built, the
  headline approach, the biggest bets, and the risks.
- **The system overview has real diagrams** (component + data-flow, mermaid, each with a
  walkthrough). A diagram nobody can explain is decoration.
- **Every decision in scope has its own ADR file.** No silent defaults. Implicit decisions get
  surfaced as their own ADR.
- **Every ADR is linked from the decision index** and every index entry points to a real file.
- **ARCHITECTURE.md doesn't restate ADR rationale/tradeoffs** — it links; duplication drifts.
- **Every ADR has real "Tradeoffs & risks" and "Consequences for the build" sections.** No named
  cost = the alternative wasn't actually considered.
- **Every shared cross-cutting contract has a contract-bearing ADR (`Contract: yes`) that names its
  source of truth, its shape, and its exhaustive consumers.** Walk the decision surface's contract
  list (Step 1): each one must have an ADR detailed enough that the roadmap can cite it and
  `kmaz-plan-iteration` can freeze a concrete signature against it. A contract ADR that only says
  "we use a tagged union" without the shape + the consumers that must stay exhaustive is too thin —
  the build will guess. Fix it here, not downstream.
- **Security & trust boundaries are decided, not deferred by silence.** The authn/authz model, the
  sensitive-data protections, the trust boundaries + validation strategy, and secret handling each
  have an ADR (or an explicit, recorded deferral). A project with untrusted input and no
  trust-boundary ADR is incomplete.
- **Non-functional targets are stated.** Scale/throughput, performance budgets for load-bearing
  paths, availability, retention/compliance (where relevant), and observability each have an ADR or a
  recorded "deferred, here's why." An unstated target can't be verified by the build.
- **Every rationale is specific to this PRD/company**, not a generic platitude. Tie it to context.
- **Every decision traces to a PRD requirement** (or an accepted stretch feature that was folded
  back into the PRD). No orphan decisions; no uncovered requirements.
- **The user can defend each decision.** If unsure they understood one, re-teach before calling it
  done. Understanding is the success criterion.
- **The technology research covers every technology an ADR commits to**, including stretch tech.
- **Company research is sourced** (or flagged low-confidence) so nothing the user repeats is
  unverifiable.

Finish with a short summary: count of decisions, the 2–3 most consequential in a sentence each, the
stretch features committed, and any open questions.

### Step 6 — Visualize the architecture (the human-learning artifact)

Now that the system is *designed*, make it *seeable*. Mermaid diagrams in ARCHITECTURE.md are the
defensible record; a visual explainer is how the human actually internalizes the system. Invoke the
**`kmaz-create-diagram`** skill to produce highly-visual, interactive HTML explainers — separate ones
for **modules**, **data flows**, and **calls** — high-level at first glance with detail revealed on
hover/click, in a clear consultant style. Point it at the ARCHITECTURE.md + ADRs you just wrote.

This is the architecture stage's contribution to the compound learning loop (CONVENTIONS.md, "Teach
the human"): the user should leave able to *see* the system, not just read decisions about it. Offer
it as the natural close of the design session; produce the visualizers before handing off to the
roadmap stage so the human reviews the design visually first.

### Step 7 — Hand off

The natural next step slices this architecture into an iterative build plan. Tell the user they can
run **`kmaz-architecture-to-roadmap`** on the new ARCHITECTURE.md to generate a ROADMAP.md +
per-iteration feature specs, which then feed `kmaz-plan-iteration` → `kmaz-build-iteration`. The
research docs carry forward, and COMPANY.md's brand section serves as the design/brand contract the
build stages expect. Don't auto-run it; offer it as the next move.

## Notes on judgment

- **The PRD is the source of truth for WHAT.** Don't re-decide scope here. A missing/contradictory
  requirement is a PRD defect — send it back, don't architect around it.
- **Recommend, don't dictate.** The user's ability to defend a decision depends on owning it.
  Document their choice, not yours.
- **Context beats convention.** "Industry standard" is not a rationale. The same decision can be
  right for one company and wrong for another. Tie the WHY to *this* PRD and *this* company.
- **The tradeoff is the tell.** An empty tradeoffs section is a decision that wasn't really made. A
  CTO will probe exactly there. Always name the cost.
- **Stretch features are strategic, not decorative** — and they change the WHAT, so reflect them
  back into the PRD rather than letting the architecture silently exceed the requirements.
- **Don't invent facts about the company.** Flag low-confidence research. A confidently wrong claim
  about their stack is worse than admitting uncertainty.
- **Reuse research; deepen only what the decisions demand.** Re-running the whole fan-out is
  wasteful — read what exists, deepen the technology/tradeoff pass your decision surface needs.
