export const meta = {
  name: 'kmaz-build-iteration',
  description:
    'Build an approved iteration in parallel: implement + commit the frozen shared contracts (barrier), then fan out one worktree-isolated workstream per feature — build test-first to the spec checklist, drive the running app for QA evidence, then ONE opus reviewer covers all six dimensions (spec/security/robustness/efficiency/convention/contrarian) and fixes its confirmed gating findings inline, with a conditional skeptic re-checking only high-severity security/spec — and return a convergence report for the human to land as one MR.',
  whenToUse:
    'Run AFTER kmaz-plan-iteration and AFTER a human approves the iteration\'s BUILD-PLAN manifest + the per-spec "Build plan (approved)" sections. Builds autonomously from the approved plan; does not take mid-run input. Every artifact is name-scoped to the iteration slug (branch build/<slug>, worktrees under .claude/worktrees/<slug>/, report CONVERGENCE-<slug>.md), so multiple iterations can build CONCURRENTLY without colliding. All build work is isolated in .claude/worktrees/ — the primary worktree (where the human works on main) is never touched. Finalizes autonomously: assembles the shippable features onto ONE linear integration branch (cherry-pick, no merge commits), pushes it, opens ONE MR (does not merge it), and tears down the transient per-feature worktrees/branches once the MR is open. Blocked features are left out with their worktrees preserved.',
  phases: [
    { title: 'Load', detail: 'read the approved manifest + per-feature plans; sanity-check it is approved' },
    { title: 'Contract barrier', detail: 'implement + commit the frozen shared contracts on the build branch before any fan-out', model: 'opus' },
    { title: 'Build', detail: 'per feature, in its own worktree: TDD each chunk to green, drive the running app for QA evidence' },
    { title: 'Review', detail: 'per feature: ONE opus reviewer covers all 6 dimensions + fixes gating findings inline; conditional skeptic on high-sev sec/spec', model: 'opus' },
    { title: 'Converge', detail: 'integrated suite + end-to-end smoke on the assembled batch; emit the convergence report' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-build-iteration — Phase 2 of the two-phase parallel-feature build.
//
// Consumes the artifact kmaz-plan-iteration produced and a human approved.
// Runs autonomously (workflows take no mid-run input). The human gate already
// happened: it was approving the manifest — so finalization is autonomous too.
// The workflow assembles the shippable features onto ONE linear integration
// branch (cherry-pick, zero merge commits), pushes it, opens ONE MR, and tears
// down the transient per-feature worktrees/branches once the MR is open and
// verified to contain the work. It does NOT merge the MR (the human does) and
// it does NOT wait for permission to push/open it. Blocked features are left
// out and their worktrees preserved for the human.
//
// Isolation model: ALL build work is autonomous, so it ALWAYS runs in its own
// worktree under .claude/worktrees/ on its own branch — the primary worktree
// (where the human works on main, live) is NEVER touched, never branch-switched.
// ONE git worktree per FEATURE; sub-task agents within a feature share that
// feature's worktree; features never clobber each other because each owns its
// own tree + branch. The contract barrier runs first on a shared build branch
// (in its own worktree) that every feature worktree forks from.
//
// PARALLEL ITERATIONS: every artifact is name-scoped to the iteration slug
// (from the manifest) — build branch build/<slug>, worktrees under
// .claude/worktrees/<slug>/, integration branch integration/<slug>, report
// docs/CONVERGENCE-<slug>.md. So two iterations can build CONCURRENTLY without
// colliding on a branch, a worktree path, or the report file. (Per-feature
// branches feat/<id> are already globally unique by feature id.) This is the
// whole point of iteration-level parallelism — never reintroduce an unscoped
// shared name here.
//
// The manifest is the BUILD-PLAN.md kmaz-plan-iteration wrote INTO the iteration
// directory (docs/iterations/NN-<slug>/BUILD-PLAN.md). It carries each feature's
// nested specPath, so this workflow stays layout-agnostic — it reads whatever
// paths the manifest names.
//
// `args`:
//   { manifestPath?: string,  // path to the iteration's BUILD-PLAN.md (caller passes the real one)
//     buildBranch?: string,   // base branch the contracts land on + features fork from
//     reviewRounds?: number,  // max loop-until-clean review rounds per feature (default 3)
//     skipAppSmoke?: boolean } // skip the app-driving QA/smoke (only if no runnable surface)
// ---------------------------------------------------------------------------

// Current layout puts the manifest in the iteration dir; the LEGACY flat
// layout (docs/features/ projects) puts it at docs/BUILD-PLAN.md. The Load
// agent tolerates either, and the build is layout-agnostic regardless since it
// follows the specPaths the manifest carries.
const MANIFEST_PATH = args?.manifestPath ?? 'docs/iterations/01-*/BUILD-PLAN.md'
const BUILD_BRANCH = args?.buildBranch ?? null // resolved by the load agent if null
// Default 1 (was 3): the plan-iteration pass already ran architect/researcher/
// contrarian drafts + a contract reconciliation that verified every signature
// against real code, so the build review is a confirmation pass, not a from-
// scratch audit. Round 2 only runs if a round-1 fix landed gating changes AND
// the caller raised reviewRounds.
const MAX_REVIEW_ROUNDS = Number.isInteger(args?.reviewRounds) ? args.reviewRounds : 1
const SKIP_APP_SMOKE = args?.skipAppSmoke === true

// === Schemas ===============================================================

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['approved', 'iterationName', 'iterationSlug', 'buildBranch', 'frozenContracts', 'features'],
  properties: {
    approved: { type: 'boolean', description: 'true only if the manifest shows it has been approved (Status not "Awaiting approval") AND has no unresolved blockers' },
    approvalEvidence: { type: 'string', description: 'the line/marker that shows approval, or why you judged it approved' },
    iterationName: { type: 'string' },
    iterationSlug: { type: 'string', description: 'the kebab slug that name-scopes EVERY build artifact (branch, worktrees, report) so this iteration can build concurrently with others. Read it from the manifest; if absent, derive a kebab slug from iterationName.' },
    buildBranch: { type: 'string', description: 'the base branch contracts land on and features fork from — MUST be build/<iterationSlug> from the manifest' },
    blockers: { type: 'array', items: { type: 'string' } },
    frozenContracts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'sourceOfTruth', 'signature', 'extensions', 'exhaustiveConsumers'],
        properties: {
          name: { type: 'string' },
          sourceOfTruth: { type: 'string' },
          signature: { type: 'string' },
          extensions: { type: 'array', items: { type: 'string' } },
          exhaustiveConsumers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    features: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'specPath', 'tier', 'after'],
        properties: {
          id: { type: 'string' },
          specPath: { type: 'string' },
          title: { type: 'string' },
          tier: { type: 'string', enum: ['Opus', 'Sonnet'] },
          after: { type: 'array', items: { type: 'string' }, description: 'feature ids that must complete before this one' },
        },
      },
    },
    testCommand: { type: 'string', description: 'the repo’s actual test command(s), discovered from the repo not assumed' },
    runAppHint: { type: 'string', description: 'how a user/caller runs the app (dev server + URL, CLI binary, endpoint) — for QA' },
  },
}

