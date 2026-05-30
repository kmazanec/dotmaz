# kmaz pipeline — shared conventions

The single source of truth for the rules every kmaz pipeline stage shares. This is a
**reference, not a triggerable skill** — it has no `description` frontmatter and is never
invoked directly. When a stage's own instructions genuinely conflict with this doc, the stage
wins for that stage — but prefer fixing the conflict here so it doesn't drift.

## How this doc is loaded (read this first)

Nothing loads this file automatically. It reaches the two kinds of actor differently — know which
you are:

- **Skills (an orchestrator runs them in-conversation).** The orchestrator is a reasoning model. Each
  SKILL.md's first step is "read this file." Having read it, the orchestrator **selects the relevant
  rules at runtime and copies them into each sub-agent it dispatches** — a security reviewer gets the
  security + timeless-comment rules, a doc writer gets none of the code rules. Inject what's relevant
  to that sub-agent's task; don't dump the whole doc.
- **Workflows (`.js` files; `agent()` spawns sub-agents).** A workflow is deterministic code, not a
  reasoner — it cannot read this file at runtime and cannot decide what's relevant. So every workflow
  sub-agent prompt **embeds the rules it needs inline** (the prompt string is the only context the
  sub-agent gets). Those inline copies are the enforceable form; THIS doc is the canonical text they
  are kept in sync with. **Maintainer rule:** when you change a shared rule here, update the workflow
  prompts that embed it too — the spine alone changes nothing at workflow runtime.

So: this doc's value is (1) one place to edit a rule, (2) what skill orchestrators load and
selectively inject, and (3) the canonical source workflow prompts are copied from. It is not an
auto-loaded runtime context — enforcement always happens where a rule is *also* present in the
SKILL step or the agent prompt that runs.

## The pipeline

The stages, in order, and the artifact each consumes/produces:

| Stage | Skill / workflow | Consumes | Produces |
|-------|------------------|----------|----------|
| Research | `kmaz-research` (workflow) | a brief/problem | `docs/research/{DOMAIN,TECHNOLOGY,MARKET,COMPANY}.md` + README |
| PRD | `kmaz-prd` (skill) | a brief/problem + research | `docs/PRD.md` (WHAT/WHY, tech-agnostic) |
| Architecture | `kmaz-prd-to-architecture` (skill) | PRD + research | `docs/ARCHITECTURE.md` + `docs/adrs/ADR-NNN-*.md` + architecture diagrams |
| Roadmap | `kmaz-architecture-to-roadmap` (skill) | ARCHITECTURE + ADRs + PRD | `docs/ROADMAP.md` + `docs/iterations/NN-<slug>/` feature specs |
| Plan | `kmaz-plan-iteration` (workflow) | one iteration's specs + roadmap | per-spec "Build plan (approved)" + `BUILD-PLAN-<slug>.md` |
| Build | `kmaz-build-iteration` (workflow) | an approved `BUILD-PLAN-<slug>.md` | shipped code on one linear integration branch + ONE MR |
| Merge | `kmaz-merge-and-cleanup` (skill) | a finished feature branch | linear `main`, scaffolding removed |
| Review | `kmaz-review-comments` (skill) | an open PR/MR with feedback | fixes + durable lessons propagated upstream |

The stages above are the full **greenfield** pipeline: a whole product, planned across many iterations.
For adding **ONE feature to an existing (brownfield) project**, `kmaz-feature` (skill) runs this entire
pipeline compressed into a single skill — interview → ground → lock → plan → build → report — producing
just one feature doc. Same conventions, in miniature. Use it instead of the full chain when the work is
one feature on a codebase that already exists.

