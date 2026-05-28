export const meta = {
  name: 'kmaz-plan-iteration',
  description:
    'Plan a parallel build of an iteration: read roadmap + feature specs, draft each feature from independent angles (architect/researcher/contrarian), synthesize a build plan per feature, and emit per-spec checkbox plans + a BUILD-PLAN.md manifest (DAG, model tiers, frozen contract signatures) for human approval before any code is built.',
  whenToUse:
    'Run BEFORE building several independent features from one roadmap iteration in parallel. Produces the reviewable plan that kmaz-build-iteration consumes. The manifest is name-scoped to the iteration (and records an iteration slug the build uses to scope its branch/worktrees/report), so multiple iterations can be planned and built concurrently without colliding. You approve the plan in conversation, then launch the build workflow.',
  phases: [
    { title: 'Scope', detail: 'read the iteration dir (overview + nested feature specs) + roadmap; verify dependencies exist in code' },
    { title: 'Plan', detail: 'per feature: architect + researcher + contrarian draft, judged into one build plan' },
    { title: 'Contracts', detail: 'reconcile the per-feature plans into one frozen shared-contract spec + build DAG' },
    { title: 'Persist', detail: 'write per-feature checkbox plans into specs + BUILD-PLAN.md manifest' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-plan-iteration — Phase 1 of the two-phase parallel-feature build.
//
// WHY a workflow and WHY two phases: workflows move the orchestration into code
// (the coordinator's context holds only the final result, not every agent's
// output) and scale past what one conversation can coordinate. But a workflow
// CANNOT take mid-run user input — so the human plan-approval gate the
// kmaz-feature-builder skill insists on cannot live mid-run. The fix (per the
// Claude Code workflows docs: "for sign-off between stages, run each stage as
// its own workflow") is to split planning from building. THIS workflow emits a
// complete, reviewable plan and STOPS. The human approves it in conversation.
// Then kmaz-build-iteration builds autonomously from the approved artifact.
//
// This workflow writes plans + a manifest. It does NOT commit implementation
// code — contracts are SPECIFIED here (signatures in the manifest) and
// IMPLEMENTED by the build workflow's first barrier agent, so no code lands
// before the human approves.
//
// The current roadmap stage (kmaz-architecture-to-roadmap) lays out iterations
// as the TOP-LEVEL unit: docs/iterations/NN-<slug>/ holds an iteration overview
// (README.md) + its nested feature specs (MM-<slug>.md). This workflow is
// pointed at ONE iteration directory and plans every feature spec inside it.
// The manifest is written INTO that iteration directory so each iteration's
// build plan lives with its iteration.
//
// LEGACY LAYOUT: older projects use a FLAT docs/features/ directory of
// NN-<slug>.md specs, with the iteration grouping living only in ROADMAP.md /
// a spec's "Iteration:" field. This workflow handles both — the Scope agent
// detects which layout the project uses. Pass `featuresDir` and `iteration` to
// target a legacy project (plan only that iteration's specs out of the flat
// dir); the manifest then defaults next to ROADMAP.md instead of an iteration
// dir that doesn't exist.
//
// PARALLEL ITERATIONS: every artifact this workflow emits is name-scoped to the
// iteration so two iterations can be planned (and later built) concurrently
// WITHOUT colliding. In the current layout the per-iteration directory already
// scopes the manifest; in the legacy flat layout the manifest filename carries
// the iteration slug (docs/BUILD-PLAN-<slug>.md, not a single shared
// docs/BUILD-PLAN.md). The slug is also written into the manifest so the build
// workflow can scope ITS artifacts (build branch, worktrees, report) to the
// same iteration. An unscoped name here is the bottleneck that serializes
// iterations — don't reintroduce one.
//
// `args` (all optional):
//   { iterationDir?: string,   // current layout: the iteration dir to plan (default: docs/iterations/01-*)
//     featuresDir?: string,    // legacy layout: flat specs dir (e.g. docs/features); set this for legacy projects
//     iterationSlug?: string,  // explicit slug to name-scope artifacts; else derived from iteration/iterationDir
//     roadmap?: string,        // path to ROADMAP.md (default: docs/ROADMAP.md) for cross-iteration context
//     iteration?: string,      // iteration name/number to plan — REQUIRED for legacy flat layout to scope the batch
//     features?: string[],     // explicit spec paths/ids to plan (overrides the dir's feature set)
//     manifestPath?: string }  // override manifest path (default: <iterationDir>/BUILD-PLAN.md, or docs/BUILD-PLAN-<slug>.md legacy)
// ---------------------------------------------------------------------------

const FEATURES_DIR = args?.featuresDir ?? null // legacy flat layout when set
const LEGACY = FEATURES_DIR !== null
const ITERATION_DIR = args?.iterationDir ?? 'docs/iterations/01-*'
const ROADMAP = args?.roadmap ?? 'docs/ROADMAP.md'
const ITERATION = args?.iteration ?? null
const EXPLICIT_FEATURES = Array.isArray(args?.features) ? args.features : null

// Slug that name-scopes every artifact. Prefer an explicit slug; else derive
// from the iteration name, else from the iteration-dir basename. Falls back to
// 'iteration' only when nothing is known (single-iteration use is then still
// correct; concurrent use should pass iteration/iterationSlug).
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
const ITERATION_SLUG =
  (args?.iterationSlug && slugify(args.iterationSlug)) ||
  (ITERATION && slugify(ITERATION)) ||
  (!ITERATION_DIR.includes('*') && slugify(ITERATION_DIR.replace(/\/$/, '').split('/').pop())) ||
  'iteration'

const MANIFEST_PATH =
  args?.manifestPath ??
  (LEGACY ? `docs/BUILD-PLAN-${ITERATION_SLUG}.md` : `${ITERATION_DIR.replace(/\/$/, '')}/BUILD-PLAN.md`)

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
        required: ['id', 'specPath', 'title', 'oneLineBeforeAfter', 'dependsOn', 'parallelWith', 'touchesContracts'],
        properties: {
          id: { type: 'string', description: 'feature id, e.g. F-03' },
          specPath: { type: 'string', description: 'path to the nested feature spec, e.g. docs/iterations/01-skeleton/02-foo.md' },
          title: { type: 'string' },
          oneLineBeforeAfter: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'feature ids this consumes shipped behavior from (these force serial order, NOT contract-mediated soft deps)' },
          parallelWith: { type: 'array', items: { type: 'string' } },
          touchesContracts: { type: 'array', items: { type: 'string' }, description: 'names of shared contracts this feature introduces, consumes, or extends' },
          dependenciesVerifiedInCode: { type: 'boolean', description: 'true only if the stated dependencies actually exist in the code, not just the plan' },
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
        required: ['title', 'delivers', 'acceptanceCriteria', 'tests', 'tier', 'parallelism'],
        properties: {
          title: { type: 'string' },
          delivers: { type: 'string', description: 'what user/system-observable thing this chunk adds' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'which spec acceptance criteria this chunk satisfies' },
          tests: { type: 'string', description: 'the tests that prove this chunk (the criteria ARE the test spec)' },
          tier: { type: 'string', enum: ['Opus', 'Sonnet'], description: 'Sonnet only if isolated + well-specified + mechanical; Opus if contract-touching/novel/integration' },
          tierReason: { type: 'string', description: 'REQUIRED if tier=Opus: contract / novel / integration. No reason => mis-tier, default Sonnet.' },
          parallelism: { type: 'string', description: '"parallel" or "serial after <chunk title>"' },
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
  required: ['frozenContracts', 'buildDAG', 'criticalPath'],
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
          signature: { type: 'string', description: 'the minimum-viable frozen signature the barrier agent will implement + commit' },
          extensions: { type: 'array', items: { type: 'string' }, description: 'each feature’s additive member/variant/field, attributed to its feature id' },
          exhaustiveConsumers: { type: 'array', items: { type: 'string' }, description: 'every switch/validator/provider-schema that must handle all cases of this shape' },
        },
      },
    },
    buildDAG: {
      type: 'array',
      description: 'the build order: which features fan out concurrently after the contract barrier, which serialize',
      items: {
        type: 'object',
        required: ['featureId', 'tier', 'after'],
        properties: {
          featureId: { type: 'string' },
          tier: { type: 'string', enum: ['Opus', 'Sonnet'], description: 'whole-feature tier: a mechanical low-contract feature can be a Sonnet workstream end-to-end' },
          after: { type: 'array', items: { type: 'string' }, description: 'feature ids that must complete first (hard deps); empty => fans out right after the contract barrier' },
        },
      },
    },
    criticalPath: { type: 'string', description: 'the longest serial chain of features in this batch, as a one-line sequence' },
    convergenceRisks: { type: 'array', items: { type: 'string' }, description: 'where two features touch the same contract/file and rework is expected at merge' },
  },
}