const BARRIER_SCHEMA = {
  type: 'object',
  required: ['committed', 'frozenSignatures', 'commitSha'],
  properties: {
    committed: { type: 'boolean' },
    commitSha: { type: 'string' },
    frozenSignatures: { type: 'array', items: { type: 'string' }, description: 'the exact final signatures as committed, for briefing every feature workstream' },
    testStatus: { type: 'string', description: 'quoted result of running the suite after landing contracts — must be green' },
    notes: { type: 'string' },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  required: ['featureId', 'branch', 'worktree', 'chunksComplete', 'chunksTotal', 'allTestsGreen'],
  properties: {
    featureId: { type: 'string' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    chunksComplete: { type: 'integer' },
    chunksTotal: { type: 'integer' },
    allTestsGreen: { type: 'boolean' },
    testEvidence: { type: 'string', description: 'quoted suite output line (counts/exit code)' },
    qaEvidence: { type: 'string', description: 'quoted evidence from driving the REAL running app/CLI/endpoint (HTTP status, DOM state, screenshot ref, output line). "deferred: <reason>" only if no runnable surface yet.' },
    deferredCheckboxes: { type: 'array', items: { type: 'string' }, description: 'checkboxes left unticked + why (needs human-only key/device)' },
    contractDrift: { type: 'string', description: 'any place the build needed a frozen contract to change — MUST be reported, never silently forked. "none" if clean.' },
    commits: { type: 'array', items: { type: 'string' } },
    diffRange: { type: 'string', description: 'the exact git range that IS this feature\'s work, e.g. "<buildBranchSha>..HEAD" — so reviewers diff ONCE against the right base without re-deriving it' },
    changedFiles: { type: 'array', items: { type: 'string' }, description: 'the files this feature changed (from git diff --name-only over diffRange) — lets reviewers scope their read without listing the tree themselves' },
  },
}

// A finding carries its own dimension tag so ONE reviewer can cover several
// dimensions in a single diff read (see GROUPED_REVIEW_SCHEMA). `selfVerified`
// makes the reviewer assert it already confirmed the finding against the cited
// code — this is what lets us drop the separate per-finding refutation round.
const FINDING_PROPS = {
  type: 'object',
  required: ['title', 'dimension', 'severity', 'evidence', 'gating', 'selfVerified'],
  properties: {
    title: { type: 'string' },
    dimension: { type: 'string', enum: ['spec-compliance', 'security', 'contrarian', 'robustness', 'efficiency', 'convention'] },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string', description: 'file:line or quoted output you actually read' },
    fix: { type: 'string', description: 'the concrete fix' },
    gating: { type: 'boolean', description: 'true if a missed acceptance criterion, a high/medium security/contract issue, or a convention violation (F-NN leak / secret / inline ADR) — blocks shipping until fixed' },
    selfVerified: { type: 'boolean', description: 'true ONLY if you READ the cited code and confirmed this is real (not a guess). Omit findings you cannot self-verify rather than reporting them low-confidence.' },
    fixedNow: { type: 'boolean', description: 'true if YOU fixed this gating finding inline in this same pass (localized edit, suite re-run green, committed). false for low/non-gating findings you only recorded, or for anything you ESCALATED instead of fixing.' },
    escalated: { type: 'boolean', description: 'true if fixing this would need a frozen-contract change or a re-architecture (not a localized edit) — you STOPPED rather than fix it; it needs the human.' },
  },
}

// ONE reviewer per feature covers ALL six dimensions in a single read of the
// scoped diff, AND fixes its own confirmed gating findings inline (localized
// edit + suite re-run + commit) in the same call — so there is no separate
// mechanical reviewer and no separate fix agent. It returns each finding tagged
// with whether it was fixedNow / escalated, plus a short fixSummary + the quoted
// green suite result if it fixed anything.
const GROUPED_REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    dimensionsCovered: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: FINDING_PROPS },
    fixSummary: { type: 'string', description: 'one-line summary of the gating fixes you applied inline this pass (empty if none)' },
    suiteAfterFix: { type: 'string', description: 'quoted green suite result after your inline fixes (empty if you fixed nothing)' },
  },
}

