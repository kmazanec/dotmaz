---
name: kmaz-feature
description: >-
  Add ONE feature to an existing (brownfield) project, end to end, by running the whole kmaz
  pipeline compressed into a single skill: take the idea, ask immediate scope-clarifying questions,
  fan out Sonnet sub-agents to study the codebase and research what's needed, then drill the user
  until the requirements, architecture decisions, and anything needing human judgment are locked —
  the one human gate. Write a single feature plan doc to docs/, then implement the feature
  autonomously to completion: make reasonable assumptions without asking, defer only what genuinely
  cannot be decided or done by the model, and record every assumption, decision, and blocker at the
  end of the doc to report back. Use this whenever the user wants to add/build/implement a feature,
  capability, endpoint, screen, or change to an EXISTING project — "add X", "build a feature that
  does Y", "implement Z in this app", "I have an idea for a feature". This is the single-feature
  sibling of the iteration pipeline (kmaz-plan-iteration / kmaz-build-iteration); use it for one
  feature on an existing codebase, not for planning a whole greenfield product (that's kmaz-prd →
  kmaz-prd-to-architecture → kmaz-architecture-to-roadmap). Trigger even if the user doesn't name
  this skill, as long as there's a feature to add to a project that already exists.
---

# kmaz-feature — the whole pipeline, in miniature, for one feature

> **Pipeline conventions — READ FIRST:** before doing anything, read
> [`../kmaz-pipeline/CONVENTIONS.md`](../kmaz-pipeline/CONVENTIONS.md) in full. This skill is the full
> kmaz pipeline (research → requirements → architecture → plan → build → learn) **compressed into one
> skill for a single feature on an existing project**. The conventions — model tiering (Opus reasons /
> Sonnet builds / Haiku extracts), the teach-the-human mandate, contract discipline, timeless code
> comments, the quality bars (security / non-functional / simplicity), the compound loop — all apply
> here in miniature. When you dispatch a sub-agent, copy in only the rules relevant to its task.

## What this is

The greenfield pipeline plans a whole product across many iterations and stages, each with its own
artifact and its own human gate. **This skill is that pipeline scaled down to what one iteration
would do for one new piece of functionality on a codebase that already exists** — same DNA, one
feature, one human gate, one doc.

The shape: **interview → ground → lock → plan → build → report.** The human is in the loop only at the
front (clarify scope, then lock requirements + decisions). After the lock, you build autonomously to
completion — making reasonable assumptions, never stopping to ask — and report what you decided and
what you couldn't at the end.

This is for a **brownfield** project: an existing codebase with its own patterns, conventions, stack,
and (sometimes) architecture docs. The feature must fit what's already there. Studying the existing
code is the single most important grounding step — more than web research.

## When NOT to use this

- **A whole new product / greenfield build** → that's the full pipeline (`kmaz-prd` →
  `kmaz-prd-to-architecture` → `kmaz-architecture-to-roadmap` → `kmaz-plan-iteration` →
  `kmaz-build-iteration`). This skill is one feature, not a product.
- **Several independent features at once on a planned product** → that's `kmaz-plan-iteration` +
  `kmaz-build-iteration` (one iteration, parallel features). This skill builds ONE feature.
- **A trivial change** (a one-line fix, a rename, a copy tweak) → just do it; the interview overhead
  isn't worth it. This skill is for a feature with real scope, decisions, or risk.

## Workflow

### Step 1 — Take the idea, clarify scope immediately

