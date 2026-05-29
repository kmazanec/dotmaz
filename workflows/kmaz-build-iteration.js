export const meta = {
  name: 'kmaz-build-iteration',
  description:
    'Build an approved iteration in parallel: implement + commit the frozen shared contracts (barrier), then fan out one worktree-isolated workstream per feature — build test-first to the spec checklist, drive the running app for QA evidence, run a full adversarial review panel (spec/security/robustness/efficiency/convention + contrarian) that loops until clean, gate on spec+security findings — and return a convergence report for the human to land as one MR.',
  whenToUse:
    'Run AFTER kmaz-plan-iteration and AFTER a human approves the iteration\'s BUILD-PLAN manifest + the per-spec "Build plan (approved)" sections. Builds autonomously from the approved plan; does not take mid-run input. Every artifact is name-scoped to the iteration slug (branch build/<slug>, worktrees under .claude/worktrees/<slug>/, report CONVERGENCE-<slug>.md), so multiple iterations can build CONCURRENTLY without colliding. All build work is isolated in .claude/worktrees/ — the primary worktree (where the human works on main) is never touched. Stops at per-feature pushed branches + a convergence report — the human converges them into one linear MR.',
  phases: [
    { title: 'Load', detail: 'read the approved manifest + per-feature plans; sanity-check it is approved' },
    { title: 'Contract barrier', detail: 'implement + commit the frozen shared contracts on the build branch before any fan-out', model: 'opus' },
    { title: 'Build', detail: 'per feature, in its own worktree: TDD each chunk to green, drive the running app for QA evidence' },
    { title: 'Review', detail: 'per feature: adversarial panel (spec/security/robustness/efficiency/convention/contrarian), looped until clean, then gated triage-fix' },
    { title: 'Converge', detail: 'integrated suite + end-to-end smoke on the assembled batch; emit the convergence report' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-build-iteration — Phase 2 of the two-phase parallel-feature build.
//
// Consumes the artifact kmaz-plan-iteration produced and a human approved.
// Runs autonomously (workflows take no mid-run input). The human gate already
// happened: it was approving the manifest. This workflow ends at per-feature
// pushed branches + a structured convergence report; the human (or the calling
// Opus session) lands them as ONE linear MR — that final integration + the real
// MR open are deliberately kept OUT of the workflow because they are the
// judgment-heavy, hard-to-reverse, outward-facing steps.
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
  },
}

// One reviewer covers MULTIPLE dimensions in a single read of the diff and
// returns all findings tagged by dimension — replaces N separate per-dimension
// reviewer agents.
const GROUPED_REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    dimensionsCovered: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: FINDING_PROPS },
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
// Each feature runs its OWN worktree-isolated workstream through build then a
// looped adversarial review. pipeline() so a feature that finishes building
// moves into review while another is still building — no global barrier.
// Hard-dep ordering ("after") is respected by gating each feature on its deps.

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