// The conditional skeptic batch-triages only the high-severity security/spec
// findings (the ones a false positive on would be expensive). Returns a verdict
// per finding id.
const BATCH_VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'real'],
        properties: {
          id: { type: 'string' },
          real: { type: 'boolean', description: 'false if you can refute it; default to refuting if uncertain' },
          revisedSeverity: { type: 'string', enum: ['high', 'medium', 'low', 'invalid'] },
          why: { type: 'string' },
        },
      },
    },
  },
}

// reviewFeature returns a plain JS object (build + confirmed findings + fix
// summary + unresolvedGating). The converge agent folds these into the
// per-feature shippable/blocked verdict + retro AND the batch report in one
// pass — there is NO separate per-feature verdict agent.

// === Phase 1: Load =========================================================

phase('Load')

const manifest = await agent(
  `Read the approved build manifest at \`${MANIFEST_PATH}\` and the per-feature "Build plan (approved)" sections in each spec it references. This is read-only.

If that exact path doesn't exist, the manifest may live elsewhere depending on the project's docs layout: the current layout writes it inside the iteration dir (\`docs/iterations/NN-<slug>/BUILD-PLAN.md\`); the LEGACY flat layout writes it slug-scoped at \`docs/BUILD-PLAN-<iteration-slug>.md\`. Locate THIS iteration's BUILD-PLAN under \`docs/\` and use it (if several exist, they are different iterations — pick the one the caller meant). The feature specs may correspondingly be either nested under an iteration dir or flat in \`docs/features/\` — follow whatever specPaths the manifest names; the build is layout-agnostic.

Determine:
- Whether the plan is APPROVED. It is approved only if its Status is NOT "Awaiting approval" (a human flips it, e.g. to "Approved") AND its Blockers list is empty/"None". If it still says awaiting-approval or has blockers, set approved=false and explain — the build must NOT proceed on an unapproved plan.
- The iteration slug (read \`iterationSlug\` from the manifest; if an old manifest lacks it, derive a kebab slug from the iteration name). EVERY build artifact is scoped to this so concurrent iterations don't collide — return it.
- The build branch name: use the manifest's \`buildBranch\` (it is \`build/<iterationSlug>\`).${BUILD_BRANCH ? ` The caller specified buildBranch="${BUILD_BRANCH}" — use it.` : ''}
- The frozen contracts (name, source of truth, signature, per-feature extensions, exhaustive consumers).
- The features (id, spec path, title, whole-feature tier, hard-dep "after" list).
- The repo's ACTUAL test command (discover it — do not assume a stack) and how a user runs the app (for QA).

Return the structured manifest.`,
  // Sonnet: reads the manifest + discovers the test command and fills a schema —
  // extraction, not reasoning. (Was opus.)
  { label: 'load-manifest', phase: 'Load', schema: MANIFEST_SCHEMA, model: 'sonnet' },
)

