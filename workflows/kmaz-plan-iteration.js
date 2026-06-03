export const meta = {
  name: 'kmaz-plan-iteration',
  description:
    'Plan the build of an iteration: read roadmap + feature specs, draft a build plan per feature (one opus pass reasoning through architect/reuse/contrarian lenses; high-uncertainty features escalate to a 3-draft panel), reconcile shared contracts, and emit per-spec checkbox plans + a BUILD-PLAN-<slug>.md orchestration index (dependency order, model tiers, frozen contract signatures) for human approval before any code is built.',
  whenToUse:
    'Run BEFORE building an iteration\'s features. Produces the reviewable plan that kmaz-build-iteration consumes. Every artifact is name-scoped to the iteration slug (the manifest filename carries it and records it), so multiple iterations can be planned and built concurrently without colliding. You approve the plan in conversation, then launch the build workflow.',
  phases: [
    { title: 'Scope', detail: 'read the iteration dir (overview + nested feature specs) + roadmap; verify dependencies exist in code' },
    { title: 'Plan', detail: 'per feature: ONE opus pass through architect/reuse/contrarian lenses → build plan; high-uncertainty features escalate to a 3-draft panel', model: 'opus' },
    { title: 'Contracts', detail: 'reconcile the per-feature contract touchpoints into one frozen shared-contract spec', model: 'opus' },
    { title: 'Persist', detail: 'write per-feature checkbox plans into specs + BUILD-PLAN-<slug>.md orchestration index' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-plan-iteration — phase 1 of the two-phase feature build.
//
// Shared pipeline conventions (model tiering, dependency-only concurrency,
// contract discipline, the compound loop) are canonical in
// dotmaz/skills/kmaz-pipeline/CONVENTIONS.md. A workflow can't read that file at
// runtime, so every agent() prompt below EMBEDS the rules its sub-agent needs
// inline. MAINTAINER RULE: changing a shared rule means updating CONVENTIONS.md
// AND the prompts here that embed it. The notes below are this workflow's
// specifics.
//
// WHY two phases: a workflow can't take mid-run user input, but the build needs
// a human plan-approval gate. So planning and building are separate workflows:
// THIS one emits a complete, reviewable plan and STOPS; the human approves it in
// conversation; then kmaz-build-iteration builds autonomously from the approved
// artifact. This workflow writes plans + an orchestration index — it does NOT
// commit code. Contracts are SPECIFIED here (signatures) and IMPLEMENTED by the
// build workflow, so nothing lands before approval.
//
// LAYOUT: kmaz-architecture-to-roadmap makes iterations the top-level unit —
// docs/iterations/NN-<slug>/ holds the nested feature specs (MM-<slug>.md) and
// nothing else (no README; the roadmap + BUILD-PLAN carry the iteration goal +
// index). This workflow is pointed at ONE iteration dir and plans every spec in
// it. Older projects use a flat docs/features/ dir with the
// iteration grouping in ROADMAP.md / each spec's "Iteration:" field; pass
// `featuresDir` + `iteration` for those (the Scope agent handles both).
//
// PLAN THE RIGHT BUILD, NOT THE PARALLELISM: we do NOT try to sort work into
// parallel-vs-linear lanes. The plan names hard dependencies (which feature
// consumes another's shipped behavior); the build workflow schedules from those
// deps alone — independent work runs concurrently, dependent work serializes,
// for free. Designing the right implementation matters; how much it parallelizes
// is a consequence of the dependency graph, not a thing to optimize here.
//
// PARALLEL ITERATIONS: every artifact is name-scoped to the iteration slug — the
// manifest filename carries it (BUILD-PLAN-<slug>.md, in both layouts) and the
// manifest records it, so the build workflow scopes ITS artifacts (branch,
// worktrees, report) to the same iteration. Two iterations can be planned and
// built concurrently without colliding. Don't reintroduce an unscoped name.
//
// `args` (all optional):
//   { iterationDir?: string,   // current layout: the iteration dir to plan (default: a finder agent picks the next INCOMPLETE iteration)
//     featuresDir?: string,    // legacy layout: flat specs dir (e.g. docs/features); set this for legacy projects
//     iterationSlug?: string,  // explicit slug to name-scope artifacts; else derived from iteration/iterationDir
//     roadmap?: string,        // path to ROADMAP.md (default: docs/ROADMAP.md) for cross-iteration context
//     iteration?: string,      // iteration name/number to plan — REQUIRED for legacy flat layout to scope the batch
//     features?: string[],     // explicit spec paths/ids to plan (overrides the dir's feature set)
//     multiDraft?: boolean,    // force the 3-draft+synth panel for EVERY feature (default: single-pass planner, panel only for highUncertainty features)
//     manifestPath?: string }  // override manifest path (default: <iterationDir>/BUILD-PLAN-<slug>.md, or docs/BUILD-PLAN-<slug>.md legacy)
// ---------------------------------------------------------------------------

const FEATURES_DIR = args?.featuresDir ?? null // legacy flat layout when set
const LEGACY = FEATURES_DIR !== null
const ROADMAP = args?.roadmap ?? 'docs/ROADMAP.md'
const ITERATION = args?.iteration ?? null
const EXPLICIT_FEATURES = Array.isArray(args?.features) ? args.features : null

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// The iteration directory is NOT defaulted to a hardcoded '01-*' — that always
// plans iteration 1, even after it has shipped. When the caller names it, use
// it; otherwise it stays null here and a finder agent (in Scope) walks
// docs/iterations/ and picks the FIRST not-yet-done iteration. Slug + manifest
// path depend on the resolved dir, so they're computed AFTER resolution below.
let ITERATION_DIR = args?.iterationDir ?? null
let ITERATION_SLUG = (args?.iterationSlug && slugify(args.iterationSlug)) || (ITERATION && slugify(ITERATION)) || null
let MANIFEST_PATH = args?.manifestPath ?? null

// Compute slug + manifest path from whatever iteration dir we ended up with
// (explicit or finder-resolved). Idempotent — safe to call once dir is known.
function resolveArtifactPaths() {
  if (!ITERATION_SLUG && ITERATION_DIR && !ITERATION_DIR.includes('*')) {
    ITERATION_SLUG = slugify(ITERATION_DIR.replace(/\/$/, '').split('/').pop())
  }
  if (!ITERATION_SLUG) ITERATION_SLUG = 'iteration' // last-resort; concurrent use should pass a slug
  if (!MANIFEST_PATH) {
    MANIFEST_PATH = LEGACY
      ? `docs/BUILD-PLAN-${ITERATION_SLUG}.md`
      : `${(ITERATION_DIR ?? 'docs/iterations/' + ITERATION_SLUG).replace(/\/$/, '')}/BUILD-PLAN-${ITERATION_SLUG}.md`
  }
}

// === Schemas ===============================================================

const SCOPE_SCHEMA = {
  type: 'object',
  required: ['iterationName', 'features', 'sharedContracts', 'blockers'],
  properties: {
    iterationName: { type: 'string' },
    iterationGoal: { type: 'string', description: 'one sentence: what a user can do after this iteration' },
    features: {
      type: 'array',
      description: 'the features to build in this batch, in dependency order',
      items: {
        type: 'object',
        required: ['id', 'specPath', 'title', 'oneLineBeforeAfter', 'dependsOn', 'touchesContracts'],
        properties: {
          id: { type: 'string', description: 'feature id, e.g. F-03' },
          specPath: { type: 'string', description: 'path to the nested feature spec, e.g. docs/iterations/01-skeleton/02-foo.md' },
          title: { type: 'string' },
          oneLineBeforeAfter: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'feature ids this HARD-depends on — it consumes their not-yet-shipped RUNTIME BEHAVIOR, so it must build after them. This is the ONLY ordering signal; everything not named here builds concurrently. A contract-mediated soft dep is NOT a hard dep: if this feature only CONSUMES or EXTENDS a shared contract that another feature introduces, that contract is frozen and landed by the build\'s contract barrier BEFORE any feature work — so this feature builds against the frozen shape and must NOT list the contract\'s author here. Listing it serializes the build behind a feature it does not actually depend on (the exact over-declaration that turns a concurrent build into a slow serial chain). Only name a feature here when you consume its actual implemented behavior, not its shared contract.' },
          stack: { type: 'string', description: 'the feature\'s PRIMARY stack/domain in one kebab token, used to route the build to a stack specialist: e.g. "python-backend", "react-frontend", "node", "typescript", "go", "rust", "ruby", "rails", "swift". Pick the dominant one if a feature spans layers (most vertical slices have a clear center of gravity); use the closest match or a plain language/framework name.' },
          touchesContracts: { type: 'array', items: { type: 'string' }, description: 'names of shared contracts this feature introduces, consumes, or extends' },
          dependenciesVerifiedInCode: { type: 'boolean', description: 'true only if the stated dependencies actually exist in the code, not just the plan' },
          highUncertainty: { type: 'boolean', description: 'true ONLY for a feature whose approach is genuinely unsettled and worth THREE independent planning drafts instead of one: it introduces a load-bearing shared contract, involves a novel/subtle algorithm or a real security/concurrency boundary, or the spec leaves the approach materially open. A routine feature that extends an established pattern is NOT high-uncertainty — default false. Keep this rare; most features get the single-pass planner.' },
          highUncertaintyReason: { type: 'string', description: 'REQUIRED whenever highUncertainty=true: the CONCRETE reason — name the load-bearing contract, the specific novel/subtle algorithm or security/concurrency boundary, or exactly what the spec leaves open. A vague reason ("seems complex", "might be tricky") does NOT justify the 3-draft panel — if you can\'t name a concrete reason, set highUncertainty=false. Empty when highUncertainty=false.' },
        },
      },
    },
    sharedContracts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'sourceOfTruth', 'introducedBy', 'extendedBy'],
        properties: {
          name: { type: 'string' },
          sourceOfTruth: { type: 'string', description: 'doc/code file where the contract lives' },
          introducedBy: { type: 'string', description: 'feature id that lands the minimum-viable form' },
          extendedBy: { type: 'array', items: { type: 'string' }, description: 'feature ids that add additive extensions' },
        },
      },
    },
    blockers: {
      type: 'array',
      description: 'things that must stop planning and go back to the human: a missing dependency, a spec that contradicts the code, a cited-but-missing doc',
      items: { type: 'string' },
    },
  },
}

