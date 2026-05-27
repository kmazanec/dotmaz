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
  ticket id or a spec file under a features/ directory. Trigger even if they don't name
  this skill, as long as there is a feature/spec file to implement.
---

# Feature Builder

## What this is for

The companion to `kmaz-architecture-to-roadmap`. That skill *plans* — slicing a design into
independently-deliverable feature specs. This skill *executes* one of those specs to
completion: isolated, planned with the user, built test-first, adversarially reviewed,
and delivered as a rebased PR that explains itself.

The feature file is the **living source of truth** throughout. The plan, the progress
checkboxes, and the decisions all live in it and are kept current as you work — so anyone
(including a future agent) can see exactly where things stand from the file alone.

## The one rule that shapes everything

Plans, specs, and contracts decide *what* and *why*; this skill decides *how* and records
those decisions. But it never silently diverges from a shared contract. The feature file
and roadmap typically reference cross-cutting contracts — whatever they are for this
project (e.g. a shared type/interface definition, a design/brand contract, an API or data
schema, a security or determinism boundary). If implementation needs one of those to change,
change it at its source of truth *and* note it in the roadmap/architecture so dependents
re-sync — don't fork a local copy and move on. Drift here breaks other features silently;
that is the failure mode this skill exists to prevent.

## Workflow

### Step 1 — Isolate the work in a dedicated branch + worktree

The work happens in a dedicated branch in a separate git worktree so the main workspace
is never disturbed and the work is trivially discardable if the plan changes.

- Branch name: derive from the feature's id/slug (e.g. `feat/<feature-id>-<short-slug>`).
- Prefer the project's worktree convention if one exists; otherwise create a worktrees folder
  under the projects .claude directory. If a `using-git-worktrees`-style skill is available, you may use it.
- Branch from the repo's main/default branch. Do all subsequent build work inside the
  worktree.
- If the repo isn't a git repo or has no commits yet, surface that to the user and ask
  how to proceed rather than guessing — isolation assumptions don't hold otherwise.

**Timing relative to plan mode:** creating a worktree is a repo mutation, and the Step 4
plan approval may run in the harness's native plan mode (which forbids mutations until
approval). So: the *context-gathering* of Steps 2–3 (reading files, inspecting code,
asking questions) is read-only and can happen first. Create the worktree either at the
very start *if not in plan mode*, or — if the plan is being approved in plan mode —
immediately *after* plan approval and before any build in Step 5. Either way the result
is the same: all implementation edits, tests, and commits happen inside the isolated
worktree, never the main workspace. Pick whichever ordering respects the current mode;
don't mutate the repo to set up isolation while a plan is still pending approval.

### Step 2 — Understand the context before planning

Read, in this order, and form a real model of the work — don't skim:

1. **The target feature file** — description, how-it-fits, dependencies, *acceptance
   criteria* (these define done-ness and the tests), testing requirements, manual setup,
   and its Implementation-notes section.
2. **The architecture/design doc** the feature cites (commonly an `ARCHITECTURE.md` or
   similar) — the relevant sections, the locked decisions, the non-goals.
3. **Any design/brand or style contract** the project has — only if the feature has a UI,
   motion, audio, voice, or copy surface; where one exists it is binding for those.
4. **The roadmap or plan** the feature belongs to — this feature's place in it, its
   cross-cutting concerns, and each concern's source of truth.

   These docs vary by project in name and location; follow the links/references in the
   feature file rather than assuming fixed filenames. If a feature cites a document that
   isn't present, treat that as a missing input (Step 3), not an excuse to proceed blind.
5. **What already shipped** — inspect the actual code/artifacts of dependency features.
   Interfaces evolve; **trust the code over the plan where they diverge**, and note the
   divergence.

Then **verify the feature's stated dependencies are actually met** (the contracts/
interfaces it needs exist in the code, not just in the plan). If a dependency is missing
or unmet, stop and tell the user — building on an absent contract wastes the whole effort.

### Step 3 — Ask clarifying questions

Surface genuine ambiguities the spec doesn't resolve (unclear acceptance boundary,
contract gaps, conflicting guidance, missing manual setup like API keys). Ask the user,
using the project's question affordance. Keep questions decision-relevant — don't ask
what the docs already answer. This is the moment to resolve unknowns cheaply, before any
code exists.

### Step 4 — Present the plan for approval *in plan mode*, then persist it (the one gate)

