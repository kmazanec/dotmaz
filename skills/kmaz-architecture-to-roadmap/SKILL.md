---
name: kmaz-architecture-to-roadmap
description: >-
  Decompose an architecture/design document (and the PRD behind it) into an iterative,
  parallelizable roadmap a cross-functional team can ship against. Iterations are the TOP-LEVEL
  unit of the plan; features are nested inside them. Output is a ROADMAP.md (the master artifact:
  the iteration arc + DAG, cross-cutting contracts, parallelism map, critical path) plus a
  docs/iterations/NN-name/ directory per iteration containing an iteration overview and its nested
  vertical-slice feature specs. Every feature is a chunk of new user-observable functionality, sized
  so that after every merge the system is more capable and still shippable. Use whenever the user
  has an architecture/design/spec and wants it turned into buildable work — "turn this into a
  roadmap", "break this into iterations/features", "plan the build", "decompose this for a team",
  "make this parallelizable". This is the third stage of the build pipeline; its per-iteration
  output is exactly what kmaz-plan-iteration consumes. Trigger even when the user doesn't say
  "roadmap", as long as they have a design and want a delivery plan.
---

# Architecture → Iterative, Parallelizable Roadmap (iterations as the top-level unit)

## Purpose & philosophy

A good architecture document says *what the system is*. A good roadmap says *how a cross-functional
team races to ship it without serializing on each other and without landing a working product only
at the very end*.

This skill produces **ROADMAP.md — the master strategy artifact** — plus, **per iteration**, a
directory holding that iteration's overview and its nested feature specs. **The iteration is the
top-level unit of the plan; features live underneath it.** This matters because the next stage
(`kmaz-plan-iteration`) plans and builds *one iteration at a time* — so the iteration is the natural
thing you point a builder at, and features are its components, not free-floating work items.

Read by a fresh team, the roadmap must make clear:

1. **The iteration arc** — what user-observable capability ships at each milestone, in what order,
   what is deferred. Each iteration is a *shippable* state of the product; after every iteration
   merges, the system is more capable than before and still shippable.
2. **Which iterations and features parallelize and which serialize** — at three levels (below).
3. **The cross-cutting contracts** that bind parallel workstreams, where each contract's source of
   truth lives, who owns it, how change propagates.
4. **The convergence/merge points** where parallel streams meet and the rework expected at each.
5. **The critical path** — the longest *serial* chain of features (across iterations) that cannot
   be parallelized regardless of staffing. The true ship-date determiner.

The mental model: **a cross-functional engineering team racing to ship.** Workstreams run
concurrently, communicate via contracts agreed up front, and absorb real rework where streams
converge. The roadmap plans for that rework rather than pretending it doesn't exist.

## Inputs