const FEATURE_PLAN_SCHEMA = {
  type: 'object',
  required: ['featureId', 'chunks', 'testStrategy', 'contractTouchpoints', 'risks'],
  properties: {
    featureId: { type: 'string' },
    summary: { type: 'string', description: 'one paragraph: the chosen approach and why it wins over the alternatives the panel weighed' },
    chunks: {
      type: 'array',
      description: 'ordered build-and-test slices; each ends in one tickable checkbox item',
      items: {
        type: 'object',
        required: ['title', 'delivers', 'acceptanceCriteria', 'tests'],
        properties: {
          title: { type: 'string' },
          delivers: { type: 'string', description: 'what user/system-observable thing this chunk adds' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'which spec acceptance criteria this chunk satisfies' },
          tests: { type: 'string', description: 'the tests that prove this chunk (the criteria ARE the test spec) — name the test file(s)/target(s) so the build can run JUST these, not the whole suite' },
          contractTouchpoint: { type: 'string', description: 'name of any shared contract this chunk touches, or "none"' },
        },
      },
    },
    testStrategy: { type: 'string', description: 'unit/integration/contract/e2e mix; what the architecture-named risks demand; on-device/deployed-URL tests' },
    contractTouchpoints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['contract', 'action', 'signature'],
        properties: {
          contract: { type: 'string' },
          action: { type: 'string', enum: ['introduces', 'consumes', 'extends'] },
          signature: { type: 'string', description: 'the exact additive shape this feature needs frozen: the new type/enum member/union variant/optional field + the consumers that must stay exhaustive over it' },
        },
      },
    },
    manualSetup: { type: 'array', items: { type: 'string' }, description: 'anything a human must do an agent cannot (keys, devices, paid accounts)' },
    risks: { type: 'array', items: { type: 'string' }, description: 'what the contrarian flagged that survived synthesis' },
  },
}

