export const meta = {
  name: 'kmaz-build-iteration',
  description:
    'Build an approved iteration in parallel: implement + commit the frozen shared contracts (barrier), then fan out one worktree-isolated workstream per feature — build test-first to the spec checklist, drive the running app for QA evidence, run a full adversarial review panel (spec/security/robustness/efficiency/convention + contrarian) that loops until clean, gate on spec+security findings — and return a convergence report for the human to land as one MR.',
  whenToUse:
    'Run AFTER kmaz-plan-iteration and AFTER a human approves the BUILD-PLAN.md manifest + the per-spec "Build plan (approved)" sections. Builds autonomously from the approved plan; does not take mid-run input. Stops at per-feature pushed branches + a convergence report — the human converges them into one linear MR.',
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
// Isolation model (approved): ONE git worktree per FEATURE. Sub-task agents
// within a feature share that feature's worktree; features never clobber each
// other because each owns its own tree + branch. The contract barrier runs
// first on a shared build branch that every feature worktree forks from.
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
const MAX_REVIEW_ROUNDS = Number.isInteger(args?.reviewRounds) ? args.reviewRounds : 3
const SKIP_APP_SMOKE = args?.skipAppSmoke === true

// === Schemas ===============================================================

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['approved', 'iterationName', 'buildBranch', 'frozenContracts', 'features'],
  properties: {
    approved: { type: 'boolean', description: 'true only if the manifest shows it has been approved (Status not "Awaiting approval") AND has no unresolved blockers' },
    approvalEvidence: { type: 'string', description: 'the line/marker that shows approval, or why you judged it approved' },
    iterationName: { type: 'string' },
    buildBranch: { type: 'string', description: 'the base branch contracts land on and features fork from, e.g. build/<iteration-slug>' },
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

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['dimension', 'findings'],
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'evidence', 'gating'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string', description: 'file:line or quoted output' },
          fix: { type: 'string', description: 'the concrete fix' },
          gating: { type: 'boolean', description: 'true if this is a missed acceptance criterion or a high/medium security/contract issue — blocks shipping until fixed' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['real', 'reason'],
  properties: {
    real: { type: 'boolean', description: 'false if you can refute the finding; default to refuting if uncertain' },
    reason: { type: 'string' },
    revisedSeverity: { type: 'string', enum: ['high', 'medium', 'low', 'invalid'] },
  },
}

const FEATURE_RESULT_SCHEMA = {
  type: 'object',
  required: ['featureId', 'shippable', 'branch', 'roundsRun', 'unresolvedGating'],
  properties: {
    featureId: { type: 'string' },
    shippable: { type: 'boolean', description: 'true iff all acceptance criteria met, no unresolved high/medium security or contract drift, suite green, app smoke passed (or honestly deferred)' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    roundsRun: { type: 'integer' },
    unresolvedGating: { type: 'array', items: { type: 'string' }, description: 'gating findings that could NOT be auto-fixed and need the human' },
    deferredLowFindings: { type: 'array', items: { type: 'string' } },
    qaEvidence: { type: 'string' },
    retro: { type: 'string', description: 'what this feature taught us that should propagate to ARCHITECTURE/ROADMAP/ADR/CLAUDE.md — or "nothing material"' },
    summary: { type: 'string' },
  },
}

// === Phase 1: Load =========================================================

phase('Load')

const manifest = await agent(
  `Read the approved build manifest at \`${MANIFEST_PATH}\` and the per-feature "Build plan (approved)" sections in each spec it references. This is read-only.

If that exact path doesn't exist, the manifest may live elsewhere depending on the project's docs layout: the current layout writes it inside the iteration dir (\`docs/iterations/NN-<slug>/BUILD-PLAN.md\`); the LEGACY flat layout writes it at \`docs/BUILD-PLAN.md\`. Locate the iteration's BUILD-PLAN.md under \`docs/\` and use it. The feature specs may correspondingly be either nested under an iteration dir or flat in \`docs/features/\` — follow whatever specPaths the manifest names; the build is layout-agnostic.

Determine:
- Whether the plan is APPROVED. It is approved only if its Status is NOT "Awaiting approval" (a human flips it, e.g. to "Approved") AND its Blockers list is empty/"None". If it still says awaiting-approval or has blockers, set approved=false and explain — the build must NOT proceed on an unapproved plan.
- The build branch name (use the manifest's if present, else propose \`build/<iteration-slug>\`).${BUILD_BRANCH ? ` The caller specified buildBranch="${BUILD_BRANCH}" — use it.` : ''}
- The frozen contracts (name, source of truth, signature, per-feature extensions, exhaustive consumers).
- The features (id, spec path, title, whole-feature tier, hard-dep "after" list).
- The repo's ACTUAL test command (discover it — do not assume a stack) and how a user runs the app (for QA).

Return the structured manifest.`,
  { label: 'load-manifest', phase: 'Load', schema: MANIFEST_SCHEMA, model: 'opus' },
)

if (!manifest.approved) {
  log('⛔ Manifest is not approved (or has blockers). Stopping before any build work.')
  return { stopped: true, reason: 'manifest-not-approved', evidence: manifest.approvalEvidence, blockers: manifest.blockers ?? [] }
}

const buildBranch = BUILD_BRANCH ?? manifest.buildBranch
const testCommand = manifest.testCommand
log(`Approved: ${manifest.iterationName}. ${manifest.features.length} feature(s) onto ${buildBranch}. Test cmd: ${testCommand}`)

// === Phase 2: Contract barrier =============================================
// HARD BARRIER. One Opus agent implements + commits the frozen contracts to the
// build branch BEFORE any feature fans out. It pre-commits every feature's
// additive extension together with the consumers that must stay exhaustive, so
// the parallel workstreams build against a frozen shape and there are no late
// non-exhaustiveness breaks. Worktree isolation so it owns the build branch.

phase('Contract barrier')

const barrier = await agent(
  `You are landing the frozen shared contracts for a parallel build, BEFORE any feature work. Create the build branch \`${buildBranch}\` off the repo's main/default branch (in its own worktree under the project's worktree convention or \`<repo_root>/.worktrees/\`), implement the minimum-viable form of EVERY contract below, pre-commit EVERY feature's additive extension TOGETHER with every consumer that must stay exhaustive over it (so no switch/validator/provider-schema breaks when features land), run the suite (\`${testCommand}\`) until green, and commit.

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
    `You are building feature ${f.id} ("${f.title ?? ''}") end-to-end in its OWN git worktree + branch \`feat/${f.id.toLowerCase()}\`, forked from \`${buildBranch}\` @ ${barrier.commitSha} (which carries the frozen contracts). Worktree under the project's convention or \`<repo_root>/.worktrees/\`.

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

  const DIMENSIONS = [
    { key: 'spec-compliance', tier: 'opus', prompt: 'Briefed with the feature spec, the ADRs it cites, and the diff: does this satisfy EVERY acceptance criterion and honor every referenced ADR constraint? Return a per-criterion met/partial/missed verdict with file:line or quoted-output evidence. Any missed/partial criterion is a GATING finding. Flag any contract drift as gating.' },
    { key: 'security', tier: 'opus', prompt: 'Review input validation, injection, secret handling, authn/authz, trust boundaries, and project-specific safety invariants. Rate high/medium/low. high/medium are GATING.' },
    { key: 'robustness', tier: 'sonnet', prompt: 'Edge cases, failure modes, error handling, resource cleanup, concurrency, retries, timeouts. Rate severity. high/medium gating.' },
    { key: 'efficiency', tier: 'sonnet', prompt: 'Needless work, hot-path allocations, N+1 queries, complexity, wasted re-renders, oversized payloads. Rate severity; rarely gating unless it breaks a stated perf criterion.' },
    { key: 'convention', tier: 'sonnet', prompt: 'Grep the diff for `F-[0-9]` and flag EVERY hit in code/config/env-templates/prompts/committed-docs (allowed only in the spec file / commit messages). Flag any inline architectural decision that belongs in an ADR. Flag any secret or .env content that leaked into the diff. These are ALWAYS gating (fixed, not deferred).' },
    { key: 'contrarian', tier: 'opus', prompt: 'You are a skeptical senior engineer. Ignore the happy path the builder tested. Try to BREAK this feature: the input they did not consider, the state that violates an invariant, the integration that will surprise a downstream feature, the assumption baked into a test that makes it pass for the wrong reason. Anything that defeats an acceptance criterion is gating.' },
  ]

  let round = 0
  let cleanRounds = 0
  const allConfirmed = []
  let lastFixSummary = ''

  while (round < MAX_REVIEW_ROUNDS && cleanRounds < 1) {
    round++

    // Run the panel concurrently against the current state of the branch.
    const reviews = await parallel(
      DIMENSIONS.map((d) => () =>
        agent(
          `Adversarially review feature ${f.id} on branch \`${build.branch}\` (worktree \`${build.worktree}\`), review round ${round}. Spec: \`${f.specPath}\`. ${round > 1 ? `A prior round already fixed: ${lastFixSummary}. Find what's STILL wrong or newly introduced.` : ''}\n\nYour dimension: ${d.prompt}\n\nReturn findings with severity, file:line/quoted evidence, a concrete fix, and the gating flag.`,
          { label: `review:${f.id}:${d.key}:r${round}`, phase: 'Review', schema: REVIEW_SCHEMA, model: d.tier },
        ),
      ),
    )

    const findings = reviews.filter(Boolean).flatMap((r) => (r.findings ?? []).map((x) => ({ ...x, dimension: r.dimension })))
    if (!findings.length) {
      cleanRounds++
      log(`${f.id} review round ${round}: clean.`)
      break
    }

    // Adversarially VERIFY each finding before acting — kill plausible-but-wrong ones.
    const verified = await parallel(
      findings.map((finding) => () =>
        agent(
          `Try to REFUTE this review finding on feature ${f.id} (branch \`${build.branch}\`). Read the actual code at the cited location. Finding: "${finding.title}" [${finding.severity}, ${finding.dimension}] — evidence: ${finding.evidence}. Is it REAL, or a false positive / already-handled / misread? Default to refuting if uncertain. If real, confirm or revise its severity.`,
          { label: `verify:${f.id}:r${round}`, phase: 'Review', schema: VERDICT_SCHEMA, model: 'sonnet' },
        ).then((v) => ({ finding, verdict: v })),
      ),
    )

    const realFindings = verified
      .filter(Boolean)
      .filter((x) => x.verdict?.real && x.verdict?.revisedSeverity !== 'invalid')
      .map((x) => ({ ...x.finding, severity: x.verdict.revisedSeverity ?? x.finding.severity }))

    if (!realFindings.length) {
      cleanRounds++
      log(`${f.id} review round ${round}: ${findings.length} raw finding(s), all refuted.`)
      break
    }

    // Triage: gating findings (missed criteria, high/medium security, convention, contract drift) MUST be fixed.
    const gating = realFindings.filter((x) => x.gating || x.severity === 'high' || x.severity === 'medium')
    const low = realFindings.filter((x) => !gating.includes(x))
    allConfirmed.push(...realFindings)

    if (!gating.length) {
      log(`${f.id} review round ${round}: ${realFindings.length} confirmed, none gating — recording low findings, stopping.`)
      cleanRounds++
      break
    }

    // Fix the gating findings on the feature branch, re-run tests.
    const fix = await agent(
      `Fix these GATING review findings on feature ${f.id} (branch \`${build.branch}\`, worktree \`${build.worktree}\`), then re-run the suite (\`${testCommand}\`) until green and commit (Conventional Commits, type \`fix\`). ${frozenBrief}\n\nIf a fix would require changing a frozen contract, STOP and report it instead of forking the contract.\n\nGating findings:\n${JSON.stringify(gating, null, 2)}\n\nReturn a one-line summary of what you changed and the quoted green suite result.`,
      { label: `fix:${f.id}:r${round}`, phase: 'Review', model },
    )
    lastFixSummary = String(fix).slice(0, 500)
    log(`${f.id} review round ${round}: fixed ${gating.length} gating finding(s).`)
  }

  // Final verdict + retro for this feature.
  return agent(
    `Produce the final verdict for feature ${f.id} (branch \`${build.branch}\`). Spec: \`${f.specPath}\`. ${MAX_REVIEW_ROUNDS} max review rounds, ${round} run.

Build result: ${JSON.stringify(build, null, 2)}
Confirmed findings across all rounds: ${JSON.stringify(allConfirmed, null, 2)}

Decide \`shippable\`: true ONLY iff every acceptance criterion is met, there is no unresolved high/medium security finding, no unresolved contract drift, the suite is green, and the app smoke passed or was honestly deferred. List any \`unresolvedGating\` findings that could not be auto-fixed and need the human. List \`deferredLowFindings\`. Write a tight \`retro\`: what this feature taught us that should propagate to ARCHITECTURE/ROADMAP/an ADR/CLAUDE.md (make the propagation edit now if it's a doc you can edit on this branch), or "nothing material". Return the structured result.`,
    { label: `verdict:${f.id}`, phase: 'Review', schema: FEATURE_RESULT_SCHEMA, model: 'opus' },
  )
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
// NOT a real merge — that (and opening the MR) is the judgment-heavy,
// hard-to-reverse step the human owns. This phase runs the integrated suite +
// an end-to-end smoke on the assembled batch to surface
// green-in-isolation/broken-on-integration, and emits the convergence report.