// === Phase 1: Scope ========================================================

phase('Scope')

const scopeBrief = `You are scoping a parallel build of ONE roadmap iteration. This is read-only reconnaissance — do NOT write or commit anything.

${
  LEGACY
    ? `This project uses the LEGACY FLAT layout: feature specs live directly in \`${FEATURES_DIR}\` as NN-<slug>.md files, and the iteration grouping lives in the roadmap / each spec's "Iteration:" field (there is no per-iteration directory). Read, in order:
1. The roadmap at \`${ROADMAP}\` — the iteration arc, the cross-cutting contracts table, the parallelism map, the critical path.
2. The feature specs in \`${FEATURES_DIR}\`. ${ITERATION ? `Select ONLY the specs belonging to iteration "${ITERATION}" (by the roadmap's grouping or each spec's "Iteration:" field).` : 'No iteration was named — infer the iteration to plan from the roadmap (prefer the earliest not-yet-built one) and report which you chose in iterationName.'}`
    : `Iterations are the top-level unit: \`${ITERATION_DIR}\` is an iteration directory containing an iteration overview (README.md) + its nested feature specs (NN-<slug>.md). Read, in order:
1. The iteration overview \`${ITERATION_DIR.replace(/\/$/, '')}/README.md\` — the iteration goal, its feature list, the shared contracts it touches, its parallelism, and its concurrency with other iterations.
2. EVERY feature spec nested in \`${ITERATION_DIR}\` (the NN-<slug>.md files — these are the features to plan).
3. The roadmap at \`${ROADMAP}\` for cross-iteration context — the contracts table, the critical path, what other iterations are concurrent.

If \`${ITERATION_DIR}\` does not exist, the project may use the legacy flat \`docs/features/\` layout instead — fall back to reading the roadmap + the flat specs dir, select this iteration's specs, and set a blocker noting the layout mismatch so the human can re-invoke with featuresDir set.`
}
${ITERATION ? `(Iteration: "${ITERATION}".)` : ''}
${EXPLICIT_FEATURES ? `Plan ONLY these features (override the dir's set): ${EXPLICIT_FEATURES.join(', ')}.` : ''}