const CONTRACT_SPEC_SCHEMA = {
  type: 'object',
  required: ['frozenContracts', 'buildOrder'],
  properties: {
    frozenContracts: {
      type: 'array',
      description: 'every shared shape, reconciled across ALL feature plans, with every feature’s additive extension pre-committed together with the consumers that must stay exhaustive',
      items: {
        type: 'object',
        required: ['name', 'sourceOfTruth', 'signature', 'extensions', 'exhaustiveConsumers'],
        properties: {
          name: { type: 'string' },
          sourceOfTruth: { type: 'string' },
          signature: { type: 'string', description: 'the minimum-viable frozen signature the build workflow will implement + commit before any feature work' },
          extensions: { type: 'array', items: { type: 'string' }, description: 'each feature’s additive member/variant/field, attributed to its feature id' },
          exhaustiveConsumers: { type: 'array', items: { type: 'string' }, description: 'every switch/validator/provider-schema that must handle all cases of this shape' },
        },
      },
    },
    // The ONLY ordering artifact: each feature + the feature ids it hard-depends
    // on. The build workflow schedules from this directly — a feature with an
    // empty `after` starts as soon as the contracts are frozen; the rest wait on
    // their deps. No parallel/serial lanes, no critical path, no convergence-risk
    // bookkeeping: the dependency edges ARE the schedule.
    buildOrder: {
      type: 'array',
      description: 'every feature with its hard-dependency edges, reconciled across all plans',
      items: {
        type: 'object',
        required: ['featureId', 'after'],
        properties: {
          featureId: { type: 'string' },
          after: { type: 'array', items: { type: 'string' }, description: 'feature ids that must finish before this one (it consumes their shipped behavior); empty = can start once contracts are frozen' },
        },
      },
    },
  },
}

// === Phase 1: Scope ========================================================

phase('Scope')

// FIND THE NEXT UNBUILT ITERATION. The user never passes the iteration — this
// finder IS the resolver, so it must be RIGHT, and it must REFUSE rather than
// guess, because the Persist phase writes onto whatever it returns (it once
// planned over an already-shipped iteration twice).
//
// The old heuristic ("every spec has a ### Build outcome + all boxes ticked")
// was too fragile: shipped iterations don't always carry that exact string, and
// DEFERRED-but-shipped boxes stay unticked — so it kept nominating shipped work.
// The reliable signals, in priority order, are what the build ACTUALLY leaves
// behind: STATUS.md (authoritative when present) > git history (a shipped
// iteration has build/<slug>+integration/<slug> branches and/or its features
// merged to the default branch) > BUILD-PLAN-<slug>.md presence/status > spec
// markers. The finder reads them in that order and STOPS on ambiguity.
if (!ITERATION_DIR && !LEGACY) {
  const finder = await agent(
    `Resolve the NEXT UNBUILT iteration to plan. Read-only — do NOT write anything. Whatever you return will be PLANNED OVER (its spec files written into), so it is critical you do NOT pick an iteration that is already built or shipped. When in doubt, STOP (set ambiguous=true) rather than guess.

Determine, for each iteration dir under \`docs/iterations/\` (in numeric order 01-, 02-, ...), whether it is ALREADY BUILT, using these signals in PRIORITY ORDER — a higher signal overrides a lower one:

1. \`docs/STATUS.md\` (authoritative if it exists): read it. It lists each iteration's status (shipped / building / blocked / not started). Trust it over everything below.
2. GIT HISTORY (strong; use the Bash tool): a built iteration leaves traces. Run e.g. \`git branch -a\` and \`git log --all --oneline\` and look, for each iteration's slug, for a \`build/<slug>\` or \`integration/<slug>\` branch, an MR/merge, or its feature commits on the default branch. An iteration whose work is merged into main is BUILT — never plan over it. (If this isn't a git repo or has no history, skip this signal.)
3. \`BUILD-PLAN-<slug>.md\` inside the iteration dir: its presence means the iteration was at least planned; a Status of "Approved" or anything past it means it is planned-or-built (not a fresh target).
4. SPEC MARKERS (weakest): a spec carrying a "### Build outcome" note is built; a "## Build plan (approved)" section means at least planned. Treat unticked checkboxes as INCONCLUSIVE on their own (DEFERRED items legitimately stay unticked in shipped iterations) — do not call an iteration "unbuilt" on unticked boxes alone if higher signals say it shipped.

The NEXT UNBUILT iteration is the FIRST one (numeric order) that is NOT built by the above and NOT already fully planned-and-building. Return it.

STOP CONDITIONS (set the flag and return, do NOT pick a target to write over):
- \`ambiguous=true\` if the signals CONFLICT for your candidate (e.g. git shows it merged but a spec lacks the outcome note), or you cannot confidently tell built from unbuilt. Explain in \`reason\`.
- \`allDone=true\` if every iteration is already built — the human likely needs to add a new iteration (don't return one to plan over).
- \`notFound=true\` if \`docs/iterations/\` doesn't exist.`,
    { label: 'find-next-iteration', phase: 'Scope', model: 'haiku', schema: {
      type: 'object',
      required: ['iterationDir'],
      properties: {
        iterationDir: { type: 'string', description: 'path to the chosen NEXT-UNBUILT iteration dir, e.g. docs/iterations/03-foo (empty if a stop condition fired)' },
        reason: { type: 'string', description: 'one line: the signals that show this is the next unbuilt one — and which signal decided it' },
        builtIterations: { type: 'array', items: { type: 'string' }, description: 'the iteration dirs you judged ALREADY BUILT, so the choice is auditable' },
        ambiguous: { type: 'boolean', description: 'true if signals conflict or you cannot confidently distinguish built from unbuilt — STOP instead of guessing' },
        allDone: { type: 'boolean', description: 'true if every iteration is already built' },
        notFound: { type: 'boolean', description: 'true if docs/iterations/ does not exist' },
      },
    } },
  )
  if (finder?.notFound) {
    log('⛔ No docs/iterations/ directory found. This project may use the legacy flat layout — re-invoke with featuresDir set.')
    return { stopped: true, reason: 'no-iterations-dir' }
  }
  if (finder?.ambiguous) {
    log(`⛔ Could not confidently resolve the next unbuilt iteration: ${finder.reason ?? 'signals conflict'}. Refusing to plan over a possibly-built iteration. Built (per the finder): ${(finder.builtIterations ?? []).join(', ') || 'unknown'}. Re-invoke naming the iteration dir to plan.`)
    return { stopped: true, reason: 'iteration-ambiguous', builtIterations: finder.builtIterations ?? [], finderReason: finder.reason }
  }
  if (finder?.allDone) {
    log(`⛔ Every iteration is already built (${(finder.builtIterations ?? []).join(', ')}). There is no next unbuilt iteration to plan — add a new one to the roadmap first, or name the iteration dir explicitly.`)
    return { stopped: true, reason: 'all-iterations-built', builtIterations: finder.builtIterations ?? [] }
  }
  if (!finder?.iterationDir) {
    log('⛔ The finder returned no iteration dir and no stop flag — refusing to guess a write target.')
    return { stopped: true, reason: 'finder-empty' }
  }
  ITERATION_DIR = finder.iterationDir
  log(`Next unbuilt iteration: ${ITERATION_DIR}${finder?.reason ? ` — ${finder.reason}` : ''}. Already-built (skipped): ${(finder.builtIterations ?? []).join(', ') || 'none'}.`)
}
resolveArtifactPaths()

