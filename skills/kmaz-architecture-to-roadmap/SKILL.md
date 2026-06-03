---
name: kmaz-architecture-to-roadmap
description: >-
  Decompose an architecture/design document and its PRD into an iterative, shippable roadmap. Produces
  ROADMAP.md plus docs/iterations/NN-name/ plans with iteration overviews and nested vertical-slice
  feature specs. Use when the user has an architecture, design, or spec and wants buildable work:
  roadmap, iterations, feature breakdown, delivery plan, or team implementation plan. This is the third
  kmaz pipeline stage after PRD and architecture; its iteration output feeds kmaz-plan-iteration.
---

# Architecture → Iterative Roadmap (iterations as the top-level unit)

> **Pipeline conventions — READ FIRST:** before doing anything, read
> [`../kmaz-pipeline/CONVENTIONS.md`](../kmaz-pipeline/CONVENTIONS.md) in full — it holds the shared
> rules (dependency-only concurrency, contract discipline, the compound loop, model tiering, the
> artifact map). If you dispatch any sub-agent, copy in only the rules relevant to its task. This
> skill declares the dependency graph + the contracts index the plan/build stages schedule and freeze
> against.

## Purpose & philosophy

A good architecture document says *what the system is*. A good roadmap says *how to ship it
incrementally — never landing a working product only at the very end, and never blocking work on a
dependency that didn't have to exist yet*.

This skill produces **ROADMAP.md — the master strategy artifact** — plus, **per iteration**, a
directory holding that iteration's overview and its nested feature specs. **The iteration is the
top-level unit of the plan; features live underneath it.** This matters because the next stage
(`kmaz-plan-iteration`) plans and builds *one iteration at a time* — so the iteration is the natural
thing you point a builder at, and features are its components, not free-floating work items.