if (!manifest.approved) {
  log('⛔ Manifest is not approved (or has blockers). Stopping before any build work.')
  return { stopped: true, reason: 'manifest-not-approved', evidence: manifest.approvalEvidence, blockers: manifest.blockers ?? [] }
}

// PARALLEL ITERATIONS: scope EVERY artifact to the iteration slug so two
// iterations can build concurrently without colliding on a branch, a worktree
// path, or the report file. The slug comes from the manifest (the plan workflow
// wrote it); fall back to a kebab of the iteration name if an old manifest
// lacks it. buildBranch is build/<slug>; worktrees live under a slug-scoped
// dir; feature branches are namespaced by slug; the report filename carries it.
const ITERATION_SLUG = (manifest.iterationSlug || manifest.iterationName || 'iteration')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
const buildBranch = BUILD_BRANCH ?? manifest.buildBranch ?? `build/${ITERATION_SLUG}`
// Autonomous build work is ALWAYS isolated in .claude/worktrees/ on its own
// branch — never the primary worktree (the human works on main there, live).
// Every worktree for this iteration nests under one slug-scoped dir.
const WORKTREE_DIR = `.claude/worktrees/${ITERATION_SLUG}`
const testCommand = manifest.testCommand
log(`Approved: ${manifest.iterationName} (slug "${ITERATION_SLUG}"). ${manifest.features.length} feature(s) onto ${buildBranch}. Test cmd: ${testCommand}`)

// === Phase 2: Contract barrier =============================================
// HARD BARRIER. One Opus agent implements + commits the frozen contracts to the
// build branch BEFORE any feature fans out. It pre-commits every feature's
// additive extension together with the consumers that must stay exhaustive, so
// the parallel workstreams build against a frozen shape and there are no late
// non-exhaustiveness breaks. Worktree isolation so it owns the build branch.

phase('Contract barrier')

const barrier = await agent(
  `You are landing the frozen shared contracts for a parallel build, BEFORE any feature work. Create the build branch \`${buildBranch}\` in its OWN NEW WORKTREE: \`git worktree add ${WORKTREE_DIR}/contracts -b ${buildBranch} <main/default>\`, working ENTIRELY inside \`${WORKTREE_DIR}/contracts\`. NEVER \`git checkout\`/\`switch\` the primary worktree — the human is working there on main, live; changing its branch yanks files out from under them. (This iteration's worktrees all nest under \`${WORKTREE_DIR}/\` so concurrent iterations never collide.) Implement the minimum-viable form of EVERY contract below, pre-commit EVERY feature's additive extension TOGETHER with every consumer that must stay exhaustive over it (so no switch/validator/provider-schema breaks when features land), run the suite (\`${testCommand}\`) until green, and commit.

Before creating the worktree, ensure \`.claude/worktrees/\` is gitignored (it holds transient build trees that must never be committed): if it isn't already ignored, add it to \`.git/info/exclude\` (don't modify a tracked .gitignore unless the project clearly wants it there).

You MUST NOT implement feature behavior — only the contract shapes + their exhaustive consumers. You MUST NOT reference any feature ID (F-NN) in code/config/comments — those are transient; reference a durable ADR or let it stand alone.

Frozen contracts to land:
${JSON.stringify(manifest.frozenContracts, null, 2)}

Use Conventional Commits. After committing, return: committed=true, the commit sha, the EXACT final signatures as committed (these brief every feature workstream so they consume the real shape), and the quoted green suite result.`,
  { label: 'contract-barrier', phase: 'Contract barrier', schema: BARRIER_SCHEMA, model: 'opus', isolation: 'worktree' },
)

if (!barrier.committed) {
  log('⛔ Contract barrier did not land. Stopping — fanning out without frozen contracts is the failure mode this guards against.')
  return { stopped: true, reason: 'contract-barrier-failed', notes: barrier.notes }
}
log(`Contracts landed @ ${barrier.commitSha}. ${barrier.frozenSignatures.length} signature(s) frozen.`)

const frozenBrief = `The shared contracts are FROZEN and committed on \`${buildBranch}\` @ ${barrier.commitSha}. Consume these signatures WITHOUT modifying them. If you believe you need to change one, STOP and report it as contractDrift — never fork a local copy:\n\n${barrier.frozenSignatures.map((s) => `- ${s}`).join('\n')}`