Return the structured build result with quoted test + QA evidence, your branch, your worktree path, and the commits.`,
    { label: `build:${f.id}`, phase: 'Build', schema: BUILD_SCHEMA, model, isolation: 'worktree' },
  )
}

// Review + loop-until-clean + gated triage-fix for one built feature.
async function reviewFeature(build, f) {
  if (!build) return null
  const model = tierModel(f.tier)

  // Consolidated panel: TWO reviewers per feature, each reading the diff ONCE
  // and covering several dimensions, returning findings tagged by dimension.
  // Each reviewer SELF-VERIFIES (reports only findings it confirmed against the
  // cited code, omits the uncertain) — that is what lets us drop the old
  // one-agent-per-finding refutation round. Risk-scaled: internal tooling
  // (validation harness, dev scripts — no request surface, no trust boundary)
  // gets only the reasoning reviewer's spec+convention pass; everything else
  // gets the full two-reviewer panel. Caller can force full with args.fullPanel.
  const isInternalTooling =
    f.riskProfile === 'internal' ||
    /valid|eval|harness|script|tooling/i.test(`${f.id} ${f.title ?? ''} ${f.specPath ?? ''}`)
  const fullPanel = args?.fullPanel === true || !isInternalTooling

  // The "reasoning" reviewer (opus): the dimensions where the Opus/Sonnet gap is
  // widest — judging acceptance criteria, security reasoning, and adversarially
  // trying to break the feature. The "mechanical" reviewer (sonnet): the
  // checklist dimensions. For internal tooling we drop security+contrarian+
  // efficiency and keep spec+convention+robustness on the cheaper reviewer.
  const REVIEWERS = fullPanel
    ? [
        {
          key: 'reasoning',
          model: 'opus',
          dims: 'spec-compliance, security, contrarian',
          prompt:
            'Cover THREE dimensions in one read of the diff:\n' +
            '• spec-compliance: does it satisfy EVERY acceptance criterion in the spec and honor every cited ADR? Any missed/partial criterion is GATING. Flag contract drift as gating.\n' +
            '• security: input validation, injection, secret handling, authn/authz, trust boundaries, SSRF, project safety invariants. high/medium are GATING.\n' +
            '• contrarian: ignore the happy path — find the input/state/integration that BREAKS an invariant or defeats a criterion, or a test that passes for the wrong reason. Anything defeating a criterion is gating.',
        },
        {
          key: 'mechanical',
          model: 'sonnet',
          dims: 'robustness, efficiency, convention',
          prompt:
            'Cover THREE dimensions in one read of the diff:\n' +
            '• robustness: edge cases, failure modes, error handling, resource cleanup, concurrency, retries, timeouts. high/medium gating.\n' +
            '• efficiency: needless work, hot-path allocations, N+1 queries, oversized payloads, wasted re-renders. Rarely gating unless it breaks a stated perf criterion.\n' +
            '• convention: grep the diff for `F-[0-9]` and flag EVERY hit in code/config/env-templates/prompts/committed-docs (allowed only in the spec file / commit messages); flag inline architectural decisions that belong in an ADR; flag any secret/.env content in the diff. These convention hits are ALWAYS gating.',
        },
      ]
    : [
        {
          key: 'reasoning',
          model: 'sonnet',
          dims: 'spec-compliance, robustness, convention',
          prompt:
            'Internal tooling — cover THREE dimensions in one read of the diff:\n' +
            '• spec-compliance: every acceptance criterion met + cited ADRs honored? missed/partial = GATING.\n' +
            '• robustness: failure modes, error handling, resource cleanup for the script/harness. high/medium gating.\n' +
            '• convention: `F-[0-9]` leaks, inline ADR-worthy decisions, secrets in the diff — ALWAYS gating.',
        },
      ]

  let round = 0
  let cleanRounds = 0
  const allConfirmed = []
  let lastFixSummary = ''

  while (round < MAX_REVIEW_ROUNDS && cleanRounds < 1) {
    round++

    // Run the (1–2) consolidated reviewers concurrently against the branch.
    const reviews = await parallel(
      REVIEWERS.map((r) => () =>
        agent(
          `Adversarially review feature ${f.id} on branch \`${build.branch}\` (worktree \`${build.worktree}\`), round ${round}. Spec: \`${f.specPath}\`. ${round > 1 ? `A prior round already fixed: ${lastFixSummary}. Find what is STILL wrong or newly introduced.` : ''}\n\nRead the diff ONCE and review these dimensions: ${r.dims}.\n${r.prompt}\n\nFor EACH finding: read the cited code to CONFIRM it is real before reporting it; set selfVerified:true only when you did. If you cannot confirm a finding, OMIT it rather than reporting it speculatively. Tag each finding with its dimension, severity, file:line/quoted evidence, a concrete fix, and the gating flag.`,
          { label: `review:${f.id}:${r.key}:r${round}`, phase: 'Review', schema: GROUPED_REVIEW_SCHEMA, model: r.model },
        ),
      ),
    )

    // Self-verified findings only. (A reviewer that can't confirm omits it; this
    // replaces the separate refutation pass for everything except high-sev sec/spec.)
    const findings = reviews
      .filter(Boolean)
      .flatMap((r, i) => (r.findings ?? []).map((x, j) => ({ ...x, _fid: `${i}.${j}` })))
      .filter((x) => x.selfVerified !== false)
    if (!findings.length) {
      cleanRounds++
      log(`${f.id} review round ${round}: clean.`)
      break
    }

    // CONDITIONAL skeptic: only high-severity security/spec findings get a second
    // adversarial pass (a false positive there is the expensive kind). One batched
    // agent triages them all; everything else is trusted from the self-verified panel.
    const highStakes = findings.filter(
      (x) => x.severity === 'high' && (x.dimension === 'security' || x.dimension === 'spec-compliance'),
    )
    let refuted = new Set()
    if (highStakes.length) {
      const skeptic = await agent(
        `Batch-TRIAGE these ${highStakes.length} high-severity security/spec finding(s) on feature ${f.id} (branch \`${build.branch}\`, worktree \`${build.worktree}\`). Read the ACTUAL code at each cited location. For EACH: real, or false-positive / already-handled / misread? Default to refuting when uncertain.\n\n${highStakes.map((x) => `[id ${x._fid}] "${x.title}" [${x.dimension}] — ${x.evidence}`).join('\n')}\n\nReturn { verdicts: [{ id, real, revisedSeverity, why }] } for every id.`,
        { label: `skeptic:${f.id}:r${round}`, phase: 'Review', schema: BATCH_VERDICT_SCHEMA, model: 'opus' },
      )
      for (const v of skeptic?.verdicts ?? []) {
        if (!v.real || v.revisedSeverity === 'invalid') refuted.add(String(v.id))
      }
    }

    const realFindings = findings.filter((x) => !refuted.has(String(x._fid)))
    allConfirmed.push(...realFindings)

    // Triage: gating findings MUST be fixed; low non-gating are recorded + deferred.
    const gating = realFindings.filter((x) => x.gating || x.severity === 'high' || x.severity === 'medium')
    if (!gating.length) {
      log(`${f.id} review round ${round}: ${realFindings.length} confirmed (${highStakes.length} skeptic-checked), none gating — recording, stopping.`)
      cleanRounds++
      break
    }

    // Fix the gating findings on the feature branch, re-run tests. Sonnet: each
    // finding arrives self-verified with a cited location + proposed fix —
    // localized mechanical work. A fix needing a contract change or redesign is
    // escalated (STOP), not improvised.
    const fix = await agent(
      `Fix these GATING review findings on feature ${f.id} (branch \`${build.branch}\`, worktree \`${build.worktree}\`), then re-run the suite (\`${testCommand}\`) until green and commit (Conventional Commits, type \`fix\`). ${frozenBrief}\n\nIf a fix would require changing a frozen contract, OR re-architecting rather than a localized edit, STOP and report it instead of forking the contract or guessing.\n\nGating findings:\n${JSON.stringify(gating, null, 2)}\n\nReturn a one-line summary of what you changed and the quoted green suite result.`,
      { label: `fix:${f.id}:r${round}`, phase: 'Review', model: 'sonnet' },
    )
    lastFixSummary = String(fix).slice(0, 500)
    log(`${f.id} review round ${round}: fixed ${gating.length} gating finding(s).`)
  }

  // NO per-feature verdict agent — return the raw outcome; converge folds these
  // into the shippable/blocked decision + retro for the whole batch at once.
  const unresolvedGating = allConfirmed.filter((x) => x.gating || x.severity === 'high' || x.severity === 'medium')
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
// NOT a real merge into main — that (and opening the MR) is the judgment-heavy,
// hard-to-reverse step the human owns. This phase assembles the parallel feature
// branches onto a throwaway integration branch by CHERRY-PICK/REBASE ONLY (zero
// merge commits — linear history is mandatory; it's verified with
// `git log --merges` and proven in the report), runs the integrated suite + an
// end-to-end smoke to surface green-in-isolation/broken-on-integration, and
// emits the convergence report with an ordered, merge-free landing recipe.

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
  `You are the integrator running the convergence review for the assembled iteration "${manifest.iterationName}". The frozen contracts are on \`${buildBranch}\` @ ${barrier.commitSha}; each feature built on its own branch off that.

DO NOT open a PR/MR and DO NOT do the final merge — the human owns landing this as one linear MR. Your job is the convergence CHECK + the per-feature verdict + the report (this phase ALSO produces the final per-feature shippable verdict + retro — there is no separate verdict step):
1. Assemble the shippable feature branches onto an iteration-scoped throwaway integration branch \`integration/${ITERATION_SLUG}\` in a NEW worktree: \`git worktree add ${WORKTREE_DIR}/integration -b integration/${ITERATION_SLUG} ${buildBranch}\` (scoped so a concurrent iteration's integration never collides with this one). Work entirely in that worktree — NEVER \`git checkout\`/\`switch\` the primary worktree, the human works there on main.
   LINEAR HISTORY IS MANDATORY — the result must have ZERO merge commits. Assemble ONLY by cherry-picking each shippable feature branch's commits onto \`integration/${ITERATION_SLUG}\` in DAG order (\`git cherry-pick\`), or equivalently \`git rebase --onto\`. NEVER run \`git merge\` (and never \`cherry-pick -m\`/allow a merge commit) — a merge commit is a failure of this step. Resolve the predicted convergence in place as ordinary commits as you pick. If a real conflict needs human judgment, STOP that feature and report it — don't force it. After assembling, VERIFY linearity: \`git log --merges ${buildBranch}..integration/${ITERATION_SLUG}\` MUST print nothing; if it prints anything, you created a merge commit — redo that pick. Quote the empty result (or the linear \`git log --oneline --graph\`) into the report as proof.
2. Run the FULL integrated suite (\`${testCommand}\`) on the assembled branch.
3. ${SKIP_APP_SMOKE ? 'App smoke skipped this run — rely on the integrated suite.' : `Run ONE end-to-end smoke of the assembled app (${manifest.runAppHint ?? 'how a user runs it'}): exercise the iteration's primary new path + one neighbouring existing path (regression check). Quote the observed evidence.`}
4. Per feature, FINALIZE the verdict from its review outcome below: confirm shippable (every acceptance criterion met, no unresolved high/medium security or contract drift, suite green, smoke passed or honestly deferred), list unresolved gating findings needing the human, list deferred low findings, and write a tight retro — propagate any durable lesson to ARCHITECTURE/ROADMAP/an ADR/CLAUDE.md now if it is a doc you can edit on the integration branch, else note "nothing material".