**You declare dependencies; the downstream derives concurrency.** This skill does NOT model
parallelism — no parallelism map, no critical path, no convergence-point bookkeeping. Its job is to
state, per feature, what it *hard-depends on* (consumes another feature's not-yet-shipped behavior)
and which *contracts* bind features together. `kmaz-plan-iteration` and `kmaz-build-iteration`
schedule every bit of concurrency straight off that dependency graph: anything with no hard dep runs
concurrently, anything with one waits — for free, no lanes to plan. Spend your effort on the right
decomposition and honest dependency edges, not on predicting how much it parallelizes.

Read by a fresh team, the roadmap must make clear:

1. **The iteration arc** — what user-observable capability ships at each milestone, in what order,
   what is deferred. Each iteration is a *shippable* state of the product; after every iteration
   merges, the system is more capable than before and still shippable.
2. **The hard-dependency edges** — per feature, which other features it consumes shipped behavior
   from. This is the *only* ordering signal the build stages use; keep it minimal and real.
3. **The cross-cutting contracts** that bind features — each one *indexed to the ADR that decided
   it* (the architecture is the source of truth), with its introducing feature and extending
   features. These are exactly what `kmaz-plan-iteration` freezes before the build.

## Inputs

- **ARCHITECTURE.md + docs/adrs/** — the locked design decisions and their WHY (from
  `kmaz-prd-to-architecture`). The architecture's components, locked decisions, and non-goals are
  the richest source for slicing.
- **docs/PRD.md** — the requirements and acceptance criteria behind the design. A feature's
  acceptance criteria should trace to PRD requirements; the PRD's scope bounds the roadmap's scope.
- **docs/research/** — domain/market/company grounding, including COMPANY.md's brand/voice design
  contract that the build stage will consume.
- **Existing repo state** — if pieces are partly built, the first iteration picks up from there.

## Dependencies, not lanes

You declare the dependency graph; the build derives all concurrency from it (CONVENTIONS.md,
"Concurrency"). You do NOT sort work into parallel-vs-serial lanes, compute a critical path, or model
convergence rework. Your leverage is getting the **hard-dependency edges** right — a hard dep is when
feature B consumes feature A's *not-yet-shipped behavior* (forces order); a contract-mediated soft
dep is NOT one (B builds against the frozen contract, so leave it out — recording it needlessly
serializes the build).

Good decomposition **minimizes hard dependencies** so the build runs more concurrently — but a
genuinely linear chain is fine; declare it honestly and let it serialize. Don't contort the slicing
to manufacture concurrency that isn't there.

**Across iterations — make independent iterations buildable as ONE batch.** Call out which iterations
are independent (no cross-iteration hard dep). But go further than "they *can* build concurrently":
the build stage runs ONE shared-contract barrier per build invocation, then fans every feature out in
parallel. So building independent iterations *together, in one invocation* is strictly cheaper than
building them separately-but-concurrently — one barrier instead of N, and ALL their features fan out
at once instead of each iteration's features only fanning out within their own build. Concretely: if
iterations 02 and 03 are mutually independent and each hard-depends only on already-shipped work, say
so explicitly **and recommend they be planned/built as a single batch** — the wall-clock is then
`one barrier + the slowest single feature`, not `(barrier + iteration-02) then (barrier + iteration-03)`.

This is why **an iteration boundary is a PRODUCT/SHIPPING unit, not a build-batching unit.** Carve
iterations by "what coherent capability ships together / what the human wants to review as a unit" —
but where that product boundary splits a set of *mutually independent, already-unblocked* features
across iterations, flag that the **build** can collapse them into one batch even though the
**roadmap** keeps them as separate themed milestones. The biggest single speedup for a large product
is paying the contract barrier once over the widest independent feature set, not once per theme.

A common failure to avoid: slicing iterations purely by priority tier (P0 / P1 / P2) when the P1 and
P2 work is mutually independent and both only build on shipped P0. That theme split forces two
barriers and serializes two builds that could have been one parallel batch. Keep the tiers as the
*narrative*, but mark the independent set as one build batch.

**Making the batch ACTIONABLE with today's plan/build workflows.** The plan and build stages each
consume ONE iteration directory (one `BUILD-PLAN-<slug>.md`), so "build these two iterations as one
batch" only runs if they ARE one iteration dir. So when a set of features is mutually independent and
unblocked, prefer to put them in **one iteration directory** to begin with — that dir IS the build
batch — and express the product-theme distinction as *grouping within* it (the feature specs and the
roadmap narrative can still label which are P1 vs P2). Reserve a *separate* iteration dir for work
that genuinely must ship/serialize after another iteration (a real cross-iteration hard dep). In
short: **let the dependency graph decide the iteration DIRECTORIES, and let the product theme decide
how you narrate and group the features inside them** — don't split an independent feature set into
separate directories just because the features belong to different product tiers, because the
directory split is what forces the extra barrier and the lost fan-out.

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
design contract, a telemetry shape, an accessibility standard — are **contracts, not features**.

**The architecture already decided these; you index them, you don't redefine them.** Most
cross-cutting contracts trace to an ADR (the architecture stage's "Consequences for the build"
sections are exactly this — "all persistence uses Drizzle", "auth is session-cookie", "actions are a
tagged union"). For each contract, **cite the ADR that is its source of truth** rather than
re-describing the decision; then add only what the architecture doesn't already say: the
**introducing feature** (which feature lands its minimum-viable form) and the **extending features**
(which features add to it). If a contract has *no* ADR behind it, that's a signal — either it's a
real architectural decision the architecture missed (surface it; it may warrant an ADR) or it's an
incidental shared shape that just needs naming here.

A multi-feature roadmap with zero cross-cutting contracts is a planning error — the features have
implicit contracts and concurrent work will diverge. These contracts are exactly what
`kmaz-plan-iteration` freezes (with concrete signatures) before the build, and it freezes them
*consistent with the cited ADRs* — so name each one precisely and point it at its ADR.

## Output layout (iterations top-level, features nested)

```
docs/
  ROADMAP.md                       # the master artifact (iteration arc, deps, contracts table)
  iterations/
    01-<iteration-slug>/
      01-<feature-slug>.md         # nested feature spec
      02-<feature-slug>.md
      ...
    02-<iteration-slug>/
      01-<feature-slug>.md
      ...
```

There is **no per-iteration README**. The iteration's goal, feature list, contracts, and dependency
edges live in ROADMAP.md (the iteration arc + the features index + the contracts table), and the
plan stage's `BUILD-PLAN-<slug>.md` becomes the per-iteration orchestration index. A separate
iteration README only duplicated those — the directory just holds the feature specs.

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

### Step 3 — Identify cross-cutting contracts (index to ADRs)

Start from the architecture: ARCHITECTURE.md's decision index flags contract-bearing ADRs in its
**Contract** column, and each such ADR's "Consequences for the build" names the contract's shape +
exhaustive consumers. Those ADRs ARE your contracts — index them. Then walk the candidate feature
list for any shared shape that has no ADR yet (a pair of features sharing state, types, schemas, or
visual conventions with nothing in the architecture behind it): name it, and flag it as a possible
architecture gap (it may warrant an ADR).

For each contract, **cite the ADR that decided it** (source of truth), plus the introducing feature
and the extending features. Don't re-derive the decision from the specs — the architecture already
made it; you're building the index the planner freezes against. This becomes the ROADMAP contracts
table and feeds `kmaz-plan-iteration`'s contract-freezing step directly.

### Step 4 — Group features into iterations

An **iteration** is a shippable milestone with a one-sentence goal: *"After this iteration, a user
can do X."* Group features so each iteration's goal is achievable by completing its features, and so
each iteration leaves the system more capable *and still shippable*. A genuine cross-iteration hard
dependency (one iteration consumes another's not-yet-shipped behavior) forces ordering; otherwise the
ordering is just the arc you choose.

For a typical 4–6 week project expect **3–6 iterations**, 2–5 features each.

### Step 5 — Record the hard-dependency edges

Per feature, record `dependsOn`: the feature ids whose *not-yet-shipped behavior* it consumes (see
"Dependencies, not lanes"). This is the only ordering signal the build stages use, so keep it minimal
and honest — omit contract-mediated soft deps (they build against the frozen contract). Do NOT model
which features run "in parallel", a critical path, or convergence rework: the build derives all of
that from these edges. You're declaring the graph, not scheduling it.

### Step 6 — Surface ambiguities to the user; get answers

Before writing files, surface genuine ambiguities the architecture/PRD don't pin down (decision-
relevant only). Common areas: whether two capabilities are one feature or two; whether infra folds
into a vertical slice or warrants an infra-only feature; sequencing intent if a demo/deadline is
implied; the shape of the highest-risk unknowns (early iterations should de-risk those). Keep these
about *what to build and in what order* — not about how much parallelizes, which is the build's call.

### Step 8 — Write `docs/ROADMAP.md`

```markdown
# Roadmap — <Project Name>

**Status:** <draft/agreed> · **Date:** <date>
**Source:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [PRD.md](./PRD.md) · [research/](./research/)

## Overview
2–4 sentences: what we're building, the iteration arc in one line, team-shape assumptions, ship target.

## The iteration arc
The ordered iterations. For each:
- **Iteration N: <name>** — what the user can do after this iteration they could not before (one sentence).
- Link to its directory: [docs/iterations/NN-<slug>/](./iterations/NN-<slug>/).
This is the executive summary — a reader of only this section understands the shipping arc.

## Features index
| ID | Feature | Iteration | Spec | "Before → After" (one line) | Depends on (hard) |
|----|---------|-----------|------|------------------------------|--------------------|
(Spec column links the nested path, e.g. `iterations/01-skeleton/02-foo.md`. "Depends on" lists ONLY
hard deps — features whose not-yet-shipped behavior this one consumes; blank = nothing, builds as
soon as contracts are frozen.)

## Cross-cutting contracts
| Contract | Source of truth (ADR) | Introduced by | Extended by |
|----------|------------------------|---------------|-------------|
Cite the ADR that decided each contract as its source of truth; don't restate the decision. These are
what `kmaz-plan-iteration` freezes with concrete signatures before the build.

## Risk-weighted ordering
The biggest unknowns and which iteration de-risks each. Surprises late cost more than surprises early.

## Non-goals and deferred work
What we're deliberately not building / deferring (mirror the PRD's Out-of-Scope + Deferred).

## Open questions
Unresolved things that affect the plan but not the architecture.
```

### Step 8b — Seed `docs/STATUS.md` (the rolling re-entry point)

Write a short `docs/STATUS.md` — the single doc someone reads to know where the project stands
without opening five files (CONVENTIONS.md, "rolling re-entry point"). The build stage keeps it
current at each convergence; you seed it with everything "not started":

```markdown
# Status — <Project Name>

**Updated:** <date> · **Roadmap:** [ROADMAP.md](./ROADMAP.md)

## Now
<one line: nothing built yet — next up is iteration 01.>

## Iterations
| # | Iteration | Status | Build batch | Notes |
|---|-----------|--------|-------------|-------|
| 01 | <name> | Not started | A | |
| 02 | <name> | Not started | B | (independent of 01 & 03 — build with 03 as one batch) |
| 03 | <name> | Not started | B | (independent of 01 & 02 — build with 02 as one batch) |
...

## What's next
The immediate next action (e.g. "run kmaz-plan-iteration on docs/iterations/01-<slug>/"). When the
next actionable work is a batch of mutually-independent iterations, say so: "iterations 02 and 03 are
independent and only build on shipped 01 — plan/build them as ONE batch (one contract barrier, all
features fan out)."
```

Keep it terse — it's a status, not a second roadmap. The **Build batch** column groups iterations
that are mutually independent and unblocked into one buildable set (same letter = build together):
the re-entry reader sees not just "these can run concurrently" but "these should be built as one
batch" — one contract barrier over the widest independent set, maximum feature fan-out.

### Step 9 — Write each iteration's feature specs

For each iteration, create `docs/iterations/NN-<slug>/` and write its feature specs into it. The
directory holds ONLY the feature specs — no README; the iteration's goal, feature list, contracts,
and dependency edges already live in ROADMAP.md (and the plan stage builds `BUILD-PLAN-<slug>.md` as
the per-iteration index). Each feature's own hard deps and contracts touched live in its spec below.

**One feature spec per feature**, `docs/iterations/NN-<slug>/MM-<feature-slug>.md`:

```markdown
# Feature: <Name>

**ID:** <F-NN> · **Iteration:** <NN-slug> · **Status:** Not started

## What this delivers (before → after)
**Before:** [one sentence — what the user/system cannot do today]
**After:** [one sentence — what the user/system can do once this ships]
This framing is the discipline check. If you can't fill it with a real user-observable difference,
the feature is mis-scoped.

## How it fits the roadmap
Its iteration, and its hard dependencies (the features whose shipped behavior it consumes) — or
"none, builds as soon as contracts are frozen".

## Requirements traced (from the PRD)
Which PRD requirement(s)/acceptance-criteria numbers this feature satisfies. (Keeps WHAT → build honest.)

## Dependencies (must exist before this starts)
- <F-XX Feature> — a HARD dep: what shipped behavior of it this consumes. (A contract-mediated
  shared shape is NOT a hard dep — list it under "Contracts touched" instead, it builds against the
  frozen contract.)
- External: <accounts/services to provision first>.
(If none: "None — can start as soon as the iteration's contracts are frozen.")

## Unblocks (what waits on this)
- <F-YY Feature> — what they consume from this.

## Contracts touched
- <Contract name> (source of truth: <ADR-NNN>) — what this introduces/consumes/extends. If another
  feature also extends it, name the feature (the planner reconciles both extensions when it freezes
  the contract).

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

## Implementation notes (filled in by the building agent)
> Owned by the builder, not the planner. Starts empty. The agent records implementation decisions
> and rationale here as it builds; kmaz-plan-iteration appends the approved build plan here, and
> kmaz-build-iteration ticks its checkboxes. Cross-cutting discoveries that affect other features
> must also propagate to ROADMAP.md / the architecture, not just live here.
```

Leave "Implementation notes" genuinely empty — it is the build stages' space.

### Step 9 — Verify the plan is coherent

Each check exists because skipping it has historically produced a bad plan:

- **Vertical-slice discipline:** every feature's *After* sentence is a real observable change, not
  "a package exists" / "a schema is defined".
- **Requirement traceability:** every feature traces to PRD requirement(s); no PRD requirement in
  scope is left uncovered by some feature.
- **Hard deps are real and minimal:** every `dependsOn` edge is a genuine consume-unshipped-behavior
  dependency, not a contract-mediated soft dep dressed up as one. A spurious edge needlessly
  serializes the build.
- **The dependency graph is acyclic** (no cycles; mutual dependence between two features means a
  shared contract should be extracted so both build against it instead).
- **Iteration shippability:** each iteration's features, when merged, leave the system more capable
  *and still shippable*. If iteration N needs iteration M half-done, they're mis-grouped.
- **Cross-cutting contracts each cite an ADR** (or are flagged as a gap the architecture missed),
  with named introducer + extenders.
- **No "build the infrastructure" features** — infra folds into the first slice that needs it,
  except infra-only features with a smoke-testable observable surface.
- **Acceptance criteria are product behavior**, not unit acceptance.
- **Risk-weighted ordering is honest** — the biggest unknowns de-risked early.
- **Layout is correct:** every iteration is a `docs/iterations/NN-<slug>/` dir holding its nested
  feature specs (no README); every ROADMAP link resolves; feature IDs are globally unique.

Then summarize for the user: number of iterations + features, the longest hard-dependency chain in
one sentence (the genuinely-serial spine), open decisions. Point them at the next stage (see "Handing
off").

### Step 10 — Hand off (and optionally plan the first iteration inline)

The next stage plans one iteration's features for build. Tell the user they can run
**`kmaz-plan-iteration`** pointed at the first iteration directory
(`docs/iterations/01-<slug>/`), then `kmaz-build-iteration` once they approve the plan.

**Offer to run the first plan inline.** Planning the first iteration is the natural continuation of
this session and needs no new human input until its approval gate — so offer to kick it off now
rather than making the user run a separate command. If they accept and your harness exposes the
`workflow()` hook, invoke the saved **`kmaz-plan-iteration`** workflow with the first iteration's
directory; it produces the reviewable BUILD-PLAN for that iteration and STOPS at the approval gate
(it writes the plan with Status "Awaiting approval" and does not build). You then present that plan
for approval exactly as the plan stage prescribes — the human's review gate is preserved; only the
extra command invocation is removed. If the hook isn't available, just tell them the exact command to
run. Do NOT chain past the approval gate, and do NOT auto-run the build — those stay user-triggered.

**Name the build batches.** Per CONVENTIONS.md, paying the contract barrier once over the widest
independent feature set is the biggest speedup for a large product, but the human has to drive it. In
the handoff, explicitly call out which iterations are INDEPENDENT (no cross-iteration hard dep between
them) and recommend they be planned/built as ONE BATCH, not just "concurrently" — e.g. "iterations 2
and 3 don't depend on each other and only build on shipped iteration 1; build them as one batch so the
contract barrier runs once and all their features fan out in parallel, rather than two separate builds
each paying their own barrier." Building independent iterations together is strictly cheaper than
building them separately-but-concurrently. Don't make the user infer this from the dependency graph —
hand them the batch grouping.

## Notes on judgment

- **Favor fewer, fatter features.** An iteration of 3 fat features usually ships faster than 8 thin
  ones — coordination and integration cost is real.
- **Cross-cutting contracts are first-class, and they're decided in ADRs.** Index them here pointing
  at their ADR; the planner freezes them with signatures so features build against a stable shape.
  Name them precisely — an unnamed shared shape is how concurrent work diverges.
- **Declare dependencies; don't schedule parallelism.** The build derives all concurrency from the
  dependency graph. Your leverage is honest, minimal hard-dep edges + early-frozen contracts — not
  predicting how much runs at once.
- **The first feature is always the thinnest possible vertical slice through every layer.** Setup
  belongs inside it; no separate "scaffolding" features.
- **Never invent architecture.** If the design is silent on something that blocks decomposition,
  surface it as a Step-6 question, not a buried assumption.
- **The roadmap is a living artifact, and the build feeds it back.** `kmaz-build-iteration` amends
  each feature's outcome into its spec and propagates durable lessons to ROADMAP/ADRs; reconsider
  iteration N+1's grouping in light of what iteration N discovered.
