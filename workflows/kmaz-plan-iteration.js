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
// WHY two phases: a workflow can't take mid-run user input, but the build needs
// a human plan-approval gate. So planning and building are separate workflows:
// THIS one emits a complete, reviewable plan and STOPS; the human approves it in
// conversation; then kmaz-build-iteration builds autonomously from the approved
// artifact. This workflow writes plans + an orchestration index — it does NOT
// commit code. Contracts are SPECIFIED here (signatures) and IMPLEMENTED by the
// build workflow, so nothing lands before approval.
//
// LAYOUT: kmaz-architecture-to-roadmap makes iterations the top-level unit —
// docs/iterations/NN-<slug>/ holds an overview (README.md) + nested feature
// specs (MM-<slug>.md). This workflow is pointed at ONE iteration dir and plans
// every spec in it. Older projects use a flat docs/features/ dir with the
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
//   { iterationDir?: string,   // current layout: the iteration dir to plan (default: docs/iterations/01-*)
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

// Manifest filename ALWAYS carries the iteration slug — in both layouts — so a
// build plan is searchable and unambiguous next to plans from other iterations.
const MANIFEST_PATH =
  args?.manifestPath ??
  (LEGACY
    ? `docs/BUILD-PLAN-${ITERATION_SLUG}.md`
    : `${ITERATION_DIR.replace(/\/$/, '')}/BUILD-PLAN-${ITERATION_SLUG}.md`)

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
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'feature ids this HARD-depends on — it consumes their not-yet-shipped behavior, so it must build after them. This is the ONLY ordering signal; everything not named here can build concurrently. A contract-mediated soft dep is NOT a hard dep (it builds against the frozen shape), so do NOT list it.' },
          touchesContracts: { type: 'array', items: { type: 'string' }, description: 'names of shared contracts this feature introduces, consumes, or extends' },
          dependenciesVerifiedInCode: { type: 'boolean', description: 'true only if the stated dependencies actually exist in the code, not just the plan' },
          highUncertainty: { type: 'boolean', description: 'true ONLY for a feature whose approach is genuinely unsettled and worth THREE independent planning drafts instead of one: it introduces a load-bearing shared contract, involves a novel/subtle algorithm or a real security/concurrency boundary, or the spec leaves the approach materially open. A routine feature that extends an established pattern is NOT high-uncertainty — default false. Keep this rare; most features get the single-pass planner.' },
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

const scopeBrief = `You are scoping the build of ONE roadmap iteration. This is read-only reconnaissance — do NOT write or commit anything.

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
- Set \`highUncertainty\` deliberately. Default FALSE — a routine feature that extends an established pattern gets a single planning pass. Set TRUE only when the APPROACH is genuinely unsettled and worth three independent planning drafts: it introduces a load-bearing shared contract, involves a novel/subtle algorithm or a real security/concurrency boundary, or the spec leaves the approach materially open. This is RARE — most iterations have ZERO such features. Flagging everything high-uncertainty defeats the point and burns tokens.
- Set \`dependsOn\` to the feature ids this one HARD-depends on (it consumes their not-yet-shipped behavior). This is the only ordering signal the build uses, so keep it minimal and real — a contract-mediated soft dep is NOT a hard dep (it builds against the frozen shape, so leave it out), and a spurious edge needlessly serializes the build.

Plan ALL the iteration's features — the independent ones AND the hard-dependent ones; do NOT drop a feature for having a hard dep. The build workflow serializes a feature behind its \`dependsOn\` automatically and runs everything else concurrently. Only raise a blocker when a dependency is genuinely MISSING FROM THE CODE, never merely because it builds later.

Populate \`blockers\` with anything that must stop planning and return to the human: a missing dependency, a spec contradicting the code, a cited-but-missing doc. If blockers is non-empty the human will not proceed — be precise.

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

const SINGLE_PASS_PLAN = (f) =>
  `Draft the build plan for feature ${f.id} ("${f.title}") in ONE pass. Read its spec at \`${f.specPath}\`, the architecture/ADRs it cites, and the actual code of its dependencies — once. Reason through THREE lenses and fold them into a single plan:
• ARCHITECT: ordered vertical-slice chunks, each test-first, each satisfying named acceptance criteria; honor every locked ADR + existing code pattern; smallest change that satisfies each criterion; name which chunks touch shared contracts and the exact additive signature each needs frozen.
• RESEARCHER (reuse): what library/pattern does the existing code already use for this kind of work? footguns / version / platform limits the spec misses? a simpler path using something already in the tree? Maximize reuse; flag technology risk.
• CONTRARIAN (traps): where are acceptance criteria ambiguous/untestable? where does the spec assume a contract that doesn't exist? riskiest chunk + why? hidden scope creep? Route the plan AROUND these and carry the survivors into \`risks\`.
For each chunk name the specific test file(s)/target(s) that prove it, so the build can run JUST those tests (not the whole suite). Pin the exact frozen signature for every contract touchpoint. Return the structured plan.`