Then, for EACH feature you'll plan:
- Read its spec in full: description, dependencies, acceptance criteria, testing requirements, manual setup.
- VERIFY its stated dependencies actually exist in the code (inspect the real code of dependency features, not just the plan). Set dependenciesVerifiedInCode accordingly. Trust the code over the plan where they diverge.
- Identify which shared contracts it introduces/consumes/extends.

CRITICAL: drop any feature that has a HARD dependency on another feature in the set (one that consumes another's not-yet-shipped behavior) — those build in a later serial batch, not this parallel fan-out. Contract-mediated soft deps are fine (they build against a frozen shape).

Populate \`blockers\` with anything that must stop planning and return to the human: a missing dependency, a spec contradicting the code, a cited-but-missing doc. If blockers is non-empty the human will not proceed — be precise.

Return the structured scope.`

const scope = await agent(scopeBrief, { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, model: 'opus' })

if (scope.blockers && scope.blockers.length) {
  log(`⛔ ${scope.blockers.length} blocker(s) found during scoping — planning will surface these for the human, not proceed past them.`)
}

const featuresToplan = scope.features ?? []
if (!featuresToplan.length) {
  log('No buildable features in scope (all dropped for hard deps or blocked). Returning scope only.')
  return { scope, featurePlans: [], contractSpec: null, blocked: true }
}

log(`Planning ${featuresToplan.length} feature(s): ${featuresToplan.map((f) => f.id).join(', ')}`)

// === Phase 2: Plan (judge-panel per feature) ===============================
// Each feature is drafted from three independent angles, then synthesized.
// Pipeline so a feature whose panel finishes early moves to synthesis while
// another feature is still being drafted — no barrier between draft and judge.

phase('Plan')

const LENSES = [
  {
    key: 'architect',
    prompt: (f) =>
      `You are a senior software ARCHITECT drafting an implementation approach for feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\`, the architecture/ADRs it cites, and the actual code of its dependencies. Propose the build as ordered vertical-slice chunks, each test-first, each satisfying named acceptance criteria. Honor every locked ADR decision and the existing code patterns. Favor the smallest change that satisfies each criterion. Name which chunks touch shared contracts and the exact additive signature each needs frozen. Tag each chunk's model tier (Sonnet = isolated+well-specified+mechanical; Opus = contract-touching/novel/integration, and you MUST state why for Opus). Return your draft plan.`,
  },
  {
    key: 'researcher',
    prompt: (f) =>
      `You are a RESEARCHER pressure-testing the approach for feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\` and the cited architecture. Investigate: what library/pattern does the existing code already use for this kind of work (search the repo)? Are there footguns, version constraints, or platform limits the spec doesn't mention? Is there a simpler path using something already in the tree? Return a plan that maximizes reuse of existing patterns and flags any technology risk, with the same chunk/tier/contract structure.`,
  },
  {
    key: 'contrarian',
    prompt: (f) =>
      `You are a CONTRARIAN / skeptical senior engineer reviewing feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\` and dependencies. Your job is to find what's WRONG with the obvious approach: where will the acceptance criteria be ambiguous or untestable? Where does the spec assume a contract that doesn't exist? What's the riskiest chunk and why? What scope creep is hiding here? Where might parallel features collide? Return a plan that routes around the traps you found, plus an explicit \`risks\` list of what a builder must not get wrong.`,
  },
]

const featurePlans = await pipeline(
  featuresToplan,
  // Stage 1: three independent drafts (a mini-barrier inside the stage, scoped per feature).
  (f) =>
    parallel(
      LENSES.map((lens) => () =>
        agent(lens.prompt(f), { label: `draft:${f.id}:${lens.key}`, phase: 'Plan', model: 'opus' }),
      ),
    ).then((drafts) => ({ feature: f, drafts: drafts.filter(Boolean) })),
  // Stage 2: synthesize the three drafts into one build plan for the spec file.
  ({ feature, drafts }) =>
    agent(
      `You are the lead engineer synthesizing ONE build plan for feature ${feature.id} ("${feature.title}") from three independent drafts (architect, researcher, contrarian). Spec: \`${feature.specPath}\`.

The three drafts:

${drafts.map((d, i) => `--- DRAFT ${i + 1} ---\n${d}`).join('\n\n')}

Produce the single best plan: take the architect's structure, graft the researcher's reuse wins, and route around every trap the contrarian found (carry the survivors into \`risks\`). Every chunk must be a coherent test-first build-and-test slice ending in one tickable item, tagged with its model tier (Opus tier REQUIRES a contract/novel/integration reason — no reason means default it to Sonnet). Pin the exact frozen signature for every contract touchpoint. Return the structured plan.`,
      { label: `synth:${feature.id}`, phase: 'Plan', schema: FEATURE_PLAN_SCHEMA, model: 'opus' },
    ),
)

const goodPlans = featurePlans.filter(Boolean)
log(`Synthesized ${goodPlans.length}/${featuresToplan.length} feature plan(s).`)

// === Phase 3: Contracts (reconcile across all features) ====================
// BARRIER on purpose: locking shared contracts needs ALL feature plans at once,
// so it can pre-commit every feature's additive extension together with the
// consumers that must stay exhaustive. This is the single most important step —
// fanning out before the contract shape is frozen is how parallel work diverges.

phase('Contracts')

const contractSpec = await agent(
  `You are the integrator locking the shared contracts for a parallel build BEFORE any code is written. You have the scope and every feature's build plan.

Scope (features, declared contracts, deps):
${JSON.stringify({ features: scope.features, sharedContracts: scope.sharedContracts }, null, 2)}

Per-feature plans (chunks + contract touchpoints):
${JSON.stringify(goodPlans, null, 2)}

Do three things:
1. RECONCILE every shared contract across all features into ONE frozen spec. For each contract, pre-commit EVERY feature's additive extension (new enum member / union variant / optional wire field) TOGETHER with every consumer that must stay exhaustive over it (every switch, validator, provider schema). A shared extensible type and the code that must handle all its cases are ONE contract — landing the members up front turns N late merge-conflicts + non-exhaustiveness breaks into zero. Give each a minimum-viable frozen \`signature\` the build workflow's barrier agent will implement and commit.
2. Build the BUILD DAG: which features fan out concurrently right after the contract barrier (empty \`after\`), which serialize behind a hard dep. Assign each feature a whole-feature model tier (a mechanical, low-contract feature can be a Sonnet workstream end-to-end; a complex/contract-touching one stays Opus).
3. State the CRITICAL PATH (longest serial chain) and the CONVERGENCE RISKS (where two features touch the same contract/file and rework is expected at merge).

Return the structured contract spec. Do NOT write or commit code — you are specifying signatures for the build phase to implement.`,
  { label: 'lock-contracts', phase: 'Contracts', schema: CONTRACT_SPEC_SCHEMA, model: 'opus' },
)

// === Phase 4: Persist (specs + manifest) ===================================
// Two artifacts, per the approved design: human-readable checkbox plans into
// each spec file (the living tracker the build agents and humans both read),
// AND a machine-readable BUILD-PLAN.md manifest the build workflow consumes.

phase('Persist')

// Write each feature's plan into its spec file, in parallel (disjoint files).
await parallel(
  goodPlans.map((plan) => () => {
    const feat = featuresToplan.find((f) => f.id === plan.featureId)
    return agent(
      `Persist the approved build plan for feature ${plan.featureId} into its spec file \`${feat?.specPath}\`.

Append (in or above the spec's "Implementation notes" section) a "## Build plan (approved)" section as a Markdown CHECKBOX list — one \`- [ ]\` item per chunk, in order, each line stating: the chunk title, what it delivers, the acceptance criteria it satisfies, the tests that prove it, its model tier (and the Opus reason if Opus), its parallelism annotation, and its contract touchpoint. Then a "### Test strategy", "### Contract touchpoints" (contract / action / frozen signature), "### Manual setup", and "### Risks" subsection from the plan below. Do NOT alter the rest of the spec. Do NOT reference feature IDs in any code — this is a spec file, IDs are fine here.

The plan:
${JSON.stringify(plan, null, 2)}

After writing, confirm the file path and the number of checkbox items written.`,
      { label: `persist:${plan.featureId}`, phase: 'Persist', model: 'sonnet' },
    )
  }),
)

// Write the single orchestration manifest the build workflow reads.
await agent(
  `Write the build-orchestration manifest to \`${MANIFEST_PATH}\`. This is the machine-and-human-readable master plan the build workflow (kmaz-build-iteration) consumes. Overwrite any existing file.

Use this structure (Markdown with a fenced \`\`\`json block holding the structured manifest, plus prose around it for humans):

# Build plan — ${scope.iterationName}

**Status:** Awaiting approval · **Iteration goal:** ${scope.iterationGoal ?? ''} · **Iteration slug:** \`${ITERATION_SLUG}\`

## How to use this
1. A human reviews this manifest + the per-feature "Build plan (approved)" sections in each spec.
2. On approval, run the build workflow which: implements + commits the frozen contracts (barrier), then fans out one worktree-isolated workstream per feature per the DAG, builds test-first, drives the running app for QA, runs the adversarial review panel, and returns a convergence report. The build scopes its branch, worktrees, and report to the iteration slug above, so this iteration can build concurrently with others.

## Blockers
${(scope.blockers && scope.blockers.length) ? scope.blockers.map((b) => `- ${b}`).join('\n') : '- None.'}

## Critical path
${contractSpec.criticalPath}

## Convergence risks
${(contractSpec.convergenceRisks ?? []).map((r) => `- ${r}`).join('\n') || '- None expected.'}

## Frozen contracts (implemented by the build barrier, in order, before any fan-out)
A table of each contract: name, source of truth, frozen signature, the per-feature extensions, the exhaustive consumers.

## Build DAG
A table mapping each feature id -> spec path -> whole-feature model tier -> which features it builds after (hard deps; empty = fans out after the contract barrier).

## Per-feature plans
A table linking each feature id to its spec file's "Build plan (approved)" section.

Then embed the full machine-readable manifest as a fenced json block with keys: { iterationName, iterationSlug: "${ITERATION_SLUG}", buildBranch: "build/${ITERATION_SLUG}", iterationGoal, blockers, frozenContracts, buildDAG, criticalPath, convergenceRisks, features: [{id, specPath, title, tier}] }. The iterationSlug and buildBranch MUST be exactly as given here — the build workflow scopes every artifact to them so iterations don't collide.

Source data:
SCOPE: ${JSON.stringify(scope, null, 2)}
CONTRACT SPEC: ${JSON.stringify(contractSpec, null, 2)}

After writing, confirm the path.`,
  { label: 'write-manifest', phase: 'Persist', model: 'opus' },
)

log(`Plan complete. Review ${MANIFEST_PATH} + each spec's "Build plan (approved)" section, then run kmaz-build-iteration.`)

return {
  iteration: scope.iterationName,
  iterationSlug: ITERATION_SLUG,
  manifestPath: MANIFEST_PATH,
  buildBranch: `build/${ITERATION_SLUG}`,
  blockers: scope.blockers ?? [],
  featureCount: goodPlans.length,
  features: goodPlans.map((p) => p.featureId),
  criticalPath: contractSpec.criticalPath,
  frozenContractCount: (contractSpec.frozenContracts ?? []).length,
  nextStep: (scope.blockers && scope.blockers.length)
    ? 'Resolve blockers with the human BEFORE building.'
    : `Human approves the plan, then run kmaz-build-iteration with args { manifestPath: "${MANIFEST_PATH}" }. Artifacts are scoped to slug "${ITERATION_SLUG}", so this can build concurrently with other iterations.`,
}