// === Phases 3–4: per-feature pipeline (Build -> Review) ====================
// Each feature runs its OWN worktree-isolated workstream: build (1 agent) then
// review (1 opus reviewer that also fixes gating findings inline; + a
// conditional skeptic only when high-sev security/spec findings exist). So a
// clean feature costs 2 agents (build + review), a feature with high-stakes
// findings costs 3 — versus the old 4–6 (build + 2 reviewers + skeptic + fix).
// pipeline() so a feature that finishes building moves into review while another
// is still building — no global barrier. Hard-dep ordering ("after") is
// respected by gating each feature on its deps.

const byId = new Map()
const featureResultPromises = new Map()

function tierModel(t) {
  return t === 'Sonnet' ? 'sonnet' : 'opus'
}

// Build one feature (TDD all chunks + app-driving QA) in its own worktree.
async function buildFeature(f) {
  const model = tierModel(f.tier)
  return agent(
    `You are building feature ${f.id} ("${f.title ?? ''}") end-to-end in its OWN NEW git worktree: \`git worktree add ${WORKTREE_DIR}/${f.id.toLowerCase()} -b feat/${f.id.toLowerCase()} ${buildBranch}\` (forked from \`${buildBranch}\` @ ${barrier.commitSha}, which carries the frozen contracts). Work ENTIRELY inside \`${WORKTREE_DIR}/${f.id.toLowerCase()}\`. NEVER \`git checkout\`/\`switch\` the primary worktree — the human works there on main, live. All of this iteration's worktrees nest under \`${WORKTREE_DIR}/\` so a concurrently-building iteration never collides with yours.

${frozenBrief}

Your plan is the "Build plan (approved)" section in the spec \`${f.specPath}\`. Build it test-first, chunk by chunk:
1. Write the tests the chunk's acceptance criteria require (the criteria ARE the test spec).
2. Implement the chunk (smallest change that satisfies the criteria — no scope creep).
3. Run the suite (\`${testCommand}\`) until green for that chunk.
4. VERIFY against the RUNNING system, not just the suite${SKIP_APP_SMOKE ? ' (app-driving QA is globally skipped for this run — cover via integration tests and note "smoke skipped")' : ': drive the real app/CLI/endpoint (use Chrome DevTools or Playwright MCP for a UI, run the binary for a CLI, curl the endpoint for a service — ' + (manifest.runAppHint ?? 'discover how the app runs') + ') and quote the observed evidence (HTTP status / DOM state / screenshot ref / output line)'}. If a chunk genuinely cannot be exercised end-to-end yet because it sits behind an unbuilt caller, say so explicitly — defer deliberately, never skip silently.
5. Tick the checkbox in the spec and commit (Conventional Commits, granular).

Record decisions + rationale into the spec's Implementation-notes as you go. NEVER write a feature ID (F-NN) into code/config/env-templates/prompts/committed-docs — grep your diff for \`F-[0-9]\` before each commit and strip any hit (IDs are allowed only in the spec file + commit messages). Reference a durable ADR for non-obvious choices.

If you hit a contract gap — you think a frozen signature must change — STOP and report it in \`contractDrift\`; do not improvise a contract change. The full suite must end GREEN (no pending/failing).

Return the structured build result with quoted test + QA evidence, your branch, your worktree path, the commits, and — so the reviewers diff ONCE against the right base instead of re-deriving it — set \`diffRange\` to \`${barrier.commitSha}..HEAD\` and \`changedFiles\` to the output of \`git diff --name-only ${barrier.commitSha}..HEAD\`.`,
    { label: `build:${f.id}`, phase: 'Build', schema: BUILD_SCHEMA, model, isolation: 'worktree' },
  )
}