// SAFETY GUARD (defense in depth): independently confirm the resolved target is
// NOT already built before any write. The Persist phase writes onto these spec
// files; planning over a shipped iteration is the failure this guards. A fresh
// agent (not the finder) re-checks the SAME hard signals; on built/ambiguous it
// HARD-STOPS. Cheap relative to corrupting shipped specs.
if (!LEGACY && ITERATION_DIR) {
  const guard = await agent(
    `Confirm whether the iteration at \`${ITERATION_DIR}\` is SAFE to plan — i.e. it is NOT already built or shipped. Read-only; do NOT write. The next phase writes plans INTO this dir's spec files, so a wrong "safe" corrupts shipped work — default to UNSAFE when unsure.

Check, in priority order: (1) \`docs/STATUS.md\` if present — does it mark this iteration shipped/built? (2) git history (Bash) — is there a \`build/<slug>\`/\`integration/<slug>\` branch for this iteration, or are its feature commits merged into the default branch? (3) the iteration's specs — do they carry "### Build outcome" notes indicating it shipped? If ANY of these says built/shipped, it is NOT safe.

Return safe=true ONLY if you are confident this iteration has not been built. Otherwise safe=false with the evidence.`,
    { label: 'guard-not-built', phase: 'Scope', model: 'haiku', schema: {
      type: 'object',
      required: ['safe'],
      properties: {
        safe: { type: 'boolean', description: 'true ONLY if confident the iteration is not yet built (safe to plan over)' },
        evidence: { type: 'string', description: 'what you found — the signal that decided it' },
      },
    } },
  )
  if (!guard?.safe) {
    log(`⛔ Safety guard refused to plan \`${ITERATION_DIR}\`: it appears already built/shipped. ${guard?.evidence ?? ''} Refusing to write plans onto a built iteration. If this is wrong, name a different iteration dir explicitly.`)
    return { stopped: true, reason: 'target-already-built', iterationDir: ITERATION_DIR, evidence: guard?.evidence }
  }
}

const scopeBrief = `You are scoping the build of ONE roadmap iteration. This is read-only reconnaissance — do NOT write or commit anything.

${
  LEGACY
    ? `This project uses the LEGACY FLAT layout: feature specs live directly in \`${FEATURES_DIR}\` as NN-<slug>.md files, and the iteration grouping lives in the roadmap / each spec's "Iteration:" field (there is no per-iteration directory). Read, in order:
1. The roadmap at \`${ROADMAP}\` — the iteration arc, the cross-cutting contracts table (each contract cites the ADR that decided it), and the per-feature hard-dependency edges.
2. The feature specs in \`${FEATURES_DIR}\`. ${ITERATION ? `Select ONLY the specs belonging to iteration "${ITERATION}" (by the roadmap's grouping or each spec's "Iteration:" field).` : 'No iteration was named — infer the iteration to plan from the roadmap (prefer the earliest not-yet-built one) and report which you chose in iterationName.'}`
    : `Iterations are the top-level unit: \`${ITERATION_DIR}\` is an iteration directory holding its nested feature specs (NN-<slug>.md) and nothing else (there is no README). Read, in order:
1. The roadmap at \`${ROADMAP}\` — find THIS iteration in the iteration arc (its one-sentence goal), the features index (this iteration's features + their hard-dependency edges), and the cross-cutting contracts table (each contract citing the ADR that decided it). The roadmap is where the iteration goal + dependency edges + contracts live now.
2. EVERY feature spec nested in \`${ITERATION_DIR}\` (the NN-<slug>.md files — these are the features to plan; each spec carries its own hard deps and the contracts it touches).
3. The ADRs the contracts cite, so you carry the real contract shapes forward to the freeze step.

If \`${ITERATION_DIR}\` does not exist, the project may use the legacy flat \`docs/features/\` layout instead — fall back to reading the roadmap + the flat specs dir, select this iteration's specs, and set a blocker noting the layout mismatch so the human can re-invoke with featuresDir set.`
}
${ITERATION ? `(Iteration: "${ITERATION}".)` : ''}
${EXPLICIT_FEATURES ? `Plan ONLY these features (override the dir's set): ${EXPLICIT_FEATURES.join(', ')}.` : ''}

LEARN FROM ALREADY-BUILT ITERATIONS (the compound loop). Before planning, skim the EARLIER iteration directories (the lower-numbered ones under docs/iterations/, or earlier specs in the flat dir) for what the build stage recorded there: each built feature's spec carries a "### Build outcome" note (under its "## Build plan (approved)" section) and may carry Implementation-notes/retro lessons; durable lessons may also have landed in ROADMAP.md or ADRs. Pull forward anything that should shape THIS iteration's plan — a contract that needed an extra variant in practice, a feature that proved harder/simpler than scoped, a pattern flagged as a footgun, a test approach that worked. Don't re-plan finished work; just let what the project already learned inform the plans you draft now. (If no earlier iterations are built yet, skip this.)