The user reviews the plan, so the plan they review must be the rich one — not a thinner
summary. Use the harness's **native plan mode** as the review surface, because that is
what gives the user the full, well-formatted plan presentation they expect to approve
against. The feature file is the *persistent tracking artifact*, not the review surface;
writing only a terser markdown version there and asking for ad-hoc approval is the bug
this step exists to prevent — it strips the review of the detail the user needs.

Concretely:

1. Develop the full implementation plan internally: ordered chunks, each a coherent
   build-and-test slice ending in a tickable item. For each chunk capture what it
   delivers, which acceptance criteria it satisfies, what tests prove it, and any
   contract touchpoint or cross-cutting concern it must obey. This is the detailed plan —
   keep its richness.
2. **Present this full plan to the user via plan mode and wait for approval there**
   (e.g. `ExitPlanMode` / the native plan-approval flow). Do not pre-write the plan into
   the feature file before this, and do not substitute an in-chat summary or a sparse
   file edit for the native plan review. This is the single approval gate: until the user
   approves the plan in plan mode, write no implementation code and make no repo edits
   beyond the worktree setup already done in Step 1.
3. **After the user approves**, persist that same approved plan — at full fidelity, not a
   reduced version — into the feature file as a **checkbox list**, in or just above its
   "Implementation notes" section (the builder's space by the feature-file convention).
   The file now mirrors what was approved and becomes the living progress tracker
   (checkboxes ticked as chunks complete). The plan-mode presentation and the file must
   not diverge; if approval came with changes, persist the *amended* plan.

After approval, proceed autonomously through build, test, and review without further
gating — the user has delegated the how.

### Step 5 — Build test-first, chunk by chunk, to the checklist

Discover the repo's actual test/build tooling (test runner, scripts, conventions) — do
not assume a stack; match what the project uses. Then for each plan chunk, in order:

1. **Write the tests** the chunk's acceptance criteria require (the criteria *are* the
   spec for the tests — unit/contract/component/etc. as the feature dictates).