phase('Converge')

const shippable = featureResults.filter((r) => r.shippable)
const blocked = featureResults.filter((r) => !r.shippable)

const convergence = await agent(
  `You are the integrator running the convergence review for the assembled iteration "${manifest.iterationName}". The frozen contracts are on \`${buildBranch}\` @ ${barrier.commitSha}; each feature built on its own branch off that.

DO NOT open a PR/MR and DO NOT do the final merge — the human owns landing this as one linear MR. Your job is the convergence CHECK + report:
1. Assemble the shippable feature branches onto a throwaway integration branch off \`${buildBranch}\` (rebase/cherry-pick in DAG order; resolve the predicted convergence in place). If a real conflict needs human judgment, STOP that feature and report it — don't force it.
2. Run the FULL integrated suite (\`${testCommand}\`) on the assembled branch.
3. ${SKIP_APP_SMOKE ? 'App smoke skipped this run — rely on the integrated suite.' : `Run ONE end-to-end smoke of the assembled app (${manifest.runAppHint ?? 'how a user runs it'}): exercise the iteration's primary new path + one neighbouring existing path (regression check). Quote the observed evidence.`}

Then write a CONVERGENCE REPORT (as a Markdown file \`docs/CONVERGENCE-${manifest.iterationName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.md\` AND as your returned text) covering, per feature: branch name, shippable y/n, acceptance status, unresolved gating findings, deferred low findings, QA evidence, and the retro propagation made. Plus batch-level: the integrated suite result (quoted), the smoke evidence, the convergence conflicts hit + how resolved, and an ORDERED cherry-pick/rebase recipe the human can follow to build the single linear MR. End with explicit next steps for the human.

Shippable features: ${JSON.stringify(shippable, null, 2)}
Blocked features (needs human): ${JSON.stringify(blocked, null, 2)}`,
  { label: 'converge', phase: 'Converge', model: 'opus' },
)

log(`Build complete. ${shippable.length} shippable, ${blocked.length} blocked. Convergence report written.`)

return {
  iteration: manifest.iterationName,
  buildBranch,
  contractCommit: barrier.commitSha,
  shippable: shippable.map((r) => ({ id: r.featureId, branch: r.branch })),
  blocked: blocked.map((r) => ({ id: r.featureId, branch: r.branch, unresolvedGating: r.unresolvedGating })),
  convergenceReport: String(convergence).slice(0, 4000),
  nextStep:
    blocked.length > 0
      ? `Resolve the ${blocked.length} blocked feature(s) with the human, then land the shippable branches as one linear MR per the convergence report's recipe.`
      : `All ${shippable.length} features shippable. Land them as one linear MR following the convergence report's ordered recipe, then tear down the per-feature worktrees/branches.`,
}