// ESCAPE HATCH (rare): a highUncertainty feature — or a run forced via
// args.multiDraft — gets THREE independent drafts + a synth, because for a
// genuinely unsettled approach the diversity of independent drafts earns the
// extra agents. Most features take the single-pass path above.
const FORCE_MULTIDRAFT = args?.multiDraft === true
const LENSES = [
  { key: 'architect', prompt: (f) => `You are a senior software ARCHITECT drafting an implementation approach for feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\`, the architecture/ADRs it cites, and the actual code of its dependencies. Propose the build as ordered vertical-slice chunks, each test-first, each satisfying named acceptance criteria. Honor every locked ADR decision and the existing code patterns. Favor the smallest change that satisfies each criterion. Name which chunks touch shared contracts and the exact additive signature each needs frozen, and name each chunk's specific test target(s). Return your draft plan.` },
  { key: 'researcher', prompt: (f) => `You are a RESEARCHER pressure-testing the approach for feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\` and the cited architecture. Investigate: what library/pattern does the existing code already use (search the repo)? footguns, version constraints, platform limits the spec misses? a simpler path using something already in the tree? Return a plan that maximizes reuse and flags technology risk, with the same chunk/test-target/contract structure.` },
  { key: 'contrarian', prompt: (f) => `You are a CONTRARIAN / skeptical senior engineer reviewing feature ${f.id} ("${f.title}"). Read its spec at \`${f.specPath}\` and dependencies. Find what's WRONG with the obvious approach: where will acceptance criteria be ambiguous/untestable? where does the spec assume a contract that doesn't exist? riskiest chunk + why? hidden scope creep? Return a plan that routes around the traps, plus an explicit \`risks\` list of what a builder must not get wrong.` },
]