The input is the user's idea, in whatever form. Read it. Then ask a **tight first round of
scope-clarifying questions** — only what you need to know the *boundaries* of the work before you can
usefully study the codebase: what the feature does, who uses it, what's explicitly in vs. out, any
hard constraint or deadline. Use the harness's structured question affordance for crisp choices;
prose for open ones. Keep it short — this round is about scoping the investigation, not locking
everything (that's Step 3). If the idea is already crisp, one or two questions may be enough.

### Step 2 — Ground: fan out Sonnet sub-agents to study the codebase and research

Dispatch **concurrent Sonnet sub-agents** (one message, so they run at once — CONVENTIONS.md,
"Concurrency") to gather everything you'll need to decide well. Scope each to what this feature
actually touches; don't boil the ocean. Typical fan-out:

- **Codebase context (always):** how the project is structured, the stack and its conventions, the
  modules/files this feature will touch, the patterns already used for this kind of work (how do they
  do data access? auth? validation? state? tests?), and any shared contract the feature must conform
  to. This is the brownfield equivalent of the architecture stage's "study the existing code" — the
  feature must look like it belongs.
- **Existing project docs (if present):** ARCHITECTURE.md, ADRs, a ROADMAP, a CLAUDE.md, a brand/voice
  contract, prior feature docs. Read them to inherit decisions and patterns. Don't require them —
  brownfield projects often won't have them.
- **External research (only when a real gap warrants it):** a library/API the feature needs, a
  domain/regulatory constraint, a footgun in the approach. Skip it for a well-understood change; use
  it when a decision genuinely rests on something you don't know. Ground claims in sources; flag
  low-confidence ones (CONVENTIONS.md, "Teach the human").

Give each sub-agent a self-contained brief (the feature, the files/areas in scope, what to report).
You hold only the findings, not each agent's full output. Synthesize them yourself into a clear
picture of how this feature fits the existing system.

### Step 3 — Lock: drill the user (the one human gate)

This is the only place the human's input is required, so make it count. Having studied the code and
research, **drive focused rounds of questions until everything that needs the user's judgment is
locked** — then you build without stopping. Cover, teaching as you go (state the relevant finding,
lay out the real options + what each buys/costs *in this codebase*, recommend, let them choose):

- **Requirements & acceptance criteria** — what "done" means, as near-testable assertions
  (Given/When/Then, concrete values — CONVENTIONS.md). The criteria are the build's test spec.
- **Architecture decisions** — the choices the feature forces that the existing patterns don't already
  answer: a new dependency, a schema/contract change, a new integration, a trust boundary, a
  data-model decision. Honor the project's established patterns by default; surface only the genuine
  forks. If a decision touches a shared contract, note it (CONVENTIONS.md, "Contracts").
- **The quality bars, proportionate to the feature** — any security/trust-boundary, non-functional
  (scale/perf), or observability concern this feature raises. A login feature needs a security answer;
  a copy change doesn't. Don't skip them by silence; ask the ones that matter.
- **Anything genuinely ambiguous or risky** the user must adjudicate — conflicting guidance, a
  missing key/account, a UX call only they can make.

Drill until the answers are real, not until you've asked a quota. **Stop when there's nothing left
that genuinely needs the human** — over-asking wastes their time as surely as under-asking ships the
wrong thing. The bar to clear: after this step, you have everything you need to build the feature to
completion making only *reasonable* assumptions. Everything still open at this point that the model
*can* reasonably decide, you will decide during the build (Step 5) — don't ask about those.

### Step 4 — Write the plan to a single doc

Write ONE self-contained feature doc — `docs/features/<feature-slug>.md` (create `docs/features/` if
absent; match the project's docs location if it clearly uses another). This is the only artifact.
Keep it tight; it is a working plan, not a product spec. Structure:

```markdown
# Feature: <Name>

**Status:** Building · **Date:** <date>

## What this delivers (before → after)
One sentence each: what the user/system can't do today; what they can once this ships.

## Requirements & acceptance criteria
The locked requirements, and numbered acceptance criteria as Given/When/Then assertions a test can check.

## Approach
How it fits the existing codebase: the modules/files it touches, the existing patterns it follows, any
new dependency/contract/integration. The locked architecture decisions, each with its one-line WHY.
Honor the project's conventions — the feature should look like it belongs.

## Build plan
An ordered checkbox list of build-and-test slices: `- [ ]` per chunk, each naming what it delivers,
which acceptance criteria it satisfies, and the specific test(s) that prove it. Test-first.

## Quality bars
The security / non-functional / observability answers that apply (or "n/a — <why>" for those that
don't). Proportionate to the feature.

## Decisions, assumptions & blockers  ← filled in as you build + at the end
(starts empty; see Step 6)
```

Then build immediately — there is no separate plan-approval gate. The Step 3 lock WAS the gate; the
user delegated the build by answering. (If the feature is unusually high-stakes and you want a
sanity check, you may show the plan and get a quick verbal "go" — but the default is to proceed.)

### Step 5 — Build autonomously to completion

Implement the feature test-first, chunk by chunk, to the build plan. Follow CONVENTIONS.md's build
discipline in miniature:

- **Isolation:** do this in an isolated worktree/branch if the project's workflow calls for it and
  you're working autonomously; for a small in-conversation feature on the user's current branch,
  follow the session's git conventions. Never `git add -A`; stage only what you changed.
- **Test-first per chunk:** write the tests the acceptance criteria require, implement the smallest
  change that satisfies them, run **only the impacted tests** to green (full suite once at the end).
- **Verify against the running system,** not just the suite, where the feature has a runnable surface
  (drive the app/endpoint/CLI; quote the evidence).
- **Make reasonable assumptions — do NOT stop to ask.** This is the core of the skill: anything the
  model can reasonably decide, decide it and record it (below). The user already gave you the gate in
  Step 3; mid-build questions defeat the purpose. Only a genuine hard blocker (a missing
  credential/account only the user has, a decision that's truly theirs and wasn't surfaced in Step 3,
  a contradiction that makes the feature impossible as specified) gets deferred — and deferred to the
  END, not raised mid-stream, unless it blocks ALL further progress.
- **Simplicity:** the smallest well-factored thing that satisfies the criteria. No speculative
  abstraction (CONVENTIONS.md, "Quality bars").
- **Timeless comments:** code says what it does and why, never the process that produced it — no
  "added for this feature", no planning-doc references (CONVENTIONS.md).
- **Tier the work:** keep contract-touching / novel / integration work on yourself (Opus); dispatch
  isolated, well-specified, mechanical sub-tasks to Sonnet sub-agents with self-contained briefs.

Record meaningful decisions and assumptions into the doc's "Decisions, assumptions & blockers" section
*as you make them*, so the trail is honest and current.

### Step 6 — Finalize: document and report

When the feature is built (acceptance criteria met, impacted tests green, then the full suite green
once at the end, app smoke-tested where it has a surface):

1. **Complete the doc's "Decisions, assumptions & blockers" section:**
   - **Decisions made** — the non-obvious choices you made building, each with a one-line why.
   - **Assumptions** — the reasonable assumptions you made instead of asking, so the user can correct
     any that are wrong.
   - **Deferred / blockers** — anything you could NOT do or decide (needs a human-only key/account, a
     call that's genuinely the user's, a follow-up that's out of this feature's scope), with what's
     needed to resolve each. Flip the doc **Status** to "Done" or "Done — with deferrals".
   - **Propagate a durable lesson** (CONVENTIONS.md, "compound loop") ONLY if the project already
     keeps the artifact: a changed/added decision → an ADR if the project uses ADRs; a pattern the
     next feature should follow → CLAUDE.md if it exists. Don't create project-level architecture docs
     a brownfield project doesn't already have — keep it to the one feature doc otherwise.
2. **Report to the user** in the conversation: what shipped, the decisions + assumptions worth knowing
   (teach what building taught — a footgun hit, a pattern followed, an assumption to verify), and the
   deferred/blocked items needing their attention. Point them at the doc. If you opened a PR/MR per the
   project's workflow, give the URL here (never write it into a tracked file).

## Judgment notes

- **One gate, then autonomy.** The whole design rests on Step 3 being thorough enough that Step 5
  needs no human input. Invest in the interview; then honor the autonomy — a mid-build question is
  usually a sign Step 3 was rushed.
- **Reasonable assumption > blocking question.** When in doubt during the build, make the assumption a
  competent engineer would, record it, and keep moving. Only what's genuinely undecidable by the model
  defers. The user reviews assumptions at the end and corrects the few that matter.
- **Fit the codebase over inventing.** A brownfield feature succeeds by looking like it was always
  there. Default to the project's existing patterns; introduce a new pattern only when the existing
  ones genuinely don't fit, and record why.
- **Proportion the rigor to the feature.** A trust-boundary feature earns a security pass and careful
  review; a small additive feature doesn't need the full ceremony. Scale the interview, the doc, and
  the verification to what the feature actually warrants — the structure is a guide, not a checklist
  to pad.
- **Minimal artifacts.** One doc. Don't generate a research directory, a roadmap, or per-stage files —
  fold the grounding into your own reasoning and the single feature doc. The greenfield pipeline's
  many artifacts exist because many people build a product over months; one person adding one feature
  needs one doc.