Then write a CONVERGENCE REPORT (as a Markdown file \`docs/CONVERGENCE-${ITERATION_SLUG}.md\` AND as your returned text) covering, per feature: branch name, shippable y/n, acceptance status, unresolved gating findings, deferred low findings, QA evidence, retro propagation made. Plus batch-level: the integrated suite result (quoted), the smoke evidence, the proof of linear history (the empty \`git log --merges\` output), the convergence conflicts hit + how resolved, and an ORDERED cherry-pick recipe (exact \`git cherry-pick\`/\`git rebase\` commands, in DAG order) the human follows to land the single linear MR. State explicitly in the recipe that it uses cherry-pick/rebase only and produces NO merge commits — the human must keep main's history linear (ff-only / rebase, never \`git merge\`). End with explicit next steps for the human.

Preliminary shippable (tests green, no unresolved gating): ${JSON.stringify(shippable, null, 2)}
Preliminary blocked (needs human): ${JSON.stringify(blocked, null, 2)}`,
  { label: 'converge', phase: 'Converge', model: 'opus' },
)

log(`Build complete. ${shippable.length} shippable, ${blocked.length} blocked (preliminary). Convergence report written.`)

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
      ? `Resolve the ${blocked.length} blocked feature(s) with the human, then land the shippable branches as one linear MR (cherry-pick/rebase only, NO merge commits) per the convergence report's recipe.`
      : `All ${shippable.length} features shippable. Land them as one linear MR following the convergence report's ordered cherry-pick recipe (no merge commits — keep main's history linear), then tear down the per-feature worktrees/branches.`,
}