`docs/STATUS.md` is the **rolling re-entry point** — a single short doc answering "where are we, what
shipped, what's next" without reading five files. The roadmap stage seeds it (every iteration +
feature, all "not started"); the build stage updates it at convergence (mark each shipped/blocked,
set what's next). It is a *status*, not a plan — kept terse, always current. Whoever re-enters the
project reads STATUS.md first.

The human's deep involvement is concentrated at the **front** (PRD + architecture interviews)
and at **one approval gate** (the plan). Everything after the plan approval is autonomous.
This is deliberate: interview thoroughly up front, then let it build.

## Model tiering — Opus reasons, Sonnet builds, Haiku extracts

One rule governs every model choice across every stage:

- **Opus** — genuine reasoning whose cost of being wrong is high: design decisions and their
  tradeoffs, planning *how* to build a feature, freezing shared contracts, the adversarial
  review pass, synthesizing independent drafts. The thinking, not the typing.
- **Sonnet** — well-specified execution: implementing a feature to a detailed approved plan
  (even high-stakes work — the plan carries it), applying a reviewer's confirmed fixes,
  writing prose to a structured spec, research investigation/writing at scan/standard depth.
- **Haiku** — pure extraction/transcription with no judgment: read a structured artifact and
  fill a schema, pick the next item off a list, template structured data into Markdown. If a
  step is "read X, emit Y, decide nothing," it's Haiku.

Defaults, restated as a decision rule: *does this step require weighing alternatives?* → Opus.
*Is it specified well enough that the answer is determined?* → Sonnet. *Is there nothing to
decide at all?* → Haiku. When unsure between two tiers, pick the lower one unless a wrong
answer is expensive and hard to reverse.

Opus is the expensive, scarce resource — spend it only where reasoning earns it. A mechanical
step on Opus is waste; a reasoning step on Sonnet is a quality risk. Most of the pipeline is
Sonnet, with Opus at the reasoning cores and Haiku at the extraction edges.

## Concurrency — exploit it at every level, derive it from dependencies

Run independent work in parallel wherever the level allows it. The pipeline parallelizes at
four levels — push each as far as the dependencies allow, no further:

1. **Within a fan-out** — research investigators, planning drafts, review dimensions: dispatch
   all independent agents at once (one message / `parallel()` / `pipeline()`), never serialize
   them by hand.
2. **Features within an iteration** — the build runs every feature whose hard-deps are
   satisfied concurrently, each in its own worktree. No lanes are planned; concurrency is
   *derived* from the dependency graph (below).
3. **Iterations** — independent iterations (no cross-iteration hard dep, or only a frozen
   contract between them) can be planned and built CONCURRENTLY. Every artifact is slug-scoped
   so they never collide. This is the highest-leverage parallelism for a large product — when
   two iterations don't depend on each other, plan/build them at the same time, don't queue
   them.
4. **Interactive overlap** — in the interview stages, kick off research while you keep
   listening/drafting, so findings are in hand before they're needed rather than blocking on a
   serial research-then-interview sequence.

**Dependencies are the only concurrency model.** No stage sorts work into parallel-vs-serial
"lanes," computes a critical path, or models convergence rework. Each unit of work declares
what it *hard-depends on* (it consumes another unit's not-yet-shipped behavior); the scheduler
runs everything else concurrently. A **hard dependency** forces order; a **contract-mediated
soft dependency** does NOT (it builds against a frozen contract — see Contracts). Minimize hard
deps in decomposition; a genuinely linear chain is fine — declare it honestly and let it
serialize. Don't contort slicing to manufacture concurrency that isn't there.

## Contracts — decided once, indexed once, frozen once

A **contract** is a shared shape multiple features introduce/consume/extend: a tagged
union/enum, a wire/message schema, a shared validator, a provider interface, the brand/voice
design contract. It is NOT a feature and never its own feature. It flows down the pipeline by
*reference*, decided exactly once:

1. **Decided in an ADR** (architecture). A contract-bearing ADR is flagged `Contract: yes` and
   its "Consequences for the build" names the contract's source-of-truth file, its
   minimum-viable shape, and the *exhaustive consumers* — every switch/validator/serializer
   that must handle all cases. The architecture is the authority.
2. **Indexed in the roadmap.** The contracts table cites the ADR as source of truth; it does
   NOT redefine the decision. A shared shape with no ADR behind it is flagged as an
   architecture gap, not invented here.
3. **Frozen in the plan.** `kmaz-plan-iteration` reads the cited ADRs and freezes a concrete
   signature *consistent with them*, pre-committing every feature's additive extension together
   with its exhaustive consumers. The build lands the frozen contract first, before any feature
   work, so concurrent features build against a stable shape and there are no late
   non-exhaustiveness breaks.

Freezing contracts early is what lets soft deps stay soft (features build against the frozen
shape instead of waiting). An unnamed shared shape is how concurrent work diverges — name every
contract precisely and anchor it to its ADR.

## Worktree isolation — the primary worktree is sacred

The primary worktree (where the human works on `main`, live) is **never** touched or
branch-switched by any autonomous stage. Every autonomous build/plan/integration step works in
its OWN git worktree under `.claude/worktrees/<slug>/` on its own branch, created with
`git worktree add` — never `git checkout`/`switch` on the primary. `.claude/worktrees/` must be
gitignored (add to `.git/info/exclude` if the tracked `.gitignore` shouldn't be touched). Tear
a worktree down once its work is collected (merged/cherry-picked), keeping any worktree that
still holds un-collected (blocked) work. Interactive, turn-by-turn work with the human stays on
the primary branch where you both are.

## Timeless code comments — never reference the build process

Code comments describe **what the code does and why it exists** — never the process that
produced it. Do not write a feature ID (`F-NN`), an iteration name, "build plan", "manifest",
"as planned", or any ephemeral planning/build-process reference into code, config,
env-templates, prompts, or committed docs. The code outlives the plan; such a comment rots into
noise. For a non-obvious choice, cite a durable ADR (`// session cookies, not JWT — see ADR-007`)
or let it stand alone. Planning IDs and process talk belong ONLY in spec files, commit messages,
and the PR/MR body. Grep a diff for `F-[0-9]` and for process language in comments before
committing, and strip any hit.

## The compound learning loop — every stage feeds the ones around it

Nothing learned should die in the artifact that learned it. The pipeline compounds:

- **Build → specs → next plan.** The build amends each feature's outcome (shippable, acceptance
  status, QA evidence) into its own spec, and propagates durable lessons (a contract that needed
  another variant, a feature harder than scoped, a footgun) to ROADMAP/ADRs. The *next*
  iteration's plan reads those build outcomes + retro lessons before planning, so iteration N+1
  inherits what iteration N learned.
- **Review → architecture.** PR/MR review surfaces lessons no adversarial subagent caught
  (reviewers bring context and taste). Each durable one is propagated *now*, in the same
  session: a changed decision → a new superseding ADR; a preferred pattern → ROADMAP/CLAUDE.md;
  a missed integration/contract → ARCHITECTURE/ROADMAP. Don't let the reasoning live only in a
  PR thread.
- **Bar for propagation:** "would the next feature/builder actually benefit?" If not, skip it —
  quantity of propagation is not a goal, and "nothing material this round" is a valid outcome.

## Teach the human, don't just deliver

The human should leave smarter than they arrived. In the interview stages (PRD, architecture),
**teach the tradeoff before you ask the question it bears on**: state the relevant research
finding (cite it, with its confidence), lay out the real options and what each buys/costs *in
this context*, recommend with reasoning, then let the human choose. A correct decision the human
can't re-explain is a failure. Use the harness's structured question affordance for crisp
either/or choices; prose for open exploration. After the system is designed, the architecture
stage produces **visual architecture explainers** (see `kmaz-create-diagram`) so the human can
*see* the system, not just read decisions about it. Ground teaching in cited research; flag
low-confidence findings so the human never defends a shaky claim.

## Quality bars every product must clear

Beyond "tests pass," the pipeline builds for production. These are decided at architecture time
(as ADRs) and enforced downstream:

- **Security & trust boundaries** are an architectural decision, not just a review lens —
  auth model, data sensitivity, trust boundaries, input validation strategy, secret handling are
  designed in (ADRs) and the build's security review enforces against them.
- **Non-functional targets** — scale/throughput, performance budgets, availability,
  data-retention/compliance — are stated as decisions (ADRs) so the build can test against them.
  An unstated target can't be verified.
- **Observability/operability** — how we'll know the system works in production (logging,
  metrics, health) is a named decision, not an afterthought.
- **Simplicity & factoring** — prefer the simplest design that satisfies the requirement; resist
  over-abstraction. The smallest change that meets each acceptance criterion. Scope creep is a
  planning decision, not a build-time one. The bar is the simplest thing that works, well-factored —
  not the most general thing imaginable. Speculative abstraction ("we might need it") is a defect,
  not foresight.

## Definition of done — trace back to the PRD, not just the spec

A feature is done when it satisfies the **PRD's original acceptance criteria** (section 6) for what
it delivers — not merely when its spec's checkboxes are ticked. The spec criteria are a derivative;
the PRD is the source of truth for WHAT. Because PRD criteria are written as near-executable
assertions (Given/When/Then, concrete values), "done" is checkable: at convergence the build confirms
each shipped feature's behavior against the PRD criteria it traces to, not just against its own
checklist. A feature whose spec boxes are ticked but whose PRD criterion isn't observably met is NOT
done — that gap is exactly what an end-to-end check at convergence exists to catch.

## Hard rules (non-negotiable)

- **Never `git add -A`/`git add .`** — stage only the files this stage changed; other dirty
  state belongs to the human or another agent.
- **Linear history** — integrate by rebase/cherry-pick, never a merge commit, for pipeline
  landings.
- **The full suite runs once, at the end** — feature build + fix steps run only the impacted
  tests; the full suite runs at convergence/merge. Fix failures there.
- **No artifact written that another file already carries** — don't emit a separate report when
  the information can be amended into an existing spec/PR body. The MR URL is returned to the
  user, never written into a tracked file.
- **Approval gates are real** — the plan-approval gate is the human's; the assistant flips the
  plan's Status to Approved on verbal approval and commits it (the human doesn't edit the file),
  but launching the build stays user-triggered.