Then, for EACH feature you'll plan:
- Read its spec in full: description, dependencies, acceptance criteria, testing requirements, manual setup.
- VERIFY its stated dependencies actually exist in the code (inspect the real code of dependency features, not just the plan). Set dependenciesVerifiedInCode accordingly. Trust the code over the plan where they diverge.
- Identify which shared contracts it introduces/consumes/extends.
- Set \`highUncertainty\` deliberately, and when true give a CONCRETE \`highUncertaintyReason\`. Default FALSE — a routine feature that extends an established pattern gets a single planning pass. Set TRUE only when the APPROACH is genuinely unsettled and worth three independent planning drafts: it introduces a load-bearing shared contract, involves a novel/subtle algorithm or a real security/concurrency boundary, or the spec leaves the approach materially open — and NAME which of these in highUncertaintyReason (the specific contract, algorithm, boundary, or open question). A vague reason won't trigger the panel; if you can't name a concrete one, set false. This is RARE — most iterations have ZERO such features. Flagging everything high-uncertainty defeats the point and burns tokens.
- Set \`dependsOn\` to the feature ids this one HARD-depends on (it consumes their not-yet-shipped RUNTIME BEHAVIOR). This is the only ordering signal the build uses, so keep it minimal and real. A contract-mediated soft dep is NOT a hard dep: the build's contract barrier freezes + lands EVERY shared contract before any feature work, so a feature that merely consumes or extends a contract another feature introduces builds against the frozen shape and must NOT depend on that feature — leave the edge OUT. Over-declaring here is the dominant cause of a slow serial build: a spurious "after the feature that owns the contract" edge forces features that could run concurrently to run one-at-a-time, idling worktree slots. Ask for each candidate edge: "do I need their actual implemented behavior, or just the shared shape they freeze?" — only the former is a hard dep.
- Set \`stack\` to the feature's primary domain (one kebab token like "python-backend", "react-frontend", "go") — the build routes the implementer and reviewer to that stack's specialist agent, so a wrong/absent stack just falls back to a generalist. Pick the dominant layer for a feature that spans several.

Plan ALL the iteration's features — the independent ones AND the hard-dependent ones; do NOT drop a feature for having a hard dep. The build workflow serializes a feature behind its \`dependsOn\` automatically and runs everything else concurrently. Only raise a blocker when a dependency is genuinely MISSING FROM THE CODE, never merely because it builds later.

Populate \`blockers\` with anything that needs a HUMAN before the build can run autonomously: a missing dependency, a spec contradicting the code, a cited-but-missing doc, OR an open decision only the human can make (an ambiguous acceptance criterion, an unresolved approach choice, a needed key/account, a "confirm X at approval" question). The build runs autonomously and CANNOT ask the human anything — so every such item MUST be a blocker here, NOT a passive "to be confirmed later" note buried in a spec. The orchestrator drains these with the human at approval and records the answers; an approved plan has zero open questions. Be precise — state each blocker as the specific decision or fact needed.

Return the structured scope.`

// Sonnet: scoping is read-and-extract — read specs, verify deps exist in code,
// fill the schema. The one judgment call (highUncertainty) is rubric-driven and
// a wrong call only over/under-invests one feature's planning. (Was opus.)
const scope = await agent(scopeBrief, { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, model: 'sonnet' })

if (scope.blockers && scope.blockers.length) {
  log(`⛔ ${scope.blockers.length} blocker(s) found during scoping — planning will surface these for the human, not proceed past them.`)
}

const featuresToplan = scope.features ?? []
if (!featuresToplan.length) {
  log('No buildable features in scope (empty iteration or blocked). Returning scope only.')
  return { scope, featurePlans: [], contractSpec: null, blocked: true }
}

// === Phase 2: Plan (one planner per feature) ===============================
// This is the deep-reasoning step — "how best to build it" — and the one place
// that stays on OPUS. DEFAULT: one opus agent per feature reads the spec/ADRs/
// dep-code ONCE and reasons through all three lenses (architect / reuse /
// contrarian) folded into a single pass; the lenses are a CHECKLIST in the
// prompt, not 3 agents. A feature the scope step flagged highUncertainty (or a
// run forced with args.multiDraft) escalates to the 3-independent-draft + synth
// panel, where draft diversity earns the extra agents — this is RARE. Features
// plan concurrently (they're independent until the contract reconciliation).

phase('Plan')

// Build a TARGETED reading brief per feature so the planner reads narrowly
// instead of re-ingesting the whole architecture cold (the ~3.6M-token
// re-read across ~10 plan agents). Scope already identified which contracts bind
// this feature (touchesContracts) and where each lives (sourceOfTruth), and which
// features it hard-depends on — name those so the planner reads JUST them.
function readingBrief(f) {
  const bound = (scope.sharedContracts ?? []).filter((c) =>
    (f.touchesContracts ?? []).includes(c.name),
  )
  const adrList = bound.length
    ? bound.map((c) => `  - "${c.name}" → source of truth: ${c.sourceOfTruth}`).join('\n')
    : '  - (this feature touches no shared contract — skip contract/ADR reading)'
  const deps = (f.dependsOn ?? [])
  const depList = deps.length ? deps.join(', ') : '(none — no dependency code to read)'
  return `READ NARROWLY — do NOT ingest the whole architecture. Read ONLY:
  1. This feature's spec: \`${f.specPath}\` (in full).
  2. ONLY the specific contract source-of-truth files/ADRs that bind THIS feature (not the whole adrs/ dir):
${adrList}
  3. ONLY the implemented code of the feature(s) this one HARD-depends on: ${depList}.
Anything outside this list is out of scope for planning this feature — if the spec cites something not listed, note it as a risk rather than reading the entire corpus to chase it.`
}

const SINGLE_PASS_PLAN = (f) =>
  `Draft the build plan for feature ${f.id} ("${f.title}") in ONE pass.

${readingBrief(f)}

Reason through THREE lenses and fold them into a single plan:
• ARCHITECT: ordered vertical-slice chunks, each test-first, each satisfying named acceptance criteria; honor every locked ADR + existing code pattern; smallest change that satisfies each criterion; name which chunks touch shared contracts and the exact additive signature each needs frozen.
• RESEARCHER (reuse): what library/pattern does the existing code already use for this kind of work? footguns / version / platform limits the spec misses? a simpler path using something already in the tree? Maximize reuse; flag technology risk.
• CONTRARIAN (traps): where are acceptance criteria ambiguous/untestable? where does the spec assume a contract that doesn't exist? riskiest chunk + why? hidden scope creep? Route the plan AROUND these and carry the survivors into \`risks\`.
• SIMPLICITY (factoring): is this the SIMPLEST design that satisfies the criteria? Cut any speculative abstraction, premature generalization, indirection layer, or config knob the spec doesn't require — "we might need it" is a defect, not foresight. Prefer fewer moving parts, plain functions over frameworks-for-one-use, the obvious data shape. The plan should read as the smallest well-factored thing that works.
For each chunk name the specific test file(s)/target(s) that prove it, so the build can run JUST those tests (not the whole suite). Pin the exact frozen signature for every contract touchpoint. Return the structured plan.`

