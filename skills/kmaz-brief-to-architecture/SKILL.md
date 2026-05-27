---
name: kmaz-brief-to-architecture
description: >-
  Turn a project brief, take-home, RFP, or feature spec into a defensible system design:
  a decision-by-decision walkthrough that teaches the user the tradeoffs, then an
  ADR-style ARCHITECTURE.md (every decision with its WHY), a RESEARCH.md backgrounder on
  the technologies involved, and a COMPANY.md profiling the target company's stack,
  leadership, business model, and brand/voice. Use this skill whenever the user hands over
  a project brief / project spec / take-home assignment / RFP / coding challenge and wants
  to plan it, "review a new project", decide the architecture, understand the design
  decisions, figure out the tech stack, research the company they're building for, or
  prepare to defend their choices to a CTO. Trigger even when the user doesn't say
  "architecture" — phrases like "we have a new project to work on", "here's the brief",
  "help me plan this build", "what stack should I use", or "walk me through the decisions"
  all qualify. This is the first stage of the build pipeline and hands off to
  kmaz-architecture-to-roadmap once the design is locked.
---

# Brief → Defensible Architecture

## Purpose & philosophy

A brief tells you *what to build*. It rarely tells you *how to build it well*, and it never
tells you *why* a given approach is right for this particular company at this particular
moment. This skill closes both gaps. It turns a brief into a set of **deliberate,
defensible design decisions** — each one researched, explained to the user in plain
language, chosen by the user (not silently by the model), and recorded with the reasoning
that justifies it.

The guiding standard is simple and demanding: **plan and build as if this were
production-grade software you will defend in front of a CTO.** Every decision in the output
must survive the question "why did you do it that way and not the obvious alternative?" If a
decision can't survive that question, it isn't finished.

Three commitments follow from that standard:

1. **The user must understand, not just receive.** The user is often learning the domain.
   Explain each decision as you would to a sharp novice — what the options are, what each
   buys and costs, why one wins *here*. The user has to be able to re-explain it without
   you in the room. A correct decision the user can't defend is a failure of this skill.

2. **Decisions are the user's to make.** Research the options, form a recommendation, and
   say which you'd pick and why — but present real alternatives and let the user choose.
   Document what they chose. This is their architecture to defend; ownership matters.

3. **The WHY is the product.** A list of choices is worthless; a list of *justified*
   choices is an architecture. Every decision is recorded ADR-style: the context that
   forced the decision, the options weighed, the choice, the rationale, and the tradeoffs
   accepted. The tradeoffs are not optional — naming what you gave up is how a CTO knows you
   actually thought about it.

This skill plans the *system*. It does not write feature code and it does not slice the
build into tickets — that is the next stage (`kmaz-architecture-to-roadmap`). Keep the altitude
at design decisions and their justification.

## When to use

Use this when the user has a brief / spec / take-home / RFP / challenge and wants it
planned into a defensible architecture. The brief is the dynamic input to this skill,
supplied at invocation — as pasted text, a file path, or a link. If it wasn't included,
ask for it (or its path) before doing anything else; this skill reasons *from* a brief and
does not invent the requirements.

## Outputs

Outputs land in `docs/` (create it if absent):

| File | What it is | Who consumes it |
|------|------------|-----------------|
| `docs/ARCHITECTURE.md` | A **living overview**: executive summary, system + data-flow diagrams, a prose description of how the system fits together, and a **decision index** that links out to every ADR. Evolves over the project as the design refines. | The user (to defend), `kmaz-architecture-to-roadmap` next, and every later skill that needs the current shape of the system. |
| `docs/adrs/ADR-NNN-<slug>.md` | **One file per decision**, ADR-style with full context/options/decision/rationale/tradeoffs. Largely static once accepted; a changed decision gets a *new* ADR that supersedes the old one rather than editing in place. | Anyone defending or revisiting a decision — referenced from ARCHITECTURE.md, feature files, PRs, etc. |
| `docs/RESEARCH.md` | Plain-language backgrounder on each technology in play, so the user can teach themselves. | The user (to learn). |
| `docs/COMPANY.md` | The target company: tech stack, founders / technical leadership, business model, and a brand/voice section. Informs stretch-feature priorities and look-and-feel. | The user + downstream design/brand contract for `kmaz-feature-builder`. |