async function planFeature(f) {
  const multi = FORCE_MULTIDRAFT || f.highUncertainty === true
  if (!multi) {
    // Single-pass planner (the common path).
    return agent(SINGLE_PASS_PLAN(f), { label: `plan:${f.id}`, phase: 'Plan', schema: FEATURE_PLAN_SCHEMA, model: 'opus' })
  }
  // High-uncertainty: three independent drafts → synth.
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

const multiCount = featuresToplan.filter((f) => FORCE_MULTIDRAFT || f.highUncertainty === true).length
log(`Planning ${featuresToplan.length} feature(s): ${featuresToplan.length - multiCount} single-pass, ${multiCount} multi-draft (high-uncertainty).`)

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

Declared shared contracts (from scope):
${JSON.stringify(scope.sharedContracts ?? [], null, 2)}

Each feature's contract touchpoints (what it introduces/consumes/extends + the signature it needs):
${JSON.stringify(touchpointsByFeature, null, 2)}

Hard-dependency edges (a feature consumes another's shipped behavior → must build after it):
${JSON.stringify(depEdges, null, 2)}

Do two things:
1. RECONCILE every shared contract across all features into ONE frozen spec. For each contract, pre-commit EVERY feature's additive extension (new enum member / union variant / optional wire field) TOGETHER with every consumer that must stay exhaustive over it (every switch, validator, provider schema). A shared extensible type and the code that must handle all its cases are ONE contract — landing the members up front turns N late breaks into zero. Give each a minimum-viable frozen \`signature\` the build workflow will implement and commit before any feature work.
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

Append (in or above the spec's "Implementation notes" section) a "## Build plan (approved)" section as a Markdown CHECKBOX list — one \`- [ ]\` item per chunk, in order, each line stating: the chunk title, what it delivers, the acceptance criteria it satisfies, the specific test target(s) that prove it, and its contract touchpoint. Then a "### Test strategy", "### Contract touchpoints" (contract / action / frozen signature), "### Manual setup", and "### Risks" subsection from the plan below. Do NOT alter the rest of the spec.

The plan:
${JSON.stringify(plan, null, 2)}

After writing, confirm the file path and the number of checkbox items written.`,
      { label: `persist:${plan.featureId}`, phase: 'Persist', model: 'sonnet' },
    )
  }),
)

// Write the orchestration INDEX the build workflow reads. It links to the
// per-spec plans rather than duplicating them. Sonnet: this is templating the
// structured data below into Markdown — mechanical, not reasoning. (Was opus.)
const buildOrder = contractSpec.buildOrder ?? depEdges
const indexFeatures = (scope.features ?? []).map((f) => {
  const order = buildOrder.find((b) => b.featureId === f.id)
  return { id: f.id, specPath: f.specPath, title: f.title, after: order?.after ?? (f.dependsOn ?? []) }
})

await agent(
  `Write the build orchestration index to \`${MANIFEST_PATH}\`. The build workflow (kmaz-build-iteration) consumes it. Overwrite any existing file. This is an INDEX — it links to each spec's "Build plan (approved)" section, it does NOT restate chunk-level detail.

Use this structure (Markdown prose for humans, plus ONE fenced \`\`\`json block holding the machine-readable index):

# Build plan — ${scope.iterationName}

**Status:** Awaiting approval · **Iteration goal:** ${scope.iterationGoal ?? ''} · **Iteration slug:** \`${ITERATION_SLUG}\`

## How to use this
1. A human reviews this index + the per-feature "Build plan (approved)" sections in each spec, then flips Status to "Approved".
2. On approval, run the build workflow: it implements + commits the frozen contracts first, then builds each feature in its own worktree (independent features concurrently, hard-dependent ones after their deps), reviews each, and returns a convergence report. Every artifact is scoped to the iteration slug above, so this iteration can build concurrently with others.

## Blockers
${(scope.blockers && scope.blockers.length) ? scope.blockers.map((b) => `- ${b}`).join('\n') : '- None.'}

## Frozen contracts (implemented first, before any feature work)
A table of each contract: name, source of truth, frozen signature, the per-feature extensions, the exhaustive consumers.

## Features & build order
A table: feature id → spec path (linked) → its "Build plan (approved)" section → \`after\` (the feature ids it builds after; empty = starts once contracts are frozen).

Then embed the machine-readable index as a fenced json block with EXACTLY these keys: { iterationName, iterationSlug: "${ITERATION_SLUG}", buildBranch: "build/${ITERATION_SLUG}", iterationGoal, blockers, frozenContracts, features: [{id, specPath, title, after}] }. iterationSlug and buildBranch MUST be exactly as given here — the build workflow scopes every artifact to them so iterations don't collide.

Source data:
FROZEN CONTRACTS: ${JSON.stringify(contractSpec.frozenContracts ?? [], null, 2)}
FEATURES (with build order): ${JSON.stringify(indexFeatures, null, 2)}
BLOCKERS: ${JSON.stringify(scope.blockers ?? [], null, 2)}

After writing, confirm the path.`,
  { label: 'write-index', phase: 'Persist', model: 'sonnet' },
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
  frozenContractCount: (contractSpec.frozenContracts ?? []).length,
  nextStep: (scope.blockers && scope.blockers.length)
    ? 'Resolve blockers with the human BEFORE building.'
    : `Human approves the plan, then run kmaz-build-iteration with args { manifestPath: "${MANIFEST_PATH}" }. Artifacts are scoped to slug "${ITERATION_SLUG}", so this can build concurrently with other iterations.`,
}