// ESCAPE HATCH (rare): a highUncertainty feature — or a run forced via
// args.multiDraft — gets THREE independent drafts + a synth, because for a
// genuinely unsettled approach the diversity of independent drafts earns the
// extra agents. Most features take the single-pass path above.
const FORCE_MULTIDRAFT = args?.multiDraft === true
const LENSES = [
  { key: 'architect', prompt: (f) => `You are a senior software ARCHITECT drafting an implementation approach for feature ${f.id} ("${f.title}").

${readingBrief(f)}

Propose the build as ordered vertical-slice chunks, each test-first, each satisfying named acceptance criteria. Honor every locked ADR decision and the existing code patterns. Favor the smallest change that satisfies each criterion. Name which chunks touch shared contracts and the exact additive signature each needs frozen, and name each chunk's specific test target(s). Return your draft plan.` },
  // The researcher's job IS to range across the repo for reuse, so it keeps repo-
  // search latitude — but it still starts from the feature's spec + bound contracts.
  { key: 'researcher', prompt: (f) => `You are a RESEARCHER pressure-testing the approach for feature ${f.id} ("${f.title}"). Start from its spec at \`${f.specPath}\` and the contracts that bind it (${(f.touchesContracts ?? []).join(', ') || 'none'}). Then investigate the repo for reuse: what library/pattern does the existing code already use for this kind of work? footguns, version constraints, platform limits the spec misses? a simpler path using something already in the tree? Return a plan that maximizes reuse and flags technology risk, with the same chunk/test-target/contract structure.` },
  { key: 'contrarian', prompt: (f) => `You are a CONTRARIAN / skeptical senior engineer reviewing feature ${f.id} ("${f.title}").

${readingBrief(f)}

Find what's WRONG with the obvious approach: where will acceptance criteria be ambiguous/untestable? where does the spec assume a contract that doesn't exist? riskiest chunk + why? hidden scope creep? Return a plan that routes around the traps, plus an explicit \`risks\` list of what a builder must not get wrong.` },
]

// Features that INTRODUCE a load-bearing shared contract — the objective signal
// that a feature is genuinely approach-unsettled enough to earn draft diversity.
// (A feature that only consumes/extends a contract builds against a shape someone
// else froze; it is not the one whose design is open.) Derived from the scope's
// sharedContracts[].introducedBy, so it doesn't rely on a Sonnet agent's
// subjective highUncertainty boolean alone.
const CONTRACT_INTRODUCERS = new Set(
  (scope.sharedContracts ?? []).map((c) => c.introducedBy).filter(Boolean),
)

// Evidence gate: the 4-Opus-agent panel is the single biggest plan-phase cost
// (one panel = ~4× a single-pass plan), so it fires RARELY. A forced run
// (args.multiDraft) bypasses the gate. Otherwise BOTH must hold: (a) the scope
// agent flagged highUncertainty with a CONCRETE ≥20-char reason, AND (b) the
// feature actually INTRODUCES a load-bearing shared contract — the objective
// condition that makes the approach genuinely open. A feature the scope agent
// merely *felt* was tricky, but that introduces no contract, falls to the
// single-pass planner. This keeps the panel to the one or two foundational
// features per iteration that truly earn it (e.g. the skeleton that freezes the
// shared shapes), not every feature an optimistic scope pass flagged.
function panelJustified(f) {
  if (FORCE_MULTIDRAFT) return true
  if (f.highUncertainty !== true) return false
  const reason = String(f.highUncertaintyReason ?? '').trim()
  if (reason.length < 20) return false // a real, specific reason — not "" or "complex"
  return CONTRACT_INTRODUCERS.has(f.id) // structural backstop: must own a contract
}

async function planFeature(f) {
  const multi = panelJustified(f)
  if (!multi) {
    // Single-pass planner (the common path). A feature the scope flagged
    // highUncertainty still lands here unless it ALSO introduces a shared
    // contract — the panel is reserved for the foundational contract-owning slice.
    if (f.highUncertainty === true) {
      const why = String(f.highUncertaintyReason ?? '').trim().length < 20
        ? 'no concrete reason'
        : 'introduces no shared contract'
      log(`${f.id}: highUncertainty flagged but ${why} — using the single-pass planner (panel reserved for contract-introducing features).`)
    }
    return agent(SINGLE_PASS_PLAN(f), { label: `plan:${f.id}`, phase: 'Plan', schema: FEATURE_PLAN_SCHEMA, model: 'opus' })
  }
  // High-uncertainty (justified): three independent drafts → synth.
  const drafts = (
    await parallel(LENSES.map((lens) => () => agent(lens.prompt(f), { label: `draft:${f.id}:${lens.key}`, phase: 'Plan', model: 'opus' })))
  ).filter(Boolean)
  return agent(
    `You are the lead engineer synthesizing ONE build plan for feature ${f.id} ("${f.title}") from three independent drafts (architect, researcher, contrarian). Spec: \`${f.specPath}\`.

The three drafts:

${drafts.map((d, i) => `--- DRAFT ${i + 1} ---\n${d}`).join('\n\n')}

Produce the single best plan: take the architect's structure, graft the researcher's reuse wins, and route around every trap the contrarian found (carry the survivors into \`risks\`). Every chunk must be a coherent test-first build-and-test slice ending in one tickable item, naming the specific test target(s) that prove it. Pin the exact frozen signature for every contract touchpoint. Return the structured plan.`,
    { label: `synth:${f.id}`, phase: 'Plan', schema: FEATURE_PLAN_SCHEMA, model: 'opus' },
  )
}

const multiCount = featuresToplan.filter(panelJustified).length
log(`Planning ${featuresToplan.length} feature(s): ${featuresToplan.length - multiCount} single-pass, ${multiCount} multi-draft (justified high-uncertainty).`)

const featurePlans = await parallel(featuresToplan.map((f) => () => planFeature(f)))

const goodPlans = featurePlans.filter(Boolean)
log(`Planned ${goodPlans.length}/${featuresToplan.length} feature(s).`)

// === Phase 3: Contracts (reconcile across all features) ====================
// BARRIER on purpose: locking shared contracts needs ALL feature plans at once,
// so it can pre-commit every feature's additive extension together with the
// consumers that must stay exhaustive. This is the single most important step —
// building before the contract shape is frozen is how concurrent work diverges.
// Stays on OPUS: freezing a shared shape wrong is expensive.
//
// It receives ONLY the contract touchpoints projected out of each feature plan
// (not the full chunks/tests/risks — that whole-plan JSON was the biggest token
// sink in this phase). Build order comes from the scope's dependsOn edges.

phase('Contracts')

