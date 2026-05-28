---
name: kmaz-feature-builder
description: >-
  Implement a single feature/component end-to-end from a feature spec file (the kind
  produced by the kmaz-architecture-to-roadmap skill, e.g. docs/features/NN-name.md): set up an
  isolated git worktree+branch, study the spec and architecture/brand/roadmap context,
  plan with the user, build test-first to a checklist, run an adversarial robustness/
  security review, and open a rebased PR documenting decisions and manual-review hotspots.
  Use this skill whenever the user wants to build/implement/pick up a feature, ticket, or
  roadmap item from a spec file — e.g. "implement the next feature", "pick up that feature
  spec", "build this deliverable", "start on <feature name>", or referencing a feature/
  ticket id or a spec file under a features/ directory. Also handles building several
  independent features from one iteration in parallel ("build iteration 1", "do F-02, F-03,
  F-04 in parallel") via its parallel-features orchestration mode. Runs an Opus coordinator
  that dispatches simpler, well-specified build work to Sonnet subagents and keeps
  coordination, integration, and complex/contract-touching work on Opus. Trigger even if
  they don't name this skill, as long as there is a feature/spec file to implement.
---

# Feature Builder

The companion to `kmaz-architecture-to-roadmap`: that skill *plans* (slices a design into
feature specs); this one *executes* one spec to completion — isolated, planned with the
user, built test-first, adversarially reviewed, smoke-tested, and delivered as a rebased PR
that explains itself.

The **feature file is the living source of truth**: the plan, the progress checkboxes, and
the decisions all live in it and stay current, so anyone (including a future agent) can see
where things stand from the file alone.

Two entry modes:
- **Single-feature (default)** — build one feature through Steps 1–10 below.
- **Parallel-features orchestration** — when asked to build *several* independent features
  from an iteration at once ("build iteration 1"), you coordinate concurrent workstreams.
  See [the orchestration section](#parallel-features-orchestration-mode); it wraps, not
  replaces, the workflow below.

## Model tiering — Opus coordinates, Sonnet executes the simple parts

One principle governs every delegation decision in this skill: **Opus owns anything hard to
reverse or spanning files/contracts; Sonnet does well-specified, isolated, mechanical work
under Opus's direction.** This applies to build sub-tasks (Step 5), review passes (Step 6),
and whole feature workstreams (orchestration mode) alike — the rest of the skill just refers
back here.

**The coordinator is always Opus** — never delegate planning, integration, conflict
resolution, review triage, the final "is this done" call, or cross-feature convergence.

**Tier ≠ typist.** The model tier picks *which model* builds a unit — never that the
coordinator types it inline. Even non-parallelizable, contract-touching, Opus-tier work is
dispatched to an **Opus subagent**. Do: decompose, dispatch, verify, integrate, resolve
conflicts, triage reviews, keep the feature-file checklists. Don't: write implementation or
test code in the coordinator thread. Writing code yourself = misread skill.

**Route a unit of work to Sonnet** when it is *isolated* (one file / small bounded set, no
contract change), *well-specified* (acceptance criteria pin the behavior), and *mechanical*
(boilerplate, a CRUD endpoint, a component matching an established pattern, a test suite for
a known contract, a data-seed file).

**Keep it on Opus** when it is *contract-touching* (introduces/extends a shared
type/schema/API/statechart/brand rule), *novel or subtle* (non-obvious algorithm, security
boundary, concurrency, the load-bearing logic), or *cross-file integration*. A spec's
`[parallel]` annotation makes a sub-task a Sonnet *candidate*, not an automatic one — a
`[parallel]` sub-task that is also contract-touching stays on Opus. When in doubt, keep it
on Opus; a wrong delegation costs more than it saves.

**A Sonnet briefing is self-contained**: the sub-task, exact files in scope, acceptance
criteria, the locked contracts to consume *without modifying*, the test command, and the
guardrail "do not change shared contracts — if you think you need to, stop and report back."
A subagent that hits a contract gap reports up; it never improvises a contract change.

**Tier picks who; shape picks how.** Two ways to dispatch help:
- **One-shot subagent** (own worktree, returns a result): for an *isolated* unit whose output
  you integrate — a leaf component, a fixture, a self-contained workstream. The default.
- **Agent-team on a shared branch/worktree** (a team that coordinates in shared context):
  **prefer this when several units of one feature touch overlapping files or must agree on an
  interface mid-flight** — instead of fanning out isolated subagents and reconciling their
  diffs by hand, let the team build together on one worktree and coordinate, while you (Opus)
  own the seam, review, and integration. It collapses the predicted intra-feature convergence
  into live coordination rather than a post-hoc merge. Use a one-shot subagent when the work is
  cleanly partitioned; use a shared-worktree team when it isn't.

## The one rule that shapes everything

Specs and contracts decide *what* and *why*; this skill decides *how*. But it **never
silently diverges from a shared contract.** If implementation needs a cross-cutting contract
to change (a shared type, an API/data schema, a brand rule, a determinism boundary), change
it at its source of truth *and* note it in the roadmap/architecture so dependents re-sync —
don't fork a local copy. Silent drift here is the failure mode this skill exists to prevent.

## Workflow

### Step 1 — Isolate the work in a branch + worktree

Autonomous build work is **always** isolated in its own worktree on its own branch — the
primary worktree (where the human works on main, live) is never touched and never
branch-switched. Create the worktree with `git worktree add`; **never `git checkout`/`switch`
the primary worktree.**

- Branch: `feat/<feature-id>-<short-slug>`, off the repo's main/default branch.
- Worktree: under **`.claude/worktrees/<slug>/`** in the project repo (never your agent/home
  config dir). Ensure `.claude/worktrees/` is gitignored (add it to `.git/info/exclude` if the
  tracked `.gitignore` shouldn't be touched) so transient build trees aren't committed.
- If the repo isn't a git repo or has no commits, surface that and ask — isolation
  assumptions don't hold otherwise.

**Timing vs. plan mode:** the read-only context-gathering of Steps 2–3 happens first.
Create the worktree at the very start *if not in plan mode*, or *after* plan approval (Step
4) if the plan is being approved in plan mode (which forbids mutations until approval).
Either way, all edits/tests/commits happen in the worktree.

### Step 2 — Understand the context before planning

Read (don't skim), in order, following the feature file's own links rather than assuming
filenames:

1. **The feature file** — description, dependencies, *acceptance criteria* (these define
   done-ness and the tests), testing requirements, manual setup, Implementation-notes.
2. **The architecture/design doc** it cites — relevant sections, locked decisions, non-goals.
3. **Any design/brand/style contract** — binding, but only if the feature has a UI/motion/
   audio/voice/copy surface.
4. **The roadmap** — this feature's place, its cross-cutting concerns and their sources of truth.
5. **What already shipped** — inspect the actual code of dependency features. **Trust the
   code over the plan where they diverge**, and note the divergence.

Then **verify the feature's stated dependencies actually exist in the code**, not just the
plan. If a dependency is missing, stop and tell the user — building on an absent contract
wastes the whole effort. A cited-but-missing doc is a missing input (Step 3), not license to
proceed blind.

### Step 3 — Ask clarifying questions

Surface genuine ambiguities the spec doesn't resolve (unclear acceptance boundary, contract
gaps, conflicting guidance, missing manual setup like API keys). Keep them decision-relevant
— don't ask what the docs answer. Resolve unknowns now, before code exists.

### Step 4 — Get the plan approved in plan mode, then persist it (the one gate)

Develop the full implementation plan internally: ordered chunks, each a coherent
build-and-test slice ending in a tickable item; for each, what it delivers, which acceptance
criteria it satisfies, what tests prove it, and any contract touchpoint.

Every chunk is tagged with its subagent tier. **An `[Opus]` tag must state why (contract /
novel / integration); no reason = mis-tier, default it to Sonnet.** State the critical path
explicitly; everything off it dispatches concurrently. Serializing independent work is a
planning defect, not a style choice.

**Present that full plan via the harness's native plan mode and wait for approval there**
(`ExitPlanMode`). The native plan presentation is the review surface the user expects — do
not substitute an in-chat summary or a sparse file edit. Until approved, write no
implementation code and make no repo edits beyond the Step 1 worktree.

**After approval, persist the same plan at full fidelity** into the feature file as a
checkbox list (in/above its Implementation-notes section). The file becomes the living
progress tracker; if approval came with changes, persist the amended plan. Then proceed
autonomously through build, test, and review — the user has delegated the how.

### Step 5 — Build test-first, chunk by chunk

Discover the repo's actual test/build tooling — don't assume a stack.

**Decide the build topology** from the sub-tasks' `[parallel]`/`[serial after X]`
annotations and the [model-tiering rule](#model-tiering--opus-coordinates-sonnet-executes-the-simple-parts):
dispatch mutually-`[parallel]` sub-tasks as concurrent subagents (one message, so they run at
once); dispatch contract-touching/novel/integration sub-tasks to an **Opus subagent** — never
type them yourself. The sub-task that *introduces* a contract others consume lands (or its
shape locks) first, via a dedicated subagent that runs alone before the fan-out and reports
back the frozen signatures, so the parallel workstreams build against a frozen contract. A wholly-complex feature is all
Opus; a mostly-mechanical one is mostly Sonnet with Opus briefing + integrating. **Integration
is always Opus** — never delegate the merge of subagent outputs.

**A blocker feature deserves the most decomposition, not the least.** When a feature is on the
critical path (others wait on it), split out its mechanical sub-tasks (fixtures, fallback
data, prompt text, leaf components, boilerplate endpoints) to concurrent Sonnet agents and
keep only the contract seam + integration on yourself — the goal is to lock its consumable
shape and clear the blocker fast, not to hand-build all of it. Don't serialize an entire
blocker on one Opus thread while downstream features idle.

**Per-chunk discipline** (same whether you or a subagent built it):

1. Write the tests the chunk's acceptance criteria require (the criteria *are* the test spec).
2. Implement the chunk.
3. Run the tests; iterate until green for that chunk.
4. **Verify against the running system, not just the suite.** Run the smallest command that
   exercises the chunk through the *real* running system — curl the dev server, drive the app
   with Chrome DevTools MCP / Playwright, invoke the CLI, call the deployed function — and
   quote the relevant output line (exit code / HTTP status / DOM state) into the feature
   file. "Tests pass" / "should work" / "I checked manually" without a quoted command and
   output is **not** verification. If a chunk genuinely isn't reachable end-to-end yet because
   it sits behind an unbuilt feature, say so explicitly in the note (e.g. "e2e deferred to
   F-NN; unit tests cover the contract") — defer deliberately, never skip silently. This
   deferral covers only the *caller→feature integration path*; if the thing renders/runs
   standalone (a UI component, a CLI, an endpoint), exercise it standalone now — "not mounted
   by the real caller yet" does not excuse never running it.
5. Tick the checkbox and commit (Step 9).

Step 4-verify, the tick, and the commit are **always the coordinator's** job, even for a
chunk a subagent built — a subagent's "tests pass" is an input to your verification, not a
substitute. Continue until every checkbox is checked. Treat the feature's "testing
requirements" (incl. cross-cutting obligations like a shared validator or a11y checks) as
binding. If a checkbox truly can't complete (needs a device/key only the user has), leave it
unchecked, note why, flag it — don't fake completion.

Record meaningful decisions + rationale into Implementation-notes *as you make them*.

**No feature/roadmap IDs in anything permanent** — no "per F-01", no "see F-04" in code
comments, config files, env templates (`.env.example`), prompt text, or committed docs
(ADRs, ARCHITECTURE/ROADMAP, README, LICENSES, CLAUDE.md). Feature files are transient
work-trackers; they get archived and their `F-NN` IDs become dangling noise that tells a
future reader nothing about what the code does. If a comment must justify a non-obvious
choice, reference the durable **ADR** instead (`// session cookies, not JWT — see ADR-007`),
or let it stand on its own. `F-NN` IDs belong **only** in the feature file, commit messages,
and the PR/MR body — never anywhere that persists in the tree. This is a hard rule, not a
preference: grep the diff for `F-[0-9]` before every commit and strip any hit outside those
three places.

### Step 6 — Adversarial review in two parallel waves, then triage-fix

When all boxes are checked and tests pass, review in two waves of parallel subagents — Wave
1 catches show-stoppers, Wave 2 catches quality. (Two waves because reviewing the craft of
code that doesn't meet spec is wasted work.) Per the [model-tiering rule](#model-tiering--opus-coordinates-sonnet-executes-the-simple-parts),
the judgment-heavy reviewers run on **Opus**, the mechanical ones on **Sonnet**.

**Wave 1 (both Opus), dispatched in one message:**
1. **Spec-compliance** — briefed with the feature file, relevant ADRs, and the diff. *Does
   this satisfy every acceptance criterion and honor every referenced ADR constraint?*
   Returns a per-criterion met/partial/missed verdict with file:line / quoted-output
   evidence, plus any contract drift.
2. **Security** — input validation, injection, secret handling, authn/authz, trust
   boundaries, project-specific safety invariants. Findings rated high/medium/low.

Triage Wave 1 before Wave 2: **any missed acceptance criterion → fix** (a "done with
concerns" on spec is not done); **high/medium security → fix and re-test**; low security →
record for the user. Re-run the spec-compliance check after spec-driven fixes.

**Wave 2 (both Sonnet), dispatched in one message:**
3. **Robustness** — edge cases, failure modes, error handling, resource cleanup, concurrency,
   retries, timeouts.
4. **Efficiency** — needless work, hot-path allocations, N+1, complexity, wasted re-renders,
   oversized payloads.
5. **Convention hygiene** — grep the diff for `F-[0-9]` and flag every hit in code, config,
   env templates, prompts, or committed docs (allowed only in the feature file / commit
   messages / PR body); flag any inline architectural decision that should be in an ADR; flag
   secrets or `.env` contents that leaked into the diff. These are always fixed, not deferred.

Same triage: high/medium fixed and re-tested; low recorded.

**Triage is always Opus.** A Sonnet reviewer's severity is an input, not a verdict — re-rate
anything mis-scoped. Note per wave in Implementation-notes: which subagents ran (and on which
model), finding counts by severity, what you changed, what low findings you deferred. If a
finding suggests the *architecture or roadmap* is wrong, capture it for the Step 8 retro.

### Step 7 — Smoke-test the running app (mandatory, end of build)

Before finalizing, **the coordinator drives the actual running app once, end to end**, and
confirms: the new functionality works through the real UI/CLI/endpoint, and there are no
obvious regressions in the surrounding behavior. This is the whole-feature counterpart to
the per-chunk Step-5 verify — it's the gate that would have caught "all units green, but the
thing doesn't actually work when you run it."

- Launch the app the way a user/caller does (dev server + browser via Chrome DevTools MCP /
  Playwright for a UI; the binary for a CLI; the deployed/served endpoint for a service).
  Lean on a project "run the app" skill if one exists.
- Exercise the feature's primary path and a neighbouring existing path (the regression
  check). Quote the observed evidence (DOM state / screenshot / output / status) into the
  feature file.
- This runs **after** the review fixes are in (you smoke-test the corrected code) but is
  otherwise independent of the Step 8 retro — do them concurrently where practical.
- **If you're building a batch for one unified MR (orchestration mode), don't stand up the
  full running app per feature** — that's the most expensive step and rebuilding it N times is
  wasted. Cover each feature with its integration tests during the build and do the single
  end-to-end app smoke once on the assembled batch (Step 5 of orchestration mode). Reserve a
  mid-build app launch for a feature whose behavior literally cannot be asserted in tests.
- If you genuinely cannot run the app (missing key/device only the user has, or the feature
  has no runnable surface yet because it sits entirely behind an unbuilt caller), **stop and
  tell the user it couldn't be smoke-tested and why** — don't bury it as a one-line deferral
  and proceed. A documented gap is not a substitute for running it.

### Step 8 — Retro: what did this feature teach us?

Briefly, in an Implementation-notes `### Retro` subsection, answer four questions and **make
the propagation edits now** (don't defer):

1. **Learned about the system, not in the architecture?** (a constraint, a non-obvious
   interaction, a perf cliff, a library limit) → update `ARCHITECTURE.md`, or write a new
   ADR if it's a real decision.
2. **Learned that changes the roadmap?** (a feature harder than it looked, a missing
   integration feature, an uncaptured dependency) → update `ROADMAP.md`.
3. **What contract changed?** → confirm it was updated at its source of truth and dependents
   will see it.
4. **What should the next builder do differently?** (a gotcha, a missing setup step, a flaky
   pattern) → note it here if one-off; add to ROADMAP cross-cutting notes if it'll recur, or
   propose a CLAUDE.md addition if it's about *how to build in this repo*.

Keep it tight. "Nothing material" is a valid answer — the discipline is to *ask*, not to
manufacture lessons. Reflect any ADR/doc updates in the PR's "Propagated to" section.

### Step 9 — Commit in related chunks as you go

Commit incrementally — typically one commit per completed plan chunk (tests + implementation
together), plus a commit for review fixes. Not one giant end commit; the history should read
as the build progressed. Use **Conventional Commits** — `<type>(<scope>): <description>`,
lowercase, imperative, no trailing period, granular scope naming the subsystem; types `feat
fix docs chore ci perf infra style refactor test build revert`. Follow any session rules on
commit attribution/footers.

### Step 10 — Rebase onto local main, then push and open the PR/MR

**Autonomous and mandatory:** once Steps 1–9 are done (boxes ticked or honestly deferred,
tests green, smoke test passed, high/medium findings resolved), carry through to an open,
pushed PR/MR **without asking permission to push or open it** — the user delegated
finalization by invoking the skill. The only things that warrant stopping are the genuine
blockers Steps 3–6 define (broken dependency, spec wrong, unresolved high finding).

1. Rebase the branch onto **local** main. **Keep history linear: rebase, never merge; resolve
   conflicts in place.** Re-run the suite after — a green rebase that breaks tests isn't done.
2. **Push the branch** and open the PR/MR (match the project's forge). The body must:
   summarize what it delivers + link the feature file; **document the decisions with
   rationale** (from Implementation-notes); **call out load-bearing areas to review manually**
   (contract changes, trust boundaries, anything other features depend on, anything review
   flagged as close); list deferred/unchecked items and why; note any contract change + where
   propagated; and a **Propagated to** section (ADRs/ARCHITECTURE/ROADMAP/CLAUDE.md edits from
   the retro, or "nothing propagated").
3. Report the PR/MR URL as the deliverable — say it to the user; **never write it into the
   feature file or any tracked file** (the MR already links the files; a back-link rots).
   **Don't bother the user mid-finalization** — the next thing you say is "done, here is the
   PR/MR: <url>".

Do not merge — delivery ends at an open, rebased, pushed, self-explaining PR/MR.

> **Precedence note.** This autonomous-push instruction is tier 2; a user's explicit standing
> instruction is tier 1 and wins — but read its *scope* exactly. A rule constraining pushes
> to **main/default** does not gate pushing a *feature branch* + opening a PR/MR (this skill's
> normal isolated finalization). Only stop if a standing rule explicitly covers feature-branch
> pushes.

## Judgment notes

- The feature file is the contract with the user and the next agent. If it and reality
  disagree at the end, the file is wrong — update it so it tells the truth.
- "Done" = acceptance criteria met and proven by tests, the app smoke-tested, review's
  high/medium findings resolved, and the PR explaining itself — not "code written."
- **The full suite must be green, period — no failing or pending tests.** "It's pre-existing"
  / "it fails on main too" / "it's unrelated" are not acceptable reasons to ship red: fix it
  (or fix how you're running the suite), and never leave a test you touched flaky or polluted.
- Prefer the smallest change that satisfies a criterion. Scope creep is a planning decision,
  not a build-time one.
- If mid-build the spec turns out wrong or a dependency is broken, stop and raise it — pushing
  forward on a broken premise is the expensive failure.
- Lean on a more specific project skill where one exists (worktrees, TDD, running the app,
  finishing a branch, code review); this skill is the spine, not a replacement for good local
  tooling.

## Parallel-features orchestration mode

Use when asked to build **several independent features from one iteration at once** ("build
iteration 1", "do F-02/03/04 in parallel"). You run an instance of the Steps 1–10 workflow per
feature across concurrent workstreams while owning the cross-feature convergence the roadmap
predicts. This is *features-within-an-iteration* parallelism, distinct from (and nesting over)
the *sub-tasks-within-a-feature* parallelism Step 5 already handles.

**Don't use it when:** features have a hard dependency edge (one consumes another's shipped
behavior — build those in order); or you can't hold all in-flight features' convergence points
in view at once (3–5 concurrent is a sane ceiling for one coordinator; beyond that, the user
runs multiple sessions).

It only adds these deltas to the single-feature workflow:

1. **Confirm genuine concurrency** — read the roadmap's parallelism map + per-feature
   Dependencies/Convergence notes. Any feature that depends on another in the set drops to a
   later serial batch.
2. **Lock the shared contracts first, before fanning out** (the single most important step).
   Dispatch one **Opus subagent** that runs alone to build the minimum-viable form of each
   shared contract (renderer switch, agent-menu union, shared context, wire format) and report
   back the frozen signatures — you own and verify it, but don't type it. Fanning out before
   the contract is locked is how parallel work diverges. **Pre-commit every feature's additive extension to a shared shape here** — the new
   enum members / union variants / optional wire fields each feature will need — *together with
   their consumers* (every switch, validator, or provider schema that must stay exhaustive over
   that shape). A shared extensible type and the code that must handle all its cases are one
   contract; landing the members up front turns N late merge-conflicts + non-exhaustiveness
   breaks into zero.
3. **Assign each feature a workstream + model tier** (the [model-tiering rule](#model-tiering--opus-coordinates-sonnet-executes-the-simple-parts)
   at feature granularity): a mechanical, low-contract feature can be a **Sonnet** workstream
   end-to-end (full single-feature briefing; it builds + commits to its branch but does **not**
   integrate or open a PR); a complex/contract-touching feature stays **Opus**. Each gets its
   own branch + worktree.
4. **Run concurrently; you stay the integrator.** Never let two workstreams edit the same
   shared file blind — serialize those edits through you, or have each touch only its own
   region and you reconcile.
5. **Review per feature, then unify into ONE linear MR.** Each feature still gets its own Step
   6 review (one diff at a time is tractable) and its own Step 7 smoke test where it has a
   runnable surface. But the batch deliverable is **one MR for the whole iteration, not one per
   feature** — you fanned the work out, so you collect it back. Build the unified branch as a
   **linear chain (no merge commits)**: cut it off the local default branch, rebase/cherry-pick
   each workstream's commits onto it in order, resolve the predicted convergence in place as
   ordinary commits. Run the **full integrated suite + an end-to-end smoke test of the
   assembled app** on that branch — this is the batch convergence review, where
   green-in-isolation/broken-on-integration surfaces. Then push and open the single MR. Don't
   require the base synced to the remote first.
6. **One retro for the batch** (Step 8), focused on what the *convergence* taught you —
   contract gaps that only showed up at merge, parallelism assumptions that proved wrong.
7. **Tear down the fan-out once the MR is open.** The per-workstream branches + worktrees were
   transient scaffolding; their commits now live on the unified branch. Delete each transient
   worktree and its branch (`git worktree remove`, `git branch -D`) — keep only the unified
   branch + its worktree. Don't push or open MRs for the transient branches; don't delete the
   unified branch or anything with un-collected work. Report the cleanup in the done message.

Everything else is unchanged: each feature is still built test-first to its checklist, verified
against the running system, adversarially reviewed, and smoke-tested. The coordinator is Opus
throughout; only per-feature/per-sub-task *execution* drops to Sonnet where the work earns it.