- **ARCHITECTURE.md + docs/adrs/** — the locked design decisions and their WHY (from
  `kmaz-prd-to-architecture`). The architecture's components, locked decisions, and non-goals are
  the richest source for slicing.
- **docs/PRD.md** — the requirements and acceptance criteria behind the design. A feature's
  acceptance criteria should trace to PRD requirements; the PRD's scope bounds the roadmap's scope.
- **docs/research/** — domain/market/company grounding, including COMPANY.md's brand/voice design
  contract that the build stage will consume.
- **Existing repo state** — if pieces are partly built, the first iteration picks up from there.

## Three levels of parallelism

This skill plans for parallel work at **all three** levels. Confusing them produces bad plans.

1. **Sub-tasks inside a feature.** A vertical-slice feature may break into 2–5 sub-tasks touching
   different files/layers, implemented concurrently as sub-agent workstreams, merging in the
   feature's single PR. (`kmaz-plan-iteration` plans these; `kmaz-build-iteration` runs them.)
2. **Features inside an iteration.** Multiple vertical-slice features that share no conflicting code
   paths ship as separate PRs in the same iteration. When all the iteration's features merge, the
   iteration is shipped. **This is the level `kmaz-plan-iteration`/`kmaz-build-iteration` operate
   on — one iteration's features, built in parallel.**
3. **Iterations themselves.** Two iterations can be in-flight at once when their dependencies don't
   conflict, OR a shared dependency is already shipped, OR the shared dependency is a *locked
   contract* whose shape is frozen even if its implementation is in-flight.

What does **not** parallelize: features that directly depend on each other; iterations whose
acceptance includes another iteration's not-yet-shipped behavior. Good decomposition minimizes both.

## The vertical-slice discipline (features as the unit of progress within an iteration)

**A feature is a vertical slice through the architecture.** It adds user-observable functionality.
It is *not* a layer, a package, a schema, or standalone infrastructure. Each feature, when merged,
leaves the system more capable than before.

The discipline test for every feature: **state in one sentence what a user (or the next feature, or
a smoke test) can do now that they could not before.** If you can't, the feature is mis-scoped —
probably a horizontal layer in disguise.

Anti-features (do **not** write these as features): "Build `packages/contract`" (layer), "Set up
Postgres migrations" (infra), "Define the `Action` schema" (contract). Those are real work, but they
live **inside** the feature that first needs them. The first feature needing a schema introduces a
minimum-viable version; later features extend it. **Contracts are never their own features.**

### The Walking Skeleton is just the first vertical slice

The first feature of the first iteration *is* the first vertical slice. It's thin (nothing exists
yet) but still adds user-observable behavior, even if trivial. It owns the minimum infra, schema,
deploy pipeline, and UI — all of it, as one feature. It is not a "setup task" before the real
features start. Future features extend each facet without redoing it.

### Infra-only or backend-only features are allowed, with a high bar

A feature must add **observable** behavior — something the next feature or a real caller (a smoke
test against a live URL, a health check, a CLI invocation) can observe. The bar: (a) observable from
outside its own code, and (b) the thinnest possible cut, not a "build all the infra" bundle.

## Cross-cutting contracts

Things that span features and must stay consistent — a typed message schema, a shared validator, a
design contract, a telemetry shape, an accessibility standard — are **contracts, not features**. The
roadmap names them, locates each one's source of truth, identifies the introducing feature and the
consuming/extending features, and predicts where parallel streams reconcile.

For each contract: name + one-line description; source-of-truth file; **introducing feature**;
**consuming features**; **change protocol** (how a feature propagates a change). When two parallel
features modify the same contract, name it a **convergence point**: where rework happens, who
absorbs it, what test covers the merged behavior.

A multi-feature roadmap with zero cross-cutting contracts is a planning error — the features have
implicit contracts and parallel work will diverge. These contracts are exactly what
`kmaz-plan-iteration` freezes before fan-out, so name them precisely.

## Output layout (iterations top-level, features nested)

```
docs/
  ROADMAP.md                       # the master artifact
  iterations/
    01-<iteration-slug>/
      README.md                    # iteration overview (goal, feature list, contracts, DAG, parallelism)
      01-<feature-slug>.md         # nested feature spec
      02-<feature-slug>.md
      ...
    02-<iteration-slug>/
      README.md
      01-<feature-slug>.md
      ...
```

- Iteration directories are numbered `NN-<slug>` in arc order.
- Feature specs are numbered `NN-<slug>.md` **within** their iteration directory.
- Feature IDs stay globally unique and stable (e.g. `F-03`) — the directory gives hierarchy, the ID
  gives identity. `kmaz-plan-iteration` is pointed at one `docs/iterations/NN-<slug>/` directory and
  plans every feature spec inside it.

## Workflow

### Step 1 — Read the architecture, PRD, research, and existing state

Read ARCHITECTURE.md and its ADRs in full; follow their links. Read the PRD for the requirements and
acceptance criteria the features must satisfy, and the research for domain/brand grounding. Scan the
repo so the plan reflects reality, not greenfield.

### Step 2 — Decompose into vertical-slice features

Form a candidate feature list. **Each must pass the one-sentence test.** Trace each feature's
acceptance criteria to PRD requirements. For a 4–6 week project expect **10–20 features**, not 40.

Heuristics: the first feature is the thinnest end-to-end slice (owns the minimum infra/schema/deploy/
UI — resist splitting into prerequisite setup features); each later feature extends one axis;
"stand up a package" / "define a schema" features fold into the feature that first needs them; polish
(a11y audit, observability, design refinement) is usually its own feature near an iteration's end.
**Bias toward fewer, fatter, more vertical features** — coordination cost is real.

### Step 3 — Identify cross-cutting contracts

Walk the candidate list. For each pair of features sharing state, types, schemas, or visual
conventions, name the contract that binds them: source-of-truth file, introducing feature,
consuming/extending features, change protocol. This becomes the ROADMAP contracts table and feeds
`kmaz-plan-iteration`'s contract-freezing step directly.

### Step 4 — Group features into iterations; build the iteration DAG

An **iteration** is a shippable milestone with a one-sentence goal: *"After this iteration, a user
can do X."* Group features so: each iteration's goal is achievable by completing its features; its
features parallelize where they don't conflict; iterations form a DAG (a genuine cross-iteration
feature dependency is a hard ordering, else iterations may run concurrently).

For a typical 4–6 week project expect **3–6 iterations**, 2–5 features each, with 1–3 iterations in
flight at peak. The iteration DAG is **the central artifact** of ROADMAP.md.

### Step 5 — Map parallelism at all three levels

Per iteration: which other iterations run concurrently, against which contracts, with what
convergence rework; which features run as concurrent PRs vs. serialize, and where they converge;
and per feature, 1–5 sub-tasks marked `[parallel]` or `[serial after X]`. The output is the
**parallelism map** — a per-iteration DAG plus the global iteration DAG.

### Step 6 — Identify the critical path

The critical path is the **longest serial chain of features** across the whole roadmap that genuinely
cannot be parallelized regardless of staffing — the residue after all contract-locking
parallelizations are exploited, *not* the longest dependency chain. State it as a one-line feature
sequence; call out where bottleneck risk concentrates (usually the convergence points).

### Step 7 — Surface ambiguities to the user; get answers

Before writing files, surface genuine ambiguities the architecture/PRD don't pin down (decision-
relevant only). Common areas: whether two capabilities are one feature or two; whether infra folds
into a vertical slice or warrants an infra-only feature; sequencing intent if a demo/deadline is
implied; which iterations the user wants concurrent vs. serial; the shape of the highest-risk
unknowns (early iterations should de-risk those).

### Step 8 — Write `docs/ROADMAP.md`

```markdown
# Roadmap — <Project Name>

**Status:** <draft/agreed> · **Date:** <date>
**Source:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [PRD.md](./PRD.md) · [research/](./research/)

## Overview
2–4 sentences: what we're building, the iteration arc in one line, team-shape assumptions, ship target.

## The iteration arc
The ordered (or DAG-ordered) iterations. For each:
- **Iteration N: <name>** — what the user can do after this iteration they could not before (one sentence).
- Link to its directory: [docs/iterations/NN-<slug>/](./iterations/NN-<slug>/).
- Whether it can run concurrently with any other iteration.
This is the executive summary — a reader of only this section understands the shipping arc.

## Iteration DAG
A mermaid graph: iterations as nodes, dependencies as edges. Mark hard dependencies (must serialize)
vs. soft (contract-mediated; can parallelize against a locked contract).

## Features index
| ID | Feature | Iteration | Spec | "Before → After" (one line) | Depends on | Unblocks | Parallel with |
|----|---------|-----------|------|------------------------------|-----------|----------|---------------|
(Spec column links the nested path, e.g. `iterations/01-skeleton/02-foo.md`.)

## Cross-cutting contracts
| Contract | Source of truth | Introduced by | Extended by | Change protocol | Convergence risks |
|----------|-----------------|---------------|-------------|-----------------|---------------------|
Mark convergence points (two parallel features both modifying a contract) with ⚠ + the expected rework.

## Parallelism map (per iteration)
For each iteration: a small feature DAG + a paragraph naming which features run concurrently, where
convergence happens within the iteration, and the expected rework + who absorbs it.

## Critical path
One sentence: the longest serial chain of features. A short paragraph on where rework risk concentrates.

## Cross-iteration concurrency
Which iterations can be in flight together, against which contracts, and the expected merge load when
they converge.

## Risk-weighted ordering
The biggest unknowns and which iteration de-risks each. Surprises late cost more than surprises early.

## Non-goals and deferred work
What we're deliberately not building / deferring (mirror the PRD's Out-of-Scope + Deferred).

## Open questions
Unresolved things that affect the plan but not the architecture.
```

### Step 9 — Write each iteration directory: an overview + nested feature specs

For each iteration, create `docs/iterations/NN-<slug>/`.

**9a. The iteration overview** `docs/iterations/NN-<slug>/README.md`:

```markdown
# Iteration NN: <Name>

**Goal:** <one sentence — what a user can do after this iteration that they could not before>
**Status:** Not started · **Roadmap:** [../../ROADMAP.md](../../ROADMAP.md)

## Features in this iteration
| ID | Feature | Spec | One-line before → after | Parallel with | Depends on |
|----|---------|------|--------------------------|---------------|-----------|
(Spec links the sibling file, e.g. `01-foo.md`.)

## Shared contracts this iteration touches
The cross-cutting contracts introduced/extended here, each with its source of truth and which
features introduce vs. extend it. (This is what kmaz-plan-iteration freezes before fan-out.)

## Parallelism within the iteration
Which features fan out concurrently, which serialize behind a hard dep, and where they converge +
the expected rework.

## Concurrency with other iterations
Which other iterations can be in flight at the same time, against which locked contracts.

## Definition of done for the iteration
The iteration ships when all its feature specs are done AND <the iteration goal> is observably true.
```

**9b. One feature spec per feature**, `docs/iterations/NN-<slug>/MM-<feature-slug>.md`:

```markdown
# Feature: <Name>

**ID:** <F-NN> · **Iteration:** <NN-slug> · **Status:** Not started

## What this delivers (before → after)
**Before:** [one sentence — what the user/system cannot do today]
**After:** [one sentence — what the user/system can do once this ships]
This framing is the discipline check. If you can't fill it with a real user-observable difference,
the feature is mis-scoped.

## How it fits the roadmap
Its iteration. On the critical path or off. Which features it may run concurrently with. The
convergence point if any.

## Requirements traced (from the PRD)
Which PRD requirement(s)/acceptance-criteria numbers this feature satisfies. (Keeps WHAT → build honest.)

## Dependencies (must exist before this starts)
- <F-XX Feature> — what specifically is needed (a contract, shipped behavior, a deployed surface).
- External: <accounts/services to provision first>.
(If none: "None — can start immediately.")

## Unblocks (what waits on this)
- <F-YY Feature> — what they consume from this.

## Contracts touched
- <Contract name> (source of truth: <doc/file>) — what this introduces/consumes/extends. Flag
  explicitly if a parallel feature also extends it — name the feature and the expected rework.

## Sub-tasks
1–5 sub-tasks. For each: a one-line description; a `[parallel]` or `[serial after X]` annotation;
the convergence note (how they merge into the feature's single PR).
(For very small features: "Sub-tasks: none — single workstream.")

## Acceptance criteria (product behavior)
Verifiable outcomes defining "done" in terms of what a user/caller can observe — not unit-test
outcomes. Cover the happy path, the architecture's named edge cases, and any cross-cutting contract
this feature must conform to. A reviewer who never saw the build should be able to check each against
the running system.

## Testing requirements
Required automated testing: kinds (unit/integration/contract/e2e), what they must cover (the
architecture's named risks + the acceptance criteria), and any tests that must run on the target
environment (real device, deployed URL). Specify coverage of behavior, not specific test code.

## Manual setup required
Anything a human must do an agent cannot: keys/secrets, external provisioning, paid accounts,
on-device testing, asset generation needing human review. (If none: "None.")

## Convergence and expected rework
If this ships concurrently with features touching the same contract/code path, name them and the
expected rework, who absorbs it, what test catches the merge bug. (If purely serial / no
convergence: "None expected.")

## Implementation notes (filled in by the building agent)
> Owned by the builder, not the planner. Starts empty. The agent records implementation decisions
> and rationale here as it builds; kmaz-plan-iteration appends the approved build plan here, and
> kmaz-build-iteration ticks its checkboxes. Cross-cutting discoveries that affect other features
> must also propagate to ROADMAP.md / the architecture, not just live here.
```

Leave "Implementation notes" genuinely empty — it is the build stages' space.

### Step 10 — Verify the plan is coherent

Each check exists because skipping it has historically produced a bad plan:

- **Vertical-slice discipline:** every feature's *After* sentence is a real observable change, not
  "a package exists" / "a schema is defined".
- **Requirement traceability:** every feature traces to PRD requirement(s); no PRD requirement in
  scope is left uncovered by some feature.
- **Sub-task parallelism is marked, not assumed.**
- **Iteration shippability:** each iteration's features, when merged, leave the system more capable
  *and still shippable*. If iteration N needs iteration M half-done, they're mis-grouped.
- **Cross-cutting contracts documented in one place** with named introducer + consumers; convergence
  points explicit.
- **The iteration DAG is a DAG** (no cycles; mutual-dependence means a shared contract should be
  extracted earlier).
- **Iteration concurrency is named** — for every concurrent pair, the locked contracts that make it
  safe and the expected merge rework.
- **The critical path is realistic** (the serial residue, not the longest chain).
- **No "build the infrastructure" features** — infra folds into the first slice that needs it,
  except infra-only features with a smoke-testable observable surface.
- **Acceptance criteria are product behavior**, not unit acceptance.
- **Risk-weighted ordering is honest** — the biggest unknowns de-risked early.
- **Layout is correct:** every iteration is a `docs/iterations/NN-<slug>/` dir with a README and its
  nested feature specs; every ROADMAP/README link resolves; feature IDs are globally unique.

Then summarize for the user: number of iterations + features, the critical path in one sentence,
what can start in parallel immediately, which iterations are designed to run concurrently, open
decisions. Point them at the next stage: run **`kmaz-plan-iteration`** on the first iteration's
directory (`docs/iterations/01-<slug>/`) to plan its features for parallel build, then
`kmaz-build-iteration` to build them.

## Notes on judgment

- **Favor fewer, fatter features.** An iteration of 3 fat features usually ships faster than 8 thin
  ones — 8 generate more convergence rework than they save on parallel staffing.
- **Cross-cutting contracts are first-class.** They're how parallel work coordinates; locking a
  contract early lets parallel features build against a stable shape. Name them precisely — the next
  stage freezes them.
- **Rework at convergence is expected, not a failure.** Plan it, name it, allocate ownership. The
  failure mode is *surprise* rework from an unnamed contract.
- **Iteration concurrency is the highest-leverage parallelism** — it's what lets a small team ship
  like a big one. Design for it deliberately.
- **The critical path determines the ship date; everything else determines team size.**
- **The first feature is always the thinnest possible vertical slice through every layer.** Setup
  belongs inside it; no separate "scaffolding" features.
- **Never invent architecture.** If the design is silent on something that blocks decomposition,
  surface it as a Step-7 question, not a buried assumption.
- **The roadmap is a living artifact.** Iteration N+1's detailed plan is reconsidered in light of
  what iteration N discovered; update the roadmap as the project learns.