// Project just what the integrator needs: each feature's contract touchpoints,
// and the hard-dependency edges (for build order). Not the full plans.
const touchpointsByFeature = goodPlans.map((p) => ({
  featureId: p.featureId,
  contractTouchpoints: p.contractTouchpoints ?? [],
}))
const depEdges = (scope.features ?? []).map((f) => ({ featureId: f.id, after: f.dependsOn ?? [] }))

const contractSpec = await agent(
  `You are the integrator locking the shared contracts for the build BEFORE any code is written.

Declared shared contracts (from scope — each names its source of truth, normally the ADR that decided it):
${JSON.stringify(scope.sharedContracts ?? [], null, 2)}

Each feature's contract touchpoints (what it introduces/consumes/extends + the signature it needs):
${JSON.stringify(touchpointsByFeature, null, 2)}

Hard-dependency edges (a feature consumes another's shipped behavior → must build after it):
${JSON.stringify(depEdges, null, 2)}

THE ARCHITECTURE IS THE AUTHORITY. Before freezing anything, READ the source-of-truth ADR each contract cites (e.g. docs/adrs/ADR-NNN-*.md) and any existing code at that source of truth. The ADR already decided the contract's shape and rationale — freeze a signature CONSISTENT with it, do not re-decide or contradict it. If a feature's needed touchpoint can't be reconciled with its ADR (the ADR forbids the shape it needs, or two features need incompatible extensions the ADR doesn't anticipate), that's an architecture gap: do NOT paper over it with an improvised contract — note it so the human can resolve it at the ADR. If a contract cites no ADR, treat the existing code + the feature touchpoints as the authority and freeze the minimum-viable shape.

Do two things:
1. RECONCILE every shared contract across all features into ONE frozen spec, consistent with the cited ADRs. For each contract, pre-commit EVERY feature's additive extension (new enum member / union variant / optional wire field) TOGETHER with every consumer that must stay exhaustive over it (every switch, validator, provider schema). A shared extensible type and the code that must handle all its cases are ONE contract — landing the members up front turns N late breaks into zero. Give each a minimum-viable frozen \`signature\` the build workflow will implement and commit before any feature work.
2. Emit \`buildOrder\`: one entry per feature with its \`after\` list (the hard-dep edges above, deduped and reconciled — a feature with no hard dep gets an empty \`after\`). This is the ONLY ordering artifact; the build schedules from it directly. Do NOT invent parallel/serial lanes, a critical path, or convergence bookkeeping — the dependency edges ARE the schedule.

Return the structured contract spec. Do NOT write or commit code — you are specifying signatures for the build phase to implement.`,
  { label: 'lock-contracts', phase: 'Contracts', schema: CONTRACT_SPEC_SCHEMA, model: 'opus' },
)

// === Phase 4: Persist (specs + index) ======================================
// TWO artifacts, no duplication between them:
//  - The per-spec "## Build plan (approved)" section is the SINGLE source of
//    truth for HOW each feature is built (chunks, tests, contract touchpoints,
//    risks). The build workflow reads it per feature.
//  - The BUILD-PLAN-<slug>.md is a pure ORCHESTRATION INDEX: slug, build branch,
//    frozen contracts, dependency order, and LINKS to each spec's plan section.
//    It does NOT re-state chunk-level detail — it points at it.

phase('Persist')

// Write each feature's plan into its spec file, in parallel (disjoint files).
await parallel(
  goodPlans.map((plan) => () => {
    const feat = featuresToplan.find((f) => f.id === plan.featureId)
    return agent(
      `Persist the approved build plan for feature ${plan.featureId} into its spec file \`${feat?.specPath}\`. This section is the SINGLE source of truth for how this feature is built — the orchestration index will link here, not duplicate it.

FIRST, A SAFETY CHECK: read the spec file. If it ALREADY contains a "### Build outcome" note (it was already built/shipped), do NOT write anything — STOP and report alreadyBuilt=true with the existing outcome line. Planning over a shipped spec corrupts it; refuse. (An existing "## Build plan (approved)" section WITHOUT a build outcome is a re-plan of unbuilt work — that's fine; replace that section in place.)

If safe, append (in or above the spec's "Implementation notes" section) a "## Build plan (approved)" section as a Markdown CHECKBOX list — one \`- [ ]\` item per chunk, in order, each line stating: the chunk title, what it delivers, the acceptance criteria it satisfies, the specific test target(s) that prove it, and its contract touchpoint. Then a "### Test strategy", "### Contract touchpoints" (contract / action / frozen signature), "### Manual setup", and "### Risks" subsection from the plan below.

This is pure transcription of the plan below into Markdown — do NOT summarize, reword, omit, or reorder it, and do NOT alter ANY existing content in the spec (read the file, insert the new section, leave every other byte unchanged).

The plan:
${JSON.stringify(plan, null, 2)}

After writing, confirm the file path and the number of checkbox items written — or, if you refused, report alreadyBuilt=true and what you found.`,
      // Haiku: pure transcription of structured plan JSON into a Markdown section,
      // inserted into a spec the human reviews at the approval gate. No judgment —
      // EXCEPT the alreadyBuilt refusal, the last line of defense against planning
      // over a shipped spec.
      { label: `persist:${plan.featureId}`, phase: 'Persist', model: 'haiku', schema: {
        type: 'object',
        required: ['written'],
        properties: {
          written: { type: 'boolean', description: 'true if the build plan section was written; false if refused' },
          alreadyBuilt: { type: 'boolean', description: 'true if you refused because the spec already has a ### Build outcome (shipped)' },
          path: { type: 'string' },
          checkboxItems: { type: 'integer' },
          note: { type: 'string' },
        },
      } },
    )
  }),
).then((results) => {
  // If any spec refused as already-built, the target was a shipped iteration that
  // slipped past the finder + guard — surface it loudly; the human should re-check.
  const refused = (results ?? []).filter((r) => r && r.alreadyBuilt)
  if (refused.length) {
    log(`⚠️ ${refused.length} spec(s) refused to be overwritten because they are already built/shipped — the resolved iteration \`${ITERATION_DIR}\` may be wrong. Review before approving; nothing was committed.`)
  }
  return results
})