The split between ARCHITECTURE.md and ADRs matters: the overview will be edited dozens of times as the project evolves (new components, new diagrams, new cross-cutting concerns), but the ADRs are the durable record of *why* each decision was made and shouldn't churn. Mixing them in one file means real decisions get buried under doc-evolution noise.

If there is no target company (a generic brief), say so and skip COMPANY.md rather than
inventing a company.

## Workflow

### Step 1 — Read the brief and map the decision surface

Read the brief in full. Then produce, for your own use, two lists:

- **The decision surface**: every genuine design decision the brief forces or leaves open —
  data layer, persistence, auth, frontend framework, API style, hosting/infra, real-time
  vs. polling, state management, testing strategy, etc. Group them into a few coherent
  *rounds* (e.g. "Data & persistence", "Frontend & client", "Infra & deployment",
  "Cross-cutting: auth, testing, observability"). Grouping matters because you'll walk the
  user through one round at a time.
- **The technologies in play**: every named or strongly-implied technology, framework, API,
  or platform. This seeds RESEARCH.md.

Also identify the **target company**, if the brief names or implies one. Note it for the
research subagent.

Don't ask the user anything yet — gather context first (Step 2) so your questions are
informed.

### Step 2 — Spin up research subagents upfront, in parallel

Before walking through decisions, launch research **in parallel** so the company and
technology context is in hand *before* deciding anything. The company's stack and business
model should actively shape the recommendations and the stretch features — that's why this
runs first, not last.

Launch these concurrently (one message, multiple Agent calls). Use `general-purpose` (or
`Explore` for codebase-only briefs) with `WebSearch`/`WebFetch` available:

1. **Company research → COMPANY.md.** Brief the subagent to research and return:
   - **Business model**: how the company makes money, who its customers are, what stage it's
     at (funding, scale, public/private).
   - **Tech stack**: languages, frameworks, infra, notable engineering choices — from job
     postings, engineering blogs, conference talks, GitHub, StackShare, etc. Cite sources.
   - **Founders & technical leadership**: who they are, their backgrounds, their public
     engineering opinions/values (so we know what they'll respect in a design).
   - **Brand & voice**: visual aesthetic (color, type, density, motion), and copy/voice
     tone, drawn from their actual product and marketing. Concrete enough to be a design
     contract: "what would a screen of ours look like and sound like?"
   - **Domain notes**: anything about the business domain that suggests valuable stretch
     features.
   Tell it to flag low-confidence findings rather than guess, and to cite sources so the
   user can verify before defending anything.

2. **Technology research → RESEARCH.md.** Brief the subagent to produce a novice-friendly
   backgrounder on each technology from Step 1: what it is, what problem it solves, how it
   compares to its main alternatives, the gotchas/footguns, and 1–2 authoritative links to
   learn more. The goal is that the user can *teach themselves* from this doc. Pitch it at a
   sharp beginner who will be asked to defend using these tools.

If the decision surface is large, you may also spin a subagent to research the
specific decision tradeoffs (e.g. "Postgres vs. DynamoDB for this access pattern") so your
Step 3 walkthrough rests on current, sourced reasoning rather than generic priors.

While subagents run, you can begin drafting the Step 3 walkthrough from what you already
know — but wait for company findings before finalizing recommendations, since they may
change what's defensible (e.g. "they're an all-TypeScript shop" tilts a language choice).

### Step 3 — Walk the user through decisions, one round at a time

This is the heart of the skill and what the user explicitly wants. For each round of
decisions:

1. **Teach the decision.** In plain language, explain what's being decided and why it
   matters for *this* brief. Assume a sharp novice. Avoid unexplained jargon; when you must
   use a term, define it in a clause.
2. **Lay out the real options.** 2–4 genuine alternatives, each with what it buys and what
   it costs *in this context* — not a generic pros/cons dump. Fold in the company context:
   "Acme's stack is already Postgres + Rails, so X fits their portfolio; Y would be novel
   to them and you'd have to justify the divergence."
3. **Recommend, with reasoning.** Say which you'd pick and why, including how it plays
   against a CTO. But make clear it's the user's call.
4. **Ask the user to choose.** Use the project's question-asking affordance to present the
   round's decisions as concrete choices. Put your recommended option first and mark it.
   Let the user pick, adjust, or push back. Genuinely incorporate pushback — if the user
   has a reason you didn't weigh, that may change the right answer.

Keep questions decision-relevant. Don't ask what the brief already answers or what you can
determine yourself. Move round by round so the user is never facing the whole surface at
once. Record each locked decision as you go (Step 4) rather than batching at the end.

After the core (brief-mandated) decisions, run a **stretch-features round**: using the
company/domain research, propose 2–4 features *beyond the brief* that would (a) impress this
specific CTO, (b) deepen the user's grasp of the domain and stack, and (c) fit the company's
portfolio. Explain why each is worth the effort and let the user pick which to commit to.
These become first-class entries in ARCHITECTURE.md, flagged as stretch.

### Step 4 — Write ADRs as you lock them, and ARCHITECTURE.md as the living overview

Two artifacts evolve in lockstep through the walkthrough:

#### 4a. Each accepted decision becomes its own ADR file

As soon as a decision is locked in Step 3, write `docs/adrs/ADR-NNN-<short-slug>.md`. Number
sequentially starting at 001; never re-number, never edit an accepted ADR in place. If a
later decision overturns an earlier one, write a *new* ADR that supersedes it and update
the old one's status (see below).

Use this exact structure:

```markdown
# ADR-NNN: <the decision, stated as a choice>

**Status:** Accepted · **Date:** <YYYY-MM-DD> · **Stretch:** <yes/no>
**Supersedes:** <ADR-XXX or none> · **Superseded by:** <ADR-YYY or none>

## Context
What in the brief / company / constraints forced this decision. What's true that
makes this a real choice and not a default.

## Options considered
The genuine alternatives, each with the tradeoff that matters here. Don't list
strawmen; list what a competent engineer would actually weigh.

## Decision
What was chosen.

## Rationale
Why this option wins *for this brief and this company*. This is the sentence
the user repeats to the CTO. Make it strong and specific.

## Tradeoffs & risks
What we gave up, what could go wrong, and how we'd mitigate or when we'd
revisit. Naming the cost is non-negotiable — it's the proof we actually chose.

## Consequences for the build
Anything downstream features or skills need to know because of this decision
(e.g. "all persistence code uses Drizzle; no raw SQL", "auth is session-cookie
based, not JWT"). This is what makes the ADR usable from a feature file.
```

When a decision is later changed: write a new ADR with `**Supersedes:** ADR-NNN`, and edit
the old ADR's header to `**Status:** Superseded` and `**Superseded by:** ADR-MMM`. Do not
delete or rewrite the old ADR's body — its reasoning is still the historical record.

#### 4b. ARCHITECTURE.md is the living overview, not a decision dump

```markdown
# Architecture — <Project Name>

**Status:** <draft / agreed> · **Last updated:** <date> · **Brief:** <link or summary>
**Research:** [RESEARCH.md](./RESEARCH.md) · **Company:** [COMPANY.md](./COMPANY.md) · **ADRs:** [docs/adrs/](./adrs/)

## Executive summary
A tight, standalone overview a CTO can read in one minute: what we're building
and for whom, the headline architectural approach in a sentence or two, the
2–3 most consequential decisions (with links to the ADRs that justify them),
the stretch features we're committing to, and the key risks. Write this last
(once decisions are locked) but place it first. Update it whenever a
load-bearing decision changes.

## System overview
The architecture in prose plus diagrams: the major components, how they talk,
and where data lives and moves. Include at minimum:

- A **system / component diagram** (mermaid `graph` or `flowchart`).
- A **data-flow diagram** (mermaid `sequenceDiagram` for a key request path,
  or a `flowchart` for how data moves).

Render diagrams as fenced ```mermaid blocks. Follow each diagram with a short
paragraph walking the reader through it. Add more diagrams if the system
genuinely has more than one flow worth showing; don't pad.

This section is expected to evolve as the build progresses — when a feature
introduces a new component or surface, update the diagram.

## Decision index
A table of every ADR, in order, with one-line summaries. The ADR files are the
source of truth; this index just makes them findable.

| ADR | Decision | Status | Stretch |
|-----|----------|--------|---------|
| [ADR-001](./adrs/ADR-001-<slug>.md) | <one-line summary of the choice> | Accepted | no |
| [ADR-002](./adrs/ADR-002-<slug>.md) | <one-line summary> | Accepted | yes |
| ...

Never restate an ADR's rationale or tradeoffs here — that's what the ADR file
is for. The index exists so a reader can find decisions; the ADR itself
justifies them.

## Stretch features
For each committed stretch feature: what it is, why it impresses this CTO /
fits the portfolio / teaches the domain, and which ADR(s) it depends on
(link them). Detailed decisions still live in their ADR files.

## Non-goals
What we are deliberately not doing, and why — so scope is defensible and the
roadmap stage doesn't re-litigate it.

## Open questions
Anything still unresolved that a builder or the CTO would reasonably ask about.
Resolve these by writing new ADRs as they're answered.
```

Write ADR files and update the decision index as you lock decisions, not all at the end.
Rationale you can't write strongly belongs to a decision that isn't actually made — go back
to the user.

### Step 5 — Finalize the research docs and verify defensibility

Fold the subagents' returns into `RESEARCH.md` and `COMPANY.md`, in the user's voice and at
the right altitude (novice-friendly, sourced). Make sure COMPANY.md's brand/voice section is
concrete enough to act as a design contract for the build stage.

Then verify the whole package is CTO-ready:

- **The executive summary stands alone.** A CTO reading only that section understands what's
  being built, the headline approach, the biggest bets, and the risks.
- **The system overview has real diagrams.** At minimum a component diagram and a data-flow
  diagram, in mermaid, each followed by a plain-language walkthrough. A diagram nobody can
  explain is decoration — make sure the prose earns it.
- **Every decision in the brief's scope has its own ADR file** in `docs/adrs/`. No silent
  defaults. If something was decided implicitly, surface it as its own ADR file.
- **Every ADR file is linked from ARCHITECTURE.md's decision index**, and every entry in
  the decision index points to an existing file. Broken or missing links are a defect.
- **ARCHITECTURE.md does not restate ADR rationale or tradeoffs** — those live in the ADR
  file. The overview links; it does not duplicate. (Duplication drifts.)
- **Every ADR has a real "Tradeoffs & risks" and a "Consequences for the build" section.**
  An ADR with no named cost is a red flag — it means the alternative wasn't actually
  considered. An ADR with no consequences section can't be used from a feature file.
- **Every "Rationale" is specific to this brief/company**, not a generic platitude
  ("it's scalable", "it's industry standard"). Tie it to the actual context.
- **The user can defend each decision.** If you're unsure the user understood a decision,
  return to it and re-teach before calling it done. Understanding is the success criterion.
- **RESEARCH.md covers every technology** an ADR commits to, including stretch-feature tech.
- **COMPANY.md findings are sourced** (or flagged low-confidence) so nothing the user
  repeats to the CTO is unverifiable.

Finish with a short summary: the count of decisions, the 2–3 most consequential ones in a
sentence each, the stretch features committed, and any open questions.

### Step 6 — Hand off

The natural next step is slicing this architecture into a parallelizable build plan. Tell
the user they can run **`kmaz-architecture-to-roadmap`** on the new ARCHITECTURE.md to generate a
ROADMAP.md and per-feature specs, then `kmaz-feature-builder` to implement each — and that
COMPANY.md's brand section will serve as the design/brand contract those stages expect.
Don't auto-run it; offer it as the next move.

## Notes on judgment

- **Recommend, don't dictate.** The user's ability to defend a decision depends on owning
  it. Give your best recommendation and reasoning, then let them choose. Document their
  choice, not yours.
- **Context beats convention.** "Industry standard" is not a rationale. The same decision
  can be right for one company and wrong for another. Always tie the WHY to *this* brief and
  *this* company's stack, stage, and values.
- **The tradeoff is the tell.** The fastest way to spot a decision that wasn't really made
  is an empty tradeoffs section. A CTO will probe exactly there. Always name the cost.
- **Stretch features are strategic, not decorative.** Pick ones that show domain insight and
  fit the portfolio — they're how the user demonstrates they understand the *business*, not
  just the brief.
- **Don't invent facts about the company.** Flag low-confidence research as such. A
  confidently wrong claim about the company's stack is worse than admitting uncertainty —
  the CTO will know their own stack.