// Review + loop-until-clean + gated triage-fix for one built feature.
async function reviewFeature(build, f) {
  if (!build) return null
  const model = tierModel(f.tier)

  // ONE reviewer/fixer per feature. A single opus agent reads the scoped diff
  // ONCE, covers ALL six dimensions, self-verifies each finding against the
  // cited code, AND fixes its own confirmed gating findings inline (localized
  // edit + suite re-run + commit) in the SAME call — then reports each finding
  // tagged fixedNow / escalated. This replaces the old two-reviewers + separate
  // fix agent (3–4 agents/feature) with 1 (+ a conditional skeptic). The diff
  // range + changed files were computed ONCE by the build agent, so the reviewer
  // doesn't re-derive them or re-ingest the whole spec.
  const diffRange = build.diffRange || `${barrier.commitSha}..HEAD`
  const changedFiles = (build.changedFiles ?? []).join(', ') || '(run `git diff --name-only ' + diffRange + '`)'

  let round = 0
  let cleanRounds = 0
  const allConfirmed = []
  let lastFixSummary = ''

  while (round < MAX_REVIEW_ROUNDS && cleanRounds < 1) {
    round++

    const review = await agent(
      `Review AND fix feature ${f.id} in worktree \`${build.worktree}\` (branch \`${build.branch}\`), round ${round}. ${round > 1 ? `A prior round already fixed: ${lastFixSummary}. Find what is STILL wrong or newly introduced.` : ''}

The feature's changes are EXACTLY \`git diff ${diffRange}\` (changed files: ${changedFiles}). Read that diff ONCE — do not re-derive the range or scan unrelated files. For acceptance criteria, read only the "Acceptance criteria" + "Build plan (approved)" sections of \`${f.specPath}\` (not the whole spec). ${frozenBrief}

Cover ALL SIX dimensions in that one read:
• spec-compliance: satisfies EVERY acceptance criterion + honors every cited ADR? missed/partial = GATING. Contract drift = gating.
• security: input validation, injection, secret handling, authn/authz, trust boundaries, SSRF, project safety invariants. high/medium = GATING.
• contrarian: ignore the happy path — the input/state/integration that BREAKS an invariant or defeats a criterion, or a test passing for the wrong reason. Defeating a criterion = gating.
• robustness: edge cases, failure modes, error handling, resource cleanup, concurrency, retries, timeouts. high/medium gating.
• efficiency: needless work, hot-path allocations, N+1 queries, oversized payloads, wasted re-renders. Rarely gating unless it breaks a stated perf criterion.
• convention: grep the diff for \`F-[0-9]\` and flag EVERY hit in code/config/env-templates/prompts/committed-docs (allowed only in the spec file / commit messages); flag inline architectural decisions that belong in an ADR; flag any secret/.env content. These convention hits are ALWAYS gating.

For EACH finding: read the cited code to CONFIRM it is real before reporting it; set selfVerified:true only when you did. OMIT anything you cannot confirm rather than reporting it speculatively.

THEN, in this same pass, FIX every GATING finding you confirmed (localized edit at its cited location), re-run the suite (\`${testCommand}\`) until GREEN, and commit (Conventional Commits, type \`fix\`). Mark each such finding fixedNow:true. If a fix would need a frozen-contract change OR a re-architecture (not a localized edit), DO NOT fix it — set escalated:true and leave it for the human. Record low/non-gating findings (fixedNow:false) without fixing. Return all findings, a one-line fixSummary, and the quoted green suiteAfterFix if you changed anything.`,
      { label: `review:${f.id}:r${round}`, phase: 'Review', schema: GROUPED_REVIEW_SCHEMA, model: 'opus' },
    )

    // Self-verified findings only (the reviewer omits what it couldn't confirm).
    const findings = (review?.findings ?? [])
      .map((x, j) => ({ ...x, _fid: String(j) }))
      .filter((x) => x.selfVerified !== false)
    if (review?.fixSummary) lastFixSummary = String(review.fixSummary).slice(0, 500)

    // CONDITIONAL skeptic: only high-severity security/spec findings get an
    // independent second pass (a false positive there is the expensive kind, and
    // the reviewer just fixed based on its own judgment — so re-check the
    // high-stakes ones it acted on). One batched agent triages them all.
    const highStakes = findings.filter(
      (x) => x.severity === 'high' && (x.dimension === 'security' || x.dimension === 'spec-compliance'),
    )
    let refuted = new Set()
    if (highStakes.length) {
      const skeptic = await agent(
        `Batch-TRIAGE these ${highStakes.length} high-severity security/spec finding(s) on feature ${f.id} (worktree \`${build.worktree}\`, changes \`git diff ${diffRange}\`). Read the ACTUAL code at each cited location (the reviewer may have already fixed some — note fixedNow). For EACH: was it a real issue, or a false-positive / misread? Default to refuting when uncertain.\n\n${highStakes.map((x) => `[id ${x._fid}] "${x.title}" [${x.dimension}] fixedNow=${x.fixedNow === true} — ${x.evidence}`).join('\n')}\n\nReturn { verdicts: [{ id, real, revisedSeverity, why }] } for every id.`,
        { label: `skeptic:${f.id}:r${round}`, phase: 'Review', schema: BATCH_VERDICT_SCHEMA, model: 'opus' },
      )
      for (const v of skeptic?.verdicts ?? []) {
        if (!v.real || v.revisedSeverity === 'invalid') refuted.add(String(v.id))
      }
    }

    const realFindings = findings.filter((x) => !refuted.has(String(x._fid)))
    allConfirmed.push(...realFindings)

    // A round is "clean" (stop looping) when nothing gating remains UNRESOLVED —
    // i.e. every gating finding was fixedNow (or there were none). Anything
    // escalated or left unfixed keeps it unresolved and is surfaced to the human.
    const unresolved = realFindings.filter(
      (x) => (x.gating || x.severity === 'high' || x.severity === 'medium') && x.fixedNow !== true,
    )
    if (!unresolved.length) {
      log(`${f.id} review round ${round}: ${realFindings.length} confirmed (${highStakes.length} skeptic-checked), gating fixed inline, none unresolved — stopping.`)
      cleanRounds++
      break
    }
    log(`${f.id} review round ${round}: ${unresolved.length} gating finding(s) unresolved (escalated or unfixed).`)
  }

  // NO per-feature verdict agent — return the raw outcome; converge folds these
  // into the shippable/blocked decision + retro for the whole batch at once.
  // A gating finding the reviewer fixed inline (fixedNow) is NOT unresolved;
  // only escalated/unfixed gating findings need the human.
  const unresolvedGating = allConfirmed.filter(
    (x) => (x.gating || x.severity === 'high' || x.severity === 'medium') && x.fixedNow !== true,
  )
  return {
    featureId: f.id,
    branch: build.branch,
    worktree: build.worktree,
    specPath: f.specPath,
    title: f.title ?? '',
    roundsRun: round,
    build,
    confirmedFindings: allConfirmed,
    unresolvedGating,
    lastFixSummary,
    contractDrift: build.contractDrift && build.contractDrift !== 'none' ? build.contractDrift : null,
  }
}