2. **Implement the chunk.**
3. **Run the tests**; iterate implementation↔tests until they pass for that chunk.
4. **Verify against the running system, not just the test suite.** This is the gate that
   stops "all green in isolation, broken on integration" — the failure mode that defers
   real integration to the end of the project. Concretely:
   - Identify the smallest command that exercises this chunk through the real running
     system: hitting the dev server with curl, driving the app with Chrome DevTools MCP
     or Playwright, invoking the CLI binary, calling the deployed function — whatever
     the actual user/caller does. Unit tests are necessary but not sufficient; they
     prove the code does what you said, not that it's wired into anything.
   - Run the command. Read the output (including exit code / HTTP status / DOM state).
   - Quote the relevant line of output into the feature file's Implementation-notes as
     the verification evidence for that chunk.
   - If the chunk is not yet reachable end-to-end because it sits behind features still
     unbuilt, say so explicitly in the note (e.g. "verification deferred to F-NN
     integration; unit tests cover the contract"). Do not silently skip — defer
     deliberately. The Walking Skeleton (F-01 in the roadmap) exists so this case is
     rare; if it's happening often, the roadmap's integration features are missing.
   - "Tests pass" alone is not verification. "Should work" / "probably fine" /
     "I checked manually" without a quoted command and output are not verification.
5. **Tick the chunk's checkbox** in the feature file and commit (see Step 7).

Continue until every checkbox is checked. Treat the feature's "testing requirements"
section as binding, including any cross-cutting test obligations (e.g. a shared-contract
validator the feature must pass, accessibility checks). If a checkbox genuinely can't be
completed (e.g. needs a device or a key only the user has), leave it unchecked, note why
in the feature file, and flag it for the user rather than faking completion.

Record meaningful implementation decisions and their rationale into the feature file's
Implementation-notes section *as you make them*, not retroactively — chosen patterns
within the architecture's constraints, trade-offs, deviations from the spec's assumptions
and why, and any contract change propagated upward.

**Do not reference feature IDs, feature names, or roadmap items in source code or
comments.** No "per F-01", no "see F-04 for the integration", no "added for the
auth-rewrite ticket". Feature/roadmap identifiers are planning artifacts and have no
business in the codebase — they rot as soon as plans change, and they tell a future
reader nothing about *what the code does* or *why it does it this way*.

If a comment genuinely needs to justify a non-obvious choice, reference the **ADR**
that locked the decision instead (e.g. `// session cookies, not JWT — see ADR-007`).
ADRs are durable: they outlive feature files, they stay valid even as the plan
evolves, and they give the reader a real explanation rather than a pointer to a
checklist.

Feature/roadmap references are appropriate in: the feature file itself, the
Implementation-notes section, commit messages, and PR/MR bodies. Never in code.

### Step 6 — Adversarial review in two parallel waves, then triage-fix

When all boxes are checked and tests pass, run adversarial review as **two waves of
parallel subagents**. Wave 1 catches the show-stoppers (does this even meet the spec,
and is it safe?); Wave 2 catches quality issues. Two waves rather than one because
reviewing the craft of code that doesn't meet spec is wasted work — fix the spec gap
first, then look at quality of the corrected code.

**Wave 1 (parallel) — the show-stoppers:**

Dispatch two independent subagents in a single message:

1. **Spec-compliance reviewer.** Briefed with the feature file, the relevant
   architecture/ADRs, and the diff. Question: *Does this implementation satisfy every
   acceptance criterion in the feature file, and does it honor every constraint named
   in its referenced ADRs?* Returns a per-criterion verdict (met / partial / missed)
   with concrete evidence (file:line citations or quoted output), and any contract
   drift from referenced ADRs.
2. **Security reviewer.** Briefed with the diff and any safety/integrity boundary the
   architecture defines for this project. Looks at input validation, injection, secret
   handling, authn/authz, trust boundaries, and project-specific safety invariants.
   Returns findings rated **high / medium / low** with concrete rationale.

Triage Wave 1 before starting Wave 2:

- **Any missed acceptance criterion → fix it.** A "DONE_WITH_CONCERNS" on spec
  compliance is not done; the feature file is the contract.
- **High and medium security findings → fix them.** Re-run the full test suite after
  fixes (add tests for the fixed behavior where it makes sense).
- **Low security findings** → record in the feature file for the user to decide later.

Re-run Wave 1's spec-compliance check after any spec-driven fixes to confirm
convergence, then proceed.

**Wave 2 (parallel) — the quality lens:**

Dispatch two more independent subagents in a single message:

3. **Robustness reviewer.** Edge cases, failure modes, error handling, resource cleanup,
   concurrency, retries, timeouts. Returns findings rated high / medium / low.
4. **Efficiency reviewer.** Needless work, hot-path allocations, N+1 queries, algorithmic
   complexity, wasted re-renders, oversized payloads. Returns findings rated
   high / medium / low.

Triage Wave 2 with the same rule: high and medium get fixed and re-tested; low gets
recorded in the feature file for the user to decide.

Note in Implementation-notes, for each wave: which subagents ran, the count of findings
by severity, what you changed in response, and which low findings you deferred for the
user.

If any reviewer's findings suggest the *architecture or roadmap is wrong* (a constraint
was unrealistic, an ADR's tradeoffs are biting harder than expected, a missing
integration feature surfaced), that's a Step 6.5 concern — capture it for the retro.

### Step 6.5 — Retro: what did this feature teach us?

Before committing the final review-fix commit, do a short retrospective. The point is
not navel-gazing — it's making sure lessons from this build *propagate to the artifacts
that will inform the next feature*, instead of dying in this feature's
Implementation-notes where nobody will read them.

Answer these four questions, briefly, in the feature file's Implementation-notes under
a new `### Retro` subsection:

1. **What did we learn about the system that wasn't in the architecture?** A new
   constraint, a non-obvious interaction between components, a performance cliff, a
   library limitation. If anything surfaced, it likely belongs in `ARCHITECTURE.md`
   (the overview, in prose) or — if it's a real decision worth justifying — as a
   **new ADR** under `docs/adrs/`. Make the update now; don't defer it.
2. **What did we learn that changes the roadmap?** A feature that's harder than it
   looked, a missing integration feature, a dependency the plan didn't capture, a
   cross-cutting concern that should be made explicit. If so, update `ROADMAP.md`
   now (the cross-cutting concerns section or the dependency graph).
3. **What contract changed?** If implementation forced any shared contract to
   change — a type, an API shape, a brand-rule clarification, a schema — confirm it
   was updated at its source of truth and that dependent features will see it.
4. **What should the next feature builder do differently?** A gotcha, a missing dev
   setup step, a flaky test pattern, a tooling sharp edge. If it's a one-off, note
   it here; if it's likely to bite the next agent too, add it to the relevant
   cross-cutting section of ROADMAP.md or, if it's about *how to build features in
   this repo*, propose it to the user for inclusion in CLAUDE.md.