// Write the orchestration INDEX the build workflow reads. It links to the
// per-spec plans rather than duplicating them. Sonnet: this is templating the
// structured data below into Markdown — mechanical, not reasoning. (Was opus.)
const buildOrder = contractSpec.buildOrder ?? depEdges
const indexFeatures = (scope.features ?? []).map((f) => {
  const order = buildOrder.find((b) => b.featureId === f.id)
  // Carry `stack` so the build can route each feature's builder + reviewer to a
  // stack specialist; omitted when scope didn't tag it (build falls back to a
  // generalist).
  const entry = { id: f.id, specPath: f.specPath, title: f.title, after: order?.after ?? (f.dependsOn ?? []) }
  if (f.stack) entry.stack = f.stack
  return entry
})

await agent(
  `Write the build orchestration index to \`${MANIFEST_PATH}\`. The build workflow (kmaz-build-iteration) consumes it. Overwrite any existing file. This is an INDEX — it links to each spec's "Build plan (approved)" section, it does NOT restate chunk-level detail.

Use this structure (Markdown prose for humans, plus ONE fenced \`\`\`json block holding the machine-readable index):

# Build plan — ${scope.iterationName}

**Status:** Awaiting approval · **Iteration goal:** ${scope.iterationGoal ?? ''} · **Iteration slug:** \`${ITERATION_SLUG}\`

## How to use this
1. A human reviews this index + the per-feature "Build plan (approved)" sections in each spec and approves it in conversation. The assistant flips Status to "Approved" and commits — the human does NOT edit this file.
2. When the human is ready, they run the build workflow: it implements + commits the frozen contracts first, then builds each feature in its own worktree (independent features concurrently, hard-dependent ones after their deps), reviews each, opens ONE MR, and records each feature's outcome back into its spec. Every artifact is scoped to the iteration slug above, so this iteration can build concurrently with others.

## Blockers
${(scope.blockers && scope.blockers.length) ? scope.blockers.map((b) => `- ${b}`).join('\n') : '- None.'}

## Frozen contracts (implemented first, before any feature work)
A table of each contract: name, source of truth, frozen signature, the per-feature extensions, the exhaustive consumers.

## Features & build order
A table: feature id → spec path (linked) → its "Build plan (approved)" section → \`stack\` (the specialist domain) → \`after\` (the feature ids it builds after; empty = starts once contracts are frozen).

Then embed the machine-readable index as a fenced json block with EXACTLY these keys: { iterationName, iterationSlug: "${ITERATION_SLUG}", buildBranch: "build/${ITERATION_SLUG}", iterationGoal, blockers, frozenContracts, features: [{id, specPath, title, stack, after}] }. Preserve each feature's \`stack\` exactly as given in the source data below (omit the key for a feature that has none). iterationSlug and buildBranch MUST be exactly as given here — the build workflow scopes every artifact to them so iterations don't collide.

Source data:
FROZEN CONTRACTS: ${JSON.stringify(contractSpec.frozenContracts ?? [], null, 2)}
FEATURES (with build order): ${JSON.stringify(indexFeatures, null, 2)}
BLOCKERS: ${JSON.stringify(scope.blockers ?? [], null, 2)}

After writing, confirm the path.`,
  { label: 'write-index', phase: 'Persist', model: 'sonnet' },
)

log(`Plan complete. Present ${MANIFEST_PATH} + each spec's "Build plan (approved)" section to the human for approval.`)
// Cost visibility: rough output-token spend for this plan run (shared turn pool).
try { log(`Spend: ~${Math.round(budget.spent() / 1000)}k output tokens so far this turn (${goodPlans.length} feature(s) planned, ${multiCount} via the multi-draft panel).`) } catch {}

const _blocked = scope.blockers && scope.blockers.length
return {
  iteration: scope.iterationName,
  iterationSlug: ITERATION_SLUG,
  manifestPath: MANIFEST_PATH,
  buildBranch: `build/${ITERATION_SLUG}`,
  blockers: scope.blockers ?? [],
  featureCount: goodPlans.length,
  features: goodPlans.map((p) => p.featureId),
  frozenContractCount: (contractSpec.frozenContracts ?? []).length,
  // The plan is written with Status "Awaiting approval". A workflow can't take
  // mid-run input, so approval happens in conversation: present the plan, and on
  // the human's verbal approval the ASSISTANT (not the human) edits the plan's
  // Status line to "Approved" and commits it — then STOPS. Launching the build
  // stays user-triggered; do NOT auto-run it.
  // The orchestrator OWNS getting this plan to a clean Approved state. The build
  // workflow is autonomous and cannot take input — so it must NEVER be the thing
  // that surfaces an open question. An Approved plan has ZERO unresolved items:
  // every blocker AND every open human-decision (anywhere in the manifest or the
  // per-spec plans) is resolved with the human, the answer recorded into the
  // plan, BEFORE Status flips to Approved. If the orchestrator flips Approved
  // with anything still open, the build will refuse and the pipeline is blocked —
  // which is the orchestrator's failure to finish approval, not a build problem.
  nextStep: _blocked
    ? `Plan has ${scope.blockers.length} blocker(s): ${scope.blockers.map((b) => `"${b}"`).join('; ')}. You (the orchestrator) MUST resolve every one with the human now — get their decision, record it into the plan (the relevant spec or the manifest), and remove the blocker. Only when NO blocker remains do you flip Status to Approved. Do NOT flip Approved with blockers standing, and do NOT hand the human a build they'll have to babysit.`
    : `Present AND TEACH the plan to the human (${MANIFEST_PATH} + the per-spec "Build plan (approved)" sections) — the approval gate is a teaching moment, not a yes/no. Walk them through: WHY the iteration was sliced into these features in this dependency order; which contracts got frozen and what each commits the build to; where the risk concentrates; which features build concurrently vs. serialize.

CRITICAL — finish approval completely before flipping the status. SCAN the manifest AND every per-spec "Build plan (approved)" section for ANY open human-decision, "confirm at approval", "TBD", or unresolved choice. For EACH, get the human's decision now and RECORD it into the plan (edit the spec/manifest so the decision is locked in writing). The build workflow runs autonomously and CANNOT ask the human anything — so if you leave ANY open item, the build will refuse to start and the human is stuck. An Approved plan has ZERO open questions.

THEN, once everything is resolved and recorded and the human has verbally approved: edit ${MANIFEST_PATH}'s "Status: Awaiting approval" → "Status: Approved", clear/confirm the Blockers section reads "None", and git-commit just the plan files you changed (the human does not edit them). THEN tell the human they can run kmaz-build-iteration with args "${MANIFEST_PATH}" when ready — do NOT launch the build yourself, but the plan you hand off must be one the build can run start-to-finish without asking them a single question.`,
}