// Resolve each feature respecting hard-dep ("after") ordering. A feature waits
// on its dependency features' results before starting; independents fan out at
// once. We build the promise graph so the pipeline self-schedules by deps.
for (const f of manifest.features) byId.set(f.id, f)

function runFeature(f) {
  if (featureResultPromises.has(f.id)) return featureResultPromises.get(f.id)
  const deps = (f.after ?? []).map((id) => byId.get(id)).filter(Boolean)
  const p = (async () => {
    if (deps.length) {
      // Wait for hard-dep features to finish (their shipped behavior is consumed).
      await Promise.all(deps.map((d) => runFeature(d)))
    }
    const build = await buildFeature(f)
    const result = await reviewFeature(build, f)
    return result
  })()
  featureResultPromises.set(f.id, p)
  return p
}

phase('Build') // Build/Review interleave per feature via opts.phase on each agent.
const featureResults = (await Promise.all(manifest.features.map((f) => runFeature(f)))).filter(Boolean)

// === Phase 5: Converge =====================================================
// Assembles the shippable feature branches onto ONE integration branch by
// CHERRY-PICK/REBASE ONLY (zero merge commits — linear history is mandatory,
// verified with `git log --merges`), runs the integrated suite + end-to-end
// smoke, writes the convergence report, then AUTONOMOUSLY pushes the branch and
// opens ONE MR (does NOT merge it — the human does that), and tears down the
// transient per-feature worktrees/branches once the MR is open and verified to
// contain the work. Blocked features are left out, their worktrees preserved.
// Autonomous finalization is correct here: the human's gate was approving the
// manifest; waiting again to push/open the MR is the bug this fixes.

phase('Converge')

// Shippable is computed here from the raw review outcome (no per-feature verdict
// agent): a feature is shippable iff its build tests were green, it has no
// unresolved gating finding, and no unreported contract drift.
function isShippable(r) {
  return r.build?.allTestsGreen === true && (r.unresolvedGating?.length ?? 0) === 0 && !r.contractDrift
}
const shippable = featureResults.filter(isShippable)
const blocked = featureResults.filter((r) => !isShippable(r))

