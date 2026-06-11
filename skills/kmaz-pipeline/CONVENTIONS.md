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

**Specialist routing is orthogonal to the model tier.** The tier (Opus/Sonnet/Haiku) decides *how
much reasoning* a step gets; the agent **type** decides *whose taste* it carries. The build stage
routes a feature's implementer and reviewer to the persona agent matching the feature's stack
(`raymond-hettinger` for Python, `dan-abramov`/`matt-pocock` for React/TS, `sandi-metz` for Ruby,
`rob-pike` for Go, `niko-matsakis` for Rust, …) — the builder on the Sonnet tier, the reviewer on
the Opus tier, and ideally a **different** specialist reviewing than built, so the diff gets a
second domain voice. The plan stage tags each feature with a `stack`; an untagged feature falls
back to a generic Sonnet build / Opus review. Routing adds domain idiom without changing the tier:
a specialist builder is still Sonnet, a specialist reviewer is still Opus.

**The build cost is the tool-loop, not the model.** The dominant token cost of a build agent is the
agentic round-trip — every test run and every commit re-feeds the agent's whole context — not the
model's reasoning. So build agents work in **batches**: implement a whole chunk *and all its tests*,
run its impacted tests *once*, commit *once* per chunk; drive the running app *once* at the end, not
per chunk. When a test run is red, read *all* the failures from that one run and fix them together,
then re-run once — a `write→run→fix-all→run` rhythm (~1–2 runs per chunk), never
`write-one-fix→run→write-next→run`. Measured: builders that re-run tests after every small edit hit
30+ test runs for one feature — the **single biggest avoidable token sink in the pipeline**. Give
build/contract agents an explicit tool-use budget (≈one test-run and one commit per chunk) so they
self-monitor; the instruction "run until green" without a budget invites the per-edit loop.

**A feature's exit gate runs the repo's typecheck/build once, not just impacted unit tests.**
Transpile-only test runners (vitest/esbuild and kin) provably miss type errors, undeclared
dependencies, and packaging breaks — a measured tests-green feature shipped package exports
pointing at `src/*.ts` and crashed the built container. Impacted tests per chunk; one
`typecheck && build` pass per feature; the full suite once at convergence. Long-running build
workflows also **preflight the environment at load** (a pushable git remote exists, the toolchain
runs) so a missing prerequisite surfaces in the first minute, not at the final push.

**The multi-draft planning panel is the most expensive plan-phase step — reserve it.** A
feature that escalates to the 3-independent-drafts-plus-synth panel costs ~4× a single-pass plan, so
it fires RARELY and only where draft *diversity* genuinely earns it. The gate is two conditions, both
required (a forced run aside): the scope pass flagged it high-uncertainty with a concrete reason, AND
the feature actually **introduces a load-bearing shared contract** — the objective signal that its
approach is open. A feature that merely *feels* tricky but introduces no contract takes the single
pass. In practice that's one or two foundational slices per iteration (the skeleton that freezes the
shared shapes), not every feature an optimistic scope pass flagged.

**Plan agents read narrowly, not the whole architecture.** ~10 planning agents each re-reading the
full PRD/ARCHITECTURE/ADR corpus cold is a large, avoidable re-ingestion cost. The scope pass already
identifies which contracts bind each feature (and where each lives) and which features it hard-depends
on; each planner is handed that targeted reading brief and reads ONLY its spec, the specific
source-of-truth ADRs that bind it, and the implemented code of its named dependencies — not the whole
tree. (The reuse/researcher lens keeps repo-search latitude; that ranging IS its job.) Anything a spec
cites outside the brief is noted as a risk, not chased through the entire corpus.

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
   contract between them) can be planned and built CONCURRENTLY, and better still built as ONE
   BATCH. The build runs ONE contract barrier per invocation, then fans every feature out in
   parallel — so building an independent set *together in one invocation* is strictly cheaper
   than building the iterations separately-but-concurrently (one barrier instead of N, and all
   their features fan out at once). The wall-clock becomes `one barrier + the slowest single
   feature`, not `barrier+iterA then barrier+iterB`. This is the highest-leverage parallelism
   for a large product. An iteration boundary is a PRODUCT/shipping unit; where the product theme
   splits a mutually-independent, already-unblocked feature set across iterations, the BUILD
   should collapse them into one batch (in practice: put that independent set in one iteration
   DIRECTORY, since the dir is the build unit, and let the theme just group the features inside).
   Don't pay the barrier once per theme when one barrier covers the whole independent set.
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

**Over-declaring `dependsOn` is the dominant cause of a slow serial build — guard against it
explicitly.** The classic mistake: feature B consumes a shared contract that feature A introduces,
so the planner writes `B after A`. That edge is WRONG. The build's contract barrier freezes and
lands *every* shared contract before any feature work, so B builds against the frozen shape and does
not depend on A's implementation at all. The honest test for every candidate edge is: *"does this
feature need the other's actual implemented runtime behavior, or just the shared shape they freeze?"*
Only the former is a hard dep. A spurious "after the contract's author" edge forces features that
could run concurrently to run one-at-a-time, idling build slots — exactly the failure that turns a
~20-minute concurrent build into a ~90-minute serial one. When a plan comes out near-fully-serial,
suspect over-declared edges first; the build stage emits a loud warning when ≤1 feature can start at
the front, precisely so this surfaces at launch instead of after the wall-clock is spent.

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

## Worktree isolation — the primary worktree is sacred; worktrees are for parallelism, not ceremony

The primary worktree (where the human works on `main`, live) is **never** touched or
branch-switched by any autonomous stage. All autonomous build/plan/integration work happens in
git worktrees under `.claude/worktrees/<slug>/`, created with `git worktree add` — never
`git checkout`/`switch` on the primary. `.claude/worktrees/` must be gitignored (add to
`.git/info/exclude` if the tracked `.gitignore` shouldn't be touched).

**Worktrees buy two things only: isolation from the human, and genuine parallelism. They are NOT
one-per-unit-of-work.** An iteration has ONE long-lived build worktree (the **trunk**) on
`build/<slug>`; dependency-ordered (serial) work stacks directly on it, each unit built by a
FRESH agent — context isolation comes from new agents, not new branches. An additional worktree
is created only while two-plus units genuinely build at the same time; it forks from the last
*stable* trunk sha and is folded back onto the trunk (cherry-pick, linear history) once its work
is reviewed-shippable. A dependent unit builds only on top of its dependency's actual landed
code — never from a bare base with the dep's code missing (the measured failure: the builder
invents the missing foundation and the result is an unmergeable fork). If a hard dep did not
ship, the dependent is **skipped loudly**, never built on a guess.

**One worktree mechanism only.** A workflow `agent()` call must NOT pass `isolation: 'worktree'`
to an agent whose prompt already instructs it to create or work in a named worktree — the
harness flag spawns a second, non-convention worktree (`wf_<runid>-N` on a `worktree-wf_*`
branch) and agents understandably squat in it, stranding their branches outside the
`.claude/worktrees/<slug>/` layout (measured: two builders did entire features in harness
debris). The explicit, slug-named worktree IS the isolation.

Tear a worktree down once its work is collected (folded/merged), keeping any worktree that
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