Keep the retro tight — four short answers, plus the propagation edits. If all four
answers are "nothing material," that's a valid answer; write it and move on. The
discipline is to *ask*, not to manufacture lessons.

Findings that result in a new ADR or doc update should be reflected in the PR body
under a "Propagated to" section (see Step 8).

### Step 7 — Commit in related chunks as you go

Commit incrementally in logical, related chunks — typically one commit per completed plan
chunk (tests + implementation together), plus a commit for the review fixes. Not one
giant end commit; the history should read as the build progressed. Use clear messages
referencing the feature id. Follow the repo's commit conventions and any session rules
about commit attribution/footers.

Generally, use Conventional Commits

  Format:

  <type>(<scope>): <description>

  - Lowercase, imperative, no trailing period, kept to a single short line (the <description>).
  - (<scope>) is near-universal here and very granular — it names the subsystem, not just the layer.

  Types: feat, fix, docs, chore, ci, perf, infra, style, refactor, test, build, revert

### Step 8 — Rebase onto local main, then push and open the PR/MR

This step is **autonomous and mandatory**: once Steps 1–7 are done (all checkboxes
ticked or honestly deferred, tests green, adversarial high/mediums resolved), carry
this through to an open, pushed PR/MR **without stopping to ask permission to push or
to open it**. Do not pause here for a "should I push?" / "ready to finalize?"
check-in — the user has delegated finalization by invoking this skill. The only
things that still warrant stopping are the genuine blockers Steps 3–6 already define
(broken dependency, spec wrong, unresolved high finding) — not the push itself.

1. Rebase the branch onto the **local** main/default branch (not a remote fetch unless
   the project clearly expects that) so the PR is current and conflicts are resolved in
   the worktree. Re-run the test suite after the rebase — a green rebase that breaks
   tests is not done.
2. **Push the branch** to the remote (the repo's normal remote/forge — GitHub PR or
   GitLab MR, match what the project/precedent uses) and **open the PR/MR**. The
   body must:
   - Summarize what the feature delivers and link the feature file.
   - **Document the decisions made along the way with their rationale** (pull these from
     the Implementation-notes you kept — the PR is where they become reviewable).
   - **Explicitly call out high-impact / load-bearing areas the user should review
     manually** — the parts where a subtle mistake is most costly (contract changes,
     security/trust boundaries, anything other features depend on, anything the
     adversarial review flagged as close).
   - List any unchecked items / deferred low-severity findings and why.
   - Note any cross-cutting contract change made and where it was propagated.
   - **Propagated to:** list any ADRs created, ARCHITECTURE.md / ROADMAP.md sections
     updated, cross-cutting contracts changed (and where), or CLAUDE.md proposals raised
     from the Step 6.5 retro. If nothing propagated, say so.
3. Record the PR/MR URL in the feature file (the tracking artifact) and report it back
   as the final deliverable. **Do not bother the user mid-finalization** — the next
   thing you say to them is "done, here is the open PR/MR: <url>".

Follow the repo's PR conventions and any session rules about PR/commit body footers.
Do not merge — delivery ends at an open, rebased, **pushed**, self-explaining PR/MR
for the user to review.

> **Precedence note.** This autonomous-push instruction is part of the skill (priority
> tier 2). A user's explicit standing instruction is tier 1 and still wins — but read
> its *scope* exactly, don't over-broaden it. A rule constraining pushes to the
> **main/default branch** does not gate pushing a *feature branch* and opening a
> PR/MR — that is this skill's normal, isolated, reviewable finalization, which such
> rules are not about. Only stop and ask when a standing rule explicitly covers
> feature-branch pushes; otherwise push the feature branch and open the PR/MR without
> asking.

## Judgment notes

- The feature file is the contract with the user and the next agent. If it and reality
  disagree at the end, the file is wrong — update it (checkboxes, notes, deferrals) so it
  tells the truth.
- "Done" is the acceptance criteria met and proven by tests, the adversarial review's
  high/medium findings resolved, and the PR explaining itself — not "code written."
- Prefer the smallest change that satisfies a criterion; this skill builds one feature,
  not the next three. Scope creep is a planning decision, not a build-time one.
- If, mid-build, the spec turns out to be wrong or a dependency is broken, stop and raise
  it — pushing forward on a broken premise is the expensive failure, not the pause.
- When a more specific project skill exists for a sub-step (worktrees, TDD, finishing a
  branch, code review), it's fine to lean on it; this skill is the spine, not a
  replacement for good local tooling.