const convergence = await agent(
  `You are the integrator finalizing the iteration "${manifest.iterationName}". The frozen contracts are on \`${buildBranch}\` @ ${barrier.commitSha}; each SHIPPABLE feature built on its own \`feat/<id>\` branch off that. You finalize AUTONOMOUSLY — assemble, push, open ONE MR, and clean up the scaffolding. Do NOT wait for the human and do NOT merge into the default branch (the human merges the MR). The only thing that stops you is a real cherry-pick conflict needing human judgment.

1. ASSEMBLE the SHIPPABLE feature branches (below) onto an iteration-scoped integration branch \`integration/${ITERATION_SLUG}\` in a NEW worktree: \`git worktree add ${WORKTREE_DIR}/integration -b integration/${ITERATION_SLUG} ${buildBranch}\` (scoped so a concurrent iteration never collides). Work entirely in that worktree — NEVER \`git checkout\`/\`switch\` the primary worktree, the human works there on main. Ship SHIPPABLE features only; leave any blocked feature OUT (its branch/worktree stays untouched for the human).
   LINEAR HISTORY IS MANDATORY — ZERO merge commits. Assemble ONLY by cherry-picking each shippable feature's commits in DAG order (\`git cherry-pick\`), or \`git rebase --onto\`. NEVER \`git merge\` (and never \`cherry-pick -m\`) — a merge commit is a failure. Resolve predicted convergence in place as ordinary commits. If a real conflict needs human judgment, leave that feature OUT (treat it as blocked) and report it — don't force it. VERIFY linearity: \`git log --merges ${buildBranch}..integration/${ITERATION_SLUG}\` MUST print nothing (redo any pick that created a merge commit); quote the empty result as proof.
2. Run the FULL integrated suite (\`${testCommand}\`) on the assembled branch.
3. ${SKIP_APP_SMOKE ? 'App smoke skipped this run — rely on the integrated suite.' : `Run ONE end-to-end smoke of the assembled app (${manifest.runAppHint ?? 'how a user runs it'}): exercise the iteration's primary new path + one neighbouring existing path (regression check). Quote the observed evidence.`}
4. Per feature, FINALIZE the verdict from its review outcome below: confirm shippable (every acceptance criterion met, no unresolved high/medium security or contract drift, suite green, smoke passed or honestly deferred), list unresolved gating findings, list deferred low findings, and write a tight retro — propagate any durable lesson to ARCHITECTURE/ROADMAP/an ADR/CLAUDE.md now (commit it on the integration branch), else "nothing material".
5. Write the CONVERGENCE REPORT to \`docs/CONVERGENCE-${ITERATION_SLUG}.md\` (commit it on the integration branch) AND return it as your text. Per feature: branch, shippable y/n, acceptance status, unresolved gating, deferred low findings, QA evidence, retro propagated. Batch-level: integrated suite result (quoted), smoke evidence, proof of linear history (empty \`git log --merges\`), convergence conflicts + how resolved, and the list of features left out (blocked) with why.
6. PUSH + OPEN THE MR autonomously — do NOT wait for the human, do NOT ask permission (the human delegated finalization by running this build). \`git push -u origin integration/${ITERATION_SLUG}\`, then open ONE MR/PR against the repo's default branch using the project's forge (\`glab mr create\` / \`gh pr create\`; discover which from the remote). MR body = the convergence report's decisions + load-bearing areas to review manually (contract changes, trust boundaries) + deferred/blocked items. Do NOT merge it. If push or MR-open genuinely fails (no remote, auth), report the exact error + the local branch name so the human can finish — that is the ONLY case where you stop short of an open MR.
7. TEAR DOWN the transient scaffolding — but ONLY after the MR is open AND you have verified each shipped feature's commits are present on \`integration/${ITERATION_SLUG}\` (\`git log\` / \`git cherry\` check; quote the confirmation). Then for each SHIPPED feature: \`git worktree remove ${WORKTREE_DIR}/<id>\` and \`git branch -D feat/<id>\`. Also remove the contract-barrier worktree \`${WORKTREE_DIR}/contracts\` (its commits are on ${buildBranch}, which integration was cut from). KEEP: the integration worktree/branch (it holds the pushed branch), \`${buildBranch}\`, and every BLOCKED feature's worktree + branch (un-collected work — never delete it). Report exactly what you removed and what you kept.

Preliminary shippable (tests green, no unresolved gating — these get cherry-picked + shipped): ${JSON.stringify(shippable, null, 2)}
Preliminary blocked (left out, worktrees preserved for the human): ${JSON.stringify(blocked, null, 2)}`,
  { label: 'converge', phase: 'Converge', model: 'opus' },
)

log(`Build complete. ${shippable.length} shippable (pushed + MR opened), ${blocked.length} blocked (worktrees preserved).`)

return {
  iteration: manifest.iterationName,
  iterationSlug: ITERATION_SLUG,
  buildBranch,
  worktreeDir: WORKTREE_DIR,
  contractCommit: barrier.commitSha,
  shippable: shippable.map((r) => ({ id: r.featureId, branch: r.branch })),
  blocked: blocked.map((r) => ({ id: r.featureId, branch: r.branch, unresolvedGating: r.unresolvedGating })),
  convergenceReport: String(convergence).slice(0, 4000),
  nextStep:
    blocked.length > 0
      ? `${shippable.length} feature(s) shipped on integration/${ITERATION_SLUG} (pushed, MR opened, their transient worktrees torn down). Review/merge that MR. The ${blocked.length} blocked feature(s) were left out — their worktrees/branches are preserved; resolve them with the human, then re-run or hand-land.`
      : `All ${shippable.length} features shipped: integration/${ITERATION_SLUG} pushed, MR opened, transient per-feature worktrees torn down. Review and merge the MR (see the convergence report for the URL + manual-review hotspots).`,
}
