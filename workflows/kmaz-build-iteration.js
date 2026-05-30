export const meta = {
  name: 'kmaz-build-iteration',
  description:
    'Build an approved iteration: implement + commit the frozen shared contracts first, then build each feature in its own worktree (independent features concurrently, hard-dependent ones after their deps) — Sonnet builds test-first to the spec checklist running only the impacted tests, drives the running app for QA evidence, then ONE opus reviewer covers all six dimensions (spec/security/robustness/efficiency/convention/contrarian) and delegates each confirmed gating fix to a Sonnet fixer, with a conditional skeptic re-checking only high-severity security/spec. Assembles the shippable features onto one linear integration branch, runs the full suite once, opens ONE MR, and amends each feature\'s outcome into its spec.',
  whenToUse:
    'Run AFTER kmaz-plan-iteration and AFTER the iteration\'s BUILD-PLAN-<slug>.md Status is "Approved" (the assistant flips it on the human\'s verbal approval). Builds autonomously from the approved plan; does not take mid-run input. Every artifact is name-scoped to the iteration slug (branch build/<slug>, worktrees under .claude/worktrees/<slug>/), so multiple iterations can build CONCURRENTLY without colliding. All build work is isolated in .claude/worktrees/ — the primary worktree (where the human works on main) is never touched. Finalizes autonomously: assembles the shippable features onto ONE linear integration branch (cherry-pick, no merge commits), runs the FULL test suite once at the end, amends each feature\'s build outcome into its spec, pushes the branch, opens ONE MR (does not merge it), returns the MR URL to the user (never written to a file), and deterministically tears down the transient per-feature worktrees/branches once the MR is open. Blocked features are left out with their worktrees preserved.',
  phases: [
    { title: 'Load', detail: 'resolve the approved plan unambiguously by slug + per-feature plans; sanity-check it is approved' },
    { title: 'Contract barrier', detail: 'implement + commit the frozen shared contracts on the build branch before any feature work', model: 'opus' },
    { title: 'Build', detail: 'per feature, in its own worktree: Sonnet TDDs each chunk to green running ONLY impacted tests, drives the running app for QA evidence' },
    { title: 'Review', detail: 'per feature: ONE opus reviewer covers all 6 dimensions, a Sonnet fixer applies confirmed gating fixes; conditional skeptic on high-sev sec/spec', model: 'opus' },
    { title: 'Converge', detail: 'full integrated suite + e2e smoke on the assembled batch; amend outcomes into specs, open ONE MR, deterministic teardown' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-build-iteration — phase 2 of the two-phase feature build.
//
// Shared pipeline conventions (model tiering — Sonnet builds/Opus reviews,
// worktree isolation, timeless code comments, dependency-only scheduling, the
// compound loop) are canonical in dotmaz/skills/kmaz-pipeline/CONVENTIONS.md.
// A workflow can't read that file at runtime, so every agent() prompt below
// EMBEDS the rules its sub-agent needs inline (the prompt is all the sub-agent
// sees). MAINTAINER RULE: changing a shared rule means updating CONVENTIONS.md
// AND the prompts here that embed it — the spine alone changes nothing at
// runtime. The notes below are this workflow's specifics.
//
// Consumes the plan kmaz-plan-iteration produced and a human approved (its
// Status flipped to "Approved" in conversation). Runs autonomously (workflows
// take no mid-run input). The human gate already happened — approving the plan —
// so finalization is autonomous too: the workflow assembles the shippable
// features onto ONE linear integration branch (cherry-pick, zero merge commits),
// runs the full suite once, amends each feature's outcome into its spec, pushes,
// and opens ONE MR. It returns the MR URL to the USER (never writes it to a file
// — that forces another commit/push and the back-link rots). It does NOT merge
// the MR (the human does) and does NOT wait for permission to push. A
// DETERMINISTIC post-step (not the converge agent's checklist) tears down the
// transient per-feature worktrees/branches once the MR is open and the commits
// are verified present. Blocked features are left out, worktrees preserved.
//
// MODEL TIERS, SCHEDULING, ISOLATION: per CONVENTIONS.md — Sonnet builds / Opus
// reviews (the reviewer delegates fixes back to a Sonnet fixer); the build
// schedules all concurrency off feature.after (hard deps); all work is isolated
// in .claude/worktrees/, never the primary worktree. This workflow's specifics:
// ONE worktree per FEATURE, and the contract step runs first on a shared build
// branch (its own worktree) that every feature worktree forks from.
//
// PARALLEL ITERATIONS: every artifact is slug-scoped — build/<slug>, worktrees
// under .claude/worktrees/<slug>/, integration/<slug> — so two iterations build
// concurrently without colliding. Don't reintroduce an unscoped shared name.
//
// The plan file (BUILD-PLAN-<slug>.md) carries each feature's specPath, so this
// workflow is layout-agnostic — it reads whatever paths the plan names.
//
// `args` — accepted in TWO forms (the skill/slash-command invocation passes a
// BARE STRING; a programmatic caller may pass the object):
//   "<path-to-BUILD-PLAN-<slug>.md>"  // bare string, optional leading '@' (slash-command form)
//   { manifestPath?: string,    // path to the iteration's BUILD-PLAN-<slug>.md (caller passes the real one)
//     buildBranch?: string,     // base branch the contracts land on + features fork from
//     reviewRounds?: number,    // max loop-until-clean review rounds per feature (default 1)
//     skipAppSmoke?: boolean }  // skip the app-driving QA/smoke (only if no runnable surface)
// ---------------------------------------------------------------------------

// Normalize args: a bare string IS the manifest path (the slash-command form),
// otherwise read the object's fields. Strip a leading '@' (the @file sugar the
// slash command uses) and surrounding whitespace.
const _argStr = typeof args === 'string' ? args : null
const _manifestPathArg =
  _argStr ?? (typeof args?.manifestPath === 'string' ? args.manifestPath : null)
const MANIFEST_PATH = _manifestPathArg
  ? _manifestPathArg.trim().replace(/^@/, '')
  : null

// HARD STOP on a missing manifest path. We MUST NOT fall back to a hardcoded
// iteration glob: doing so silently built the WRONG (already-shipped) iteration
// once — the caller named iteration 03, the bare-string arg didn't match the
// object-shaped `args?.manifestPath` lookup, and the old `?? 'docs/iterations/01-*/...'`
// default made the load agent build iteration 01 instead. Refuse rather than guess.
if (!MANIFEST_PATH) {
  log('⛔ No BUILD-PLAN manifest path provided. Pass the iteration\'s BUILD-PLAN.md as args (a bare string path, optionally @-prefixed, or { manifestPath }). Refusing to guess an iteration — guessing once built an already-shipped iteration.')
  return { stopped: true, reason: 'no-manifest-path' }
}
const BUILD_BRANCH =
  (typeof args === 'object' && args?.buildBranch) ? args.buildBranch : null // resolved by the load agent if null
// Default 1 (was 3): the plan-iteration pass already ran architect/researcher/
// contrarian drafts + a contract reconciliation that verified every signature
// against real code, so the build review is a confirmation pass, not a from-
// scratch audit. Round 2 only runs if a round-1 fix landed gating changes AND
// the caller raised reviewRounds.
// These only apply in the object form; a bare-string arg leaves them at defaults.
const _argsObj = typeof args === 'object' && args ? args : {}
const MAX_REVIEW_ROUNDS = Number.isInteger(_argsObj.reviewRounds) ? _argsObj.reviewRounds : 1
const SKIP_APP_SMOKE = _argsObj.skipAppSmoke === true

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
        required: ['id', 'specPath', 'after'],
        properties: {
          id: { type: 'string' },
          specPath: { type: 'string' },
          title: { type: 'string' },
          after: { type: 'array', items: { type: 'string' }, description: 'feature ids that must complete before this one (hard deps); empty = starts once contracts are frozen' },
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
// The reviewer DIAGNOSES; it does not fix. Each confirmed gating finding carries
// a concrete `fix` instruction the Sonnet fixer applies, or is `escalated` when
// the fix needs a contract change / re-architecture the human must decide.
const FINDING_PROPS = {
  type: 'object',
  required: ['title', 'dimension', 'severity', 'evidence', 'gating', 'selfVerified'],
  properties: {
    title: { type: 'string' },
    dimension: { type: 'string', enum: ['spec-compliance', 'security', 'contrarian', 'robustness', 'efficiency', 'convention'] },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string', description: 'file:line or quoted output you actually read' },
    fix: { type: 'string', description: 'the concrete, localized fix — specific enough for a Sonnet engineer to apply at the cited location without re-investigating' },
    gating: { type: 'boolean', description: 'true if a missed acceptance criterion, a high/medium security/contract issue, or a convention violation (ephemeral process ref in code / secret / inline ADR) — blocks shipping until fixed' },
    selfVerified: { type: 'boolean', description: 'true ONLY if you READ the cited code and confirmed this is real (not a guess). Omit findings you cannot self-verify rather than reporting them low-confidence.' },
    escalated: { type: 'boolean', description: 'true if fixing this would need a frozen-contract change or a re-architecture (not a localized edit) — it needs the human, NOT the Sonnet fixer. Leave gating with escalated=true.' },
  },
}

// ONE Opus reviewer per feature covers ALL six dimensions in a single read of
// the scoped diff and self-verifies each finding against the cited code — but it
// does NOT fix anything. It returns the findings; the orchestrator hands the
// confirmed, non-escalated gating ones to a SONNET fixer (Opus reviews, Sonnet
// types). This keeps the expensive model on judgment and the cheap one on edits.
const GROUPED_REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    dimensionsCovered: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: FINDING_PROPS },
  },
}

// The Sonnet fixer applies the reviewer's confirmed gating fixes and reports
// what it changed + the quoted green impacted-test result.
const FIX_RESULT_SCHEMA = {
  type: 'object',
  required: ['fixedIds', 'testsGreen'],
  properties: {
    fixedIds: { type: 'array', items: { type: 'string' }, description: 'the finding ids you fixed + committed' },
    unfixedIds: { type: 'array', items: { type: 'string' }, description: 'ids you could NOT fix as a localized edit (report back; do not force)' },
    fixSummary: { type: 'string', description: 'one-line summary of the fixes applied' },
    testsGreen: { type: 'boolean', description: 'true only if the impacted tests are green after your fixes' },
    testEvidence: { type: 'string', description: 'quoted green impacted-test result' },
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
// per-feature shippable/blocked verdict + retro in one pass — there is NO
// separate per-feature verdict agent and NO separate convergence-report file
// (each feature's outcome is amended into its own spec instead).

// The converge agent assembles + pushes + opens the MR, then reports back the
// MR URL and EXACTLY which feature ids landed on the integration branch — that
// `shipped` list keys the deterministic teardown post-step (so cleanup doesn't
// depend on the agent finishing a checklist). The MR URL is returned to the
// user, never written to a file.
const CONVERGE_SCHEMA = {
  type: 'object',
  required: ['integrationBranch', 'mrOpened', 'shipped'],
  properties: {
    integrationBranch: { type: 'string' },
    suiteGreen: { type: 'boolean', description: 'true only if the FULL integrated suite ended green on the assembled branch' },
    suiteEvidence: { type: 'string', description: 'quoted suite result line' },
    smokeEvidence: { type: 'string', description: 'quoted end-to-end smoke evidence, or "skipped"' },
    linearHistoryProof: { type: 'string', description: 'the (empty) output of `git log --merges` proving zero merge commits' },
    mrOpened: { type: 'boolean', description: 'true if the MR/PR is open' },
    mrUrl: { type: 'string', description: 'the open MR/PR URL — returned to the user, NEVER written into any tracked file' },
    pushError: { type: 'string', description: 'the exact error if push/MR-open failed (else empty); when set, mrOpened=false and teardown is skipped so the human can finish' },
    shipped: { type: 'array', items: { type: 'string' }, description: 'feature ids whose commits you VERIFIED are present on the integration branch — these are safe to tear down' },
    leftOut: { type: 'array', items: { type: 'string' }, description: 'feature ids left out (blocked or conflicting) — their worktrees/branches MUST be preserved' },
    summary: { type: 'string', description: 'short human-facing summary of decisions + manual-review hotspots (mirrors the MR body)' },
    learned: { type: 'string', description: 'what building this iteration TAUGHT, in 2-4 plain sentences for the human: a library footgun hit, a perf cliff, a contract that needed an extra variant, an assumption that proved wrong, a place the design fought the implementation. The teaching version of the propagated lessons — empty only if genuinely nothing notable surfaced.' },
  },
}

// === Phase 1: Load =========================================================

phase('Load')

const manifest = await agent(
  `Read the approved build plan at \`${MANIFEST_PATH}\` and the per-feature "Build plan (approved)" sections in each spec it references. This is read-only.

RESOLVE THE RIGHT PLAN — UNAMBIGUOUSLY, BY SLUG. The caller named \`${MANIFEST_PATH}\`; that path's iteration slug (the \`<slug>\` in BUILD-PLAN-<slug>.md, or the iteration-dir name) is authoritative. Steps:
1. If the literal file exists, read it. Confirm its internal \`iterationSlug\` matches the slug in the path; if they conflict, set approved=false and STOP (a renamed/misfiled plan needs the human).
2. If the literal file does NOT exist, it may be a layout variant of the SAME slug: \`docs/iterations/<dir>/BUILD-PLAN-<slug>.md\`, the older \`docs/iterations/<dir>/BUILD-PLAN.md\`, or legacy \`docs/BUILD-PLAN-<slug>.md\`. Enumerate the BUILD-PLAN* files that exist and select ONLY the one whose slug equals the caller's slug.
3. If that enumeration finds ZERO matching the slug, OR MORE THAN ONE plausible plan and you cannot disambiguate by exact slug, set approved=false, list the candidate paths you found in approvalEvidence, and STOP. NEVER pick a different iteration's plan and never "best-guess" among candidates — guessing once silently built an already-shipped iteration. Exact-slug match or stop.
The feature specs may be nested under the iteration dir or flat in \`docs/features/\` — follow whatever specPaths the plan names; the build is layout-agnostic.

Determine:
- Whether the plan is APPROVED. Approved only if its Status is NOT "Awaiting approval" (a human flips it, e.g. to "Approved") AND its Blockers list is empty/"None". Otherwise set approved=false and explain — the build must NOT proceed on an unapproved plan.
- The iteration slug (read \`iterationSlug\` from the plan; if an old plan lacks it, derive a kebab slug from the iteration name). EVERY build artifact is scoped to this so concurrent iterations don't collide — return it.
- The build branch name: use the plan's \`buildBranch\` (it is \`build/<iterationSlug>\`).${BUILD_BRANCH ? ` The caller specified buildBranch="${BUILD_BRANCH}" — use it.` : ''}
- The frozen contracts (name, source of truth, signature, per-feature extensions, exhaustive consumers).
- The features (id, spec path, title, hard-dep "after" list).
- The repo's ACTUAL test command (discover it — do not assume a stack) and how a user runs the app (for QA).

Return the structured plan.`,
  // Sonnet: reads the plan + discovers the test command and fills a schema —
  // extraction, not reasoning.
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
// One Opus agent implements + commits the frozen contracts to the build branch
// BEFORE any feature work. It pre-commits every feature's additive extension
// together with the consumers that must stay exhaustive, so feature workstreams
// build against a frozen shape and there are no late non-exhaustiveness breaks.
// Stays on OPUS (contract shapes are the load-bearing, expensive-to-get-wrong
// part) and in worktree isolation so it owns the build branch.

phase('Contract barrier')

const barrier = await agent(
  `You are landing the frozen shared contracts, BEFORE any feature work. Create the build branch \`${buildBranch}\` in its OWN NEW WORKTREE: \`git worktree add ${WORKTREE_DIR}/contracts -b ${buildBranch} <main/default>\`, working ENTIRELY inside \`${WORKTREE_DIR}/contracts\`. NEVER \`git checkout\`/\`switch\` the primary worktree — the human is working there on main, live; changing its branch yanks files out from under them. (This iteration's worktrees all nest under \`${WORKTREE_DIR}/\` so concurrent iterations never collide.) Implement the minimum-viable form of EVERY contract below, pre-commit EVERY feature's additive extension TOGETHER with every consumer that must stay exhaustive over it (so no switch/validator/provider-schema breaks when features land), and commit.

Before creating the worktree, ensure \`.claude/worktrees/\` is gitignored (it holds transient build trees that must never be committed): if it isn't already ignored, add it to \`.git/info/exclude\` (don't modify a tracked .gitignore unless the project clearly wants it there).

After landing the contracts, run ONLY the tests that exercise these contract shapes + their exhaustive consumers (the named source-of-truth files and their direct test targets) until green — NOT the whole suite (the full suite runs once at convergence). Quote that scoped result.

You MUST NOT implement feature behavior — only the contract shapes + their exhaustive consumers.

CODE COMMENTS DESCRIBE WHAT THE CODE DOES AND WHY IT EXISTS — NEVER THE PROCESS THAT PRODUCED IT. Do NOT reference any feature ID (F-NN), iteration, build plan, manifest, "the barrier", or any planning/build-process artifact in code, config, or comments. Those are ephemeral; the code outlives them. For a non-obvious choice, reference a durable ADR or let the code stand on its own. Keep comments succinct and timeless.

Frozen contracts to land:
${JSON.stringify(manifest.frozenContracts, null, 2)}

Use Conventional Commits. After committing, return: committed=true, the commit sha, the EXACT final signatures as committed (these brief every feature workstream so they consume the real shape), and the quoted green scoped-test result.`,
  { label: 'contract-barrier', phase: 'Contract barrier', schema: BARRIER_SCHEMA, model: 'opus', isolation: 'worktree' },
)

if (!barrier.committed) {
  log('⛔ Contract barrier did not land. Stopping — fanning out without frozen contracts is the failure mode this guards against.')
  return { stopped: true, reason: 'contract-barrier-failed', notes: barrier.notes }
}
log(`Contracts landed @ ${barrier.commitSha}. ${barrier.frozenSignatures.length} signature(s) frozen.`)

const frozenBrief = `The shared contracts are FROZEN and committed on \`${buildBranch}\` @ ${barrier.commitSha}. Consume these signatures WITHOUT modifying them. If you believe you need to change one, STOP and report it as contractDrift — never fork a local copy:\n\n${barrier.frozenSignatures.map((s) => `- ${s}`).join('\n')}`

// === Phases 3–4: per-feature pipeline (Build -> Review) ====================
// Each feature runs its OWN worktree-isolated workstream: a Sonnet build agent,
// then an Opus reviewer, then (only if the reviewer confirms gating findings) a
// Sonnet fixer; a conditional skeptic re-checks high-sev security/spec. A clean
// feature costs 2 agents (Sonnet build + Opus review). Features self-schedule by
// their hard-dep "after" edges — independents run concurrently, dependents wait;
// no global barrier, no parallel/serial bookkeeping.

const byId = new Map()
const featureResultPromises = new Map()

// Build one feature (TDD all chunks + app-driving QA) in its own worktree.
// SONNET builds every feature: the approved per-spec plan is detailed enough to
// carry it, even for high-stakes work. Opus is reserved for the review pass.
async function buildFeature(f) {
  return agent(
    `You are building feature ${f.id} ("${f.title ?? ''}") end-to-end in its OWN NEW git worktree: \`git worktree add ${WORKTREE_DIR}/${f.id.toLowerCase()} -b feat/${f.id.toLowerCase()} ${buildBranch}\` (forked from \`${buildBranch}\` @ ${barrier.commitSha}, which carries the frozen contracts). Work ENTIRELY inside \`${WORKTREE_DIR}/${f.id.toLowerCase()}\`. NEVER \`git checkout\`/\`switch\` the primary worktree — the human works there on main, live. All of this iteration's worktrees nest under \`${WORKTREE_DIR}/\` so a concurrently-building iteration never collides with yours.

${frozenBrief}

Your plan is the "Build plan (approved)" section in the spec \`${f.specPath}\`. Build it test-first, chunk by chunk:
1. Write the tests the chunk's acceptance criteria require (the criteria ARE the test spec).
2. Implement the chunk (smallest change that satisfies the criteria — no scope creep).
3. Run ONLY the tests impacted by this chunk — the test target(s) the plan names for it plus the tests you just wrote — until green. Do NOT run the whole suite during the build (the full suite runs ONCE at convergence); running only the impacted tests keeps the build fast and cheap. Use the narrowest invocation the test runner supports (a file path, a test name/pattern, a package/target filter).
4. VERIFY against the RUNNING system, not just the tests${SKIP_APP_SMOKE ? ' (app-driving QA is globally skipped for this run — cover via integration tests and note "smoke skipped")' : ': drive the real app/CLI/endpoint (use Chrome DevTools or Playwright MCP for a UI, run the binary for a CLI, curl the endpoint for a service — ' + (manifest.runAppHint ?? 'discover how the app runs') + ') and quote the observed evidence (HTTP status / DOM state / screenshot ref / output line)'}. If a chunk genuinely cannot be exercised end-to-end yet because it sits behind an unbuilt caller, say so explicitly — defer deliberately, never skip silently.
5. Tick the checkbox in the spec and commit (Conventional Commits, granular).

Record decisions + rationale into the spec's Implementation-notes as you go.

CODE COMMENTS DESCRIBE WHAT THE CODE DOES AND WHY IT EXISTS — NEVER THE PROCESS THAT PRODUCED IT. Do NOT write any feature ID (F-NN), iteration name, "build plan", manifest reference, or other ephemeral planning/build-process artifact into code, config, env-templates, prompts, or committed docs. The code outlives the plan; a comment that says "added per the build plan" or "F-03" rots into noise. For a non-obvious choice reference a durable ADR (\`// session cookies, not JWT — see ADR-007\`) or let it stand alone; keep comments succinct and timeless. Before each commit, grep your diff for \`F-[0-9]\` and for build-process language ("build plan", "iteration", "manifest", "as planned") in comments and strip any hit. (Planning IDs/process talk belong ONLY in the spec file, commit messages, and the MR body.)

If you hit a contract gap — you think a frozen signature must change — STOP and report it in \`contractDrift\`; do not improvise a contract change. Every test you ran must end GREEN (no pending/failing).

Return the structured build result with quoted test + QA evidence (the impacted-test result, not a full-suite run), your branch, your worktree path, the commits, and — so the reviewer diffs ONCE against the right base instead of re-deriving it — set \`diffRange\` to \`${barrier.commitSha}..HEAD\` and \`changedFiles\` to the output of \`git diff --name-only ${barrier.commitSha}..HEAD\`.`,
    { label: `build:${f.id}`, phase: 'Build', schema: BUILD_SCHEMA, model: 'sonnet', isolation: 'worktree' },
  )
}

// Review (Opus diagnoses) -> skeptic triage of high-stakes -> Sonnet fixer
// applies the confirmed gating fixes. Loop-until-clean across rounds.
async function reviewFeature(build, f) {
  if (!build) return null

  // The diff range + changed files were computed ONCE by the build agent, so the
  // reviewer doesn't re-derive them or re-ingest the whole spec.
  const diffRange = build.diffRange || `${barrier.commitSha}..HEAD`
  const changedFiles = (build.changedFiles ?? []).join(', ') || '(run `git diff --name-only ' + diffRange + '`)'

  let round = 0
  let cleanRounds = 0
  const allConfirmed = []
  let lastFixSummary = ''
  const fixedIdsAll = new Set()

  while (round < MAX_REVIEW_ROUNDS && cleanRounds < 1) {
    round++

    // OPUS reviewer: diagnoses ALL six dimensions in one scoped-diff read,
    // self-verifies each finding, and writes a concrete `fix` per gating finding
    // — but does NOT edit code. Opus thinks; the Sonnet fixer below types.
    const review = await agent(
      `Review feature ${f.id} in worktree \`${build.worktree}\` (branch \`${build.branch}\`), round ${round}. You DIAGNOSE only — do NOT edit, run, or commit code; write down findings with concrete fix instructions and a Sonnet engineer will apply them. ${round > 1 ? `A prior round's fixes already landed: ${lastFixSummary}. Find what is STILL wrong or newly introduced.` : ''}

The feature's changes are EXACTLY \`git diff ${diffRange}\` (changed files: ${changedFiles}). Read that diff ONCE — do not re-derive the range or scan unrelated files. For acceptance criteria, read only the "Acceptance criteria" + "Build plan (approved)" sections of \`${f.specPath}\` (not the whole spec). ${frozenBrief}

Cover ALL SIX dimensions in that one read:
• spec-compliance: satisfies EVERY acceptance criterion + honors every cited ADR? missed/partial = GATING. Contract drift = gating.
• security: input validation, injection, secret handling, authn/authz, trust boundaries, SSRF, project safety invariants. high/medium = GATING.
• contrarian: ignore the happy path — the input/state/integration that BREAKS an invariant or defeats a criterion, or a test passing for the wrong reason. Defeating a criterion = gating.
• robustness: edge cases, failure modes, error handling, resource cleanup, concurrency, retries, timeouts. high/medium gating.
• efficiency: (use the \`efficiency\` dimension for both performance AND simplicity findings). PERFORMANCE — needless work, hot-path allocations, N+1 queries, oversized payloads, wasted re-renders; rarely gating unless it breaks a stated perf criterion. SIMPLICITY/FACTORING — speculative abstraction, premature generalization, an indirection layer or config knob nothing needs, a framework-for-one-use, copy-paste that should be one function, a data shape more complex than the problem; flag the simpler equivalent. Simplicity findings are rarely gating (they're cleanups, not bugs) unless the over-engineering actively obscures a correctness/security issue.
• convention: grep the diff for \`F-[0-9]\` and for build-process language in CODE COMMENTS ("build plan", "iteration", "manifest", "as planned") — flag EVERY hit in code/config/env-templates/prompts/committed-docs (such refs are allowed ONLY in the spec file / commit messages); flag inline architectural decisions that belong in an ADR; flag any secret/.env content. These convention hits are ALWAYS gating.

For EACH finding: read the cited code to CONFIRM it is real before reporting it; set selfVerified:true only when you did. OMIT anything you cannot confirm rather than reporting it speculatively. For each GATING finding write a concrete, localized \`fix\` a Sonnet engineer can apply at the cited location without re-investigating. If a fix would need a frozen-contract change OR a re-architecture (not a localized edit), set escalated:true — that one goes to the human, not the fixer. Record low/non-gating findings too (no fix needed). Return all findings.`,
      { label: `review:${f.id}:r${round}`, phase: 'Review', schema: GROUPED_REVIEW_SCHEMA, model: 'opus' },
    )

    // Self-verified findings only (the reviewer omits what it couldn't confirm).
    const findings = (review?.findings ?? [])
      .map((x, j) => ({ ...x, _fid: `r${round}-${j}` }))
      .filter((x) => x.selfVerified !== false)

    // CONDITIONAL skeptic: only high-severity security/spec findings get an
    // independent second pass (a false positive there is the expensive kind).
    // One batched agent triages them all before we spend a fixer on them.
    const highStakes = findings.filter(
      (x) => x.severity === 'high' && (x.dimension === 'security' || x.dimension === 'spec-compliance'),
    )
    let refuted = new Set()
    if (highStakes.length) {
      const skeptic = await agent(
        `Batch-TRIAGE these ${highStakes.length} high-severity security/spec finding(s) on feature ${f.id} (worktree \`${build.worktree}\`, changes \`git diff ${diffRange}\`). Read the ACTUAL code at each cited location. For EACH: was it a real issue, or a false-positive / misread? Default to refuting when uncertain.\n\n${highStakes.map((x) => `[id ${x._fid}] "${x.title}" [${x.dimension}] — ${x.evidence}`).join('\n')}\n\nReturn { verdicts: [{ id, real, revisedSeverity, why }] } for every id.`,
        { label: `skeptic:${f.id}:r${round}`, phase: 'Review', schema: BATCH_VERDICT_SCHEMA, model: 'opus' },
      )
      for (const v of skeptic?.verdicts ?? []) {
        if (!v.real || v.revisedSeverity === 'invalid') refuted.add(String(v.id))
      }
    }

    const realFindings = findings.filter((x) => !refuted.has(String(x._fid)))
    allConfirmed.push(...realFindings)

    // The gating findings a localized fix can resolve (escalated ones go to the
    // human, not the fixer).
    const toFix = realFindings.filter(
      (x) => (x.gating || x.severity === 'high' || x.severity === 'medium') && x.escalated !== true,
    )

    // SONNET fixer: applies the reviewer's confirmed gating fixes, runs only the
    // impacted tests to green, commits. Opus reviewed; Sonnet types.
    if (toFix.length) {
      const fix = await agent(
        `Apply these ${toFix.length} confirmed gating fix(es) to feature ${f.id} in worktree \`${build.worktree}\` (branch \`${build.branch}\`). Each is a localized edit at a cited location — make exactly the fix described, nothing more (no scope creep, no opportunistic refactors).

${toFix.map((x) => `[id ${x._fid}] ${x.dimension}/${x.severity}: ${x.title}\n  where: ${x.evidence}\n  fix: ${x.fix ?? '(apply the minimal correct fix at the cited location)'}`).join('\n\n')}

After the edits, run ONLY the impacted tests (the ones covering the files you touched) until GREEN — not the whole suite. ${frozenBrief}\n\nDo NOT modify any frozen contract signature; if a fix seems to need one, leave that id in \`unfixedIds\` and report it (don't force it). Keep code comments timeless — never reference a feature ID, the build plan, or any process artifact. Commit with Conventional Commits (type \`fix\`). Return which ids you fixed, which you couldn't, a one-line fixSummary, and the quoted green impacted-test result.`,
        { label: `fix:${f.id}:r${round}`, phase: 'Review', schema: FIX_RESULT_SCHEMA, model: 'sonnet' },
      )
      for (const id of fix?.fixedIds ?? []) fixedIdsAll.add(String(id))
      if (fix?.fixSummary) lastFixSummary = String(fix.fixSummary).slice(0, 500)
    }

    // A round is "clean" (stop looping) when no gating finding remains
    // UNRESOLVED — i.e. every fixable gating finding was fixed and nothing was
    // escalated. Escalated/unfixed gating findings keep it unresolved → human.
    const unresolved = realFindings.filter(
      (x) =>
        (x.gating || x.severity === 'high' || x.severity === 'medium') &&
        !fixedIdsAll.has(String(x._fid)),
    )
    if (!unresolved.length) {
      log(`${f.id} review round ${round}: ${realFindings.length} confirmed (${highStakes.length} skeptic-checked), ${toFix.length} fixed by Sonnet, none unresolved — stopping.`)
      cleanRounds++
      break
    }
    log(`${f.id} review round ${round}: ${unresolved.length} gating finding(s) unresolved (escalated or unfixable).`)
  }

  // Return the raw outcome; converge folds these into the shippable/blocked
  // decision + retro for the whole batch. Only escalated/unfixed gating findings
  // need the human; anything the Sonnet fixer resolved is NOT unresolved.
  const unresolvedGating = allConfirmed.filter(
    (x) =>
      (x.gating || x.severity === 'high' || x.severity === 'medium') &&
      !fixedIdsAll.has(String(x._fid)),
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
// verified with `git log --merges`). This is the ONE place the FULL test suite
// runs (the build + fix steps ran only impacted tests, to stay fast/cheap) plus
// an end-to-end smoke. Each feature's outcome is amended into ITS OWN SPEC (no
// separate convergence-report file); durable lessons still propagate to ADR/
// ROADMAP/CLAUDE.md. Then it pushes the branch and opens ONE MR (does NOT merge
// it — the human does), reporting the MR URL back to the USER only (never into a
// tracked file — that would force another commit/push and rot). Teardown is a
// DETERMINISTIC post-step below, not part of this agent's checklist, so it isn't
// at the mercy of the agent finishing. Autonomous finalization is correct here:
// the human's gate was approving the plan; re-gating the push is the bug it fixes.

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
  `You are the integrator finalizing the iteration "${manifest.iterationName}". The frozen contracts are on \`${buildBranch}\` @ ${barrier.commitSha}; each SHIPPABLE feature built on its own \`feat/<id>\` branch off that. You finalize AUTONOMOUSLY — assemble, amend outcomes, push, open ONE MR. Do NOT wait for the human and do NOT merge into the default branch (the human merges the MR). You do NOT tear down worktrees — a deterministic post-step does that from the \`shipped\` list you return. The only thing that stops you is a real cherry-pick conflict needing human judgment.

1. ASSEMBLE the SHIPPABLE feature branches (below) onto an iteration-scoped integration branch \`integration/${ITERATION_SLUG}\` in a NEW worktree: \`git worktree add ${WORKTREE_DIR}/integration -b integration/${ITERATION_SLUG} ${buildBranch}\` (scoped so a concurrent iteration never collides). Work entirely in that worktree — NEVER \`git checkout\`/\`switch\` the primary worktree, the human works there on main. Ship SHIPPABLE features only; leave any blocked feature OUT (its branch/worktree stays untouched for the human).
   LINEAR HISTORY IS MANDATORY — ZERO merge commits. Assemble ONLY by cherry-picking each shippable feature's commits in dependency order (\`git cherry-pick\`), or \`git rebase --onto\`. NEVER \`git merge\` (and never \`cherry-pick -m\`) — a merge commit is a failure. Resolve predicted convergence in place as ordinary commits. If a real conflict needs human judgment, leave that feature OUT (treat it as blocked) and report it in \`leftOut\` — don't force it. VERIFY linearity: \`git log --merges ${buildBranch}..integration/${ITERATION_SLUG}\` MUST print nothing; quote the empty result in \`linearHistoryProof\`.
2. Run the FULL integrated suite (\`${testCommand}\`) on the assembled branch — this is the ONE full-suite run (the per-feature build + fix steps ran only impacted tests). Fix any failures here: a failure now is an integration break the scoped runs couldn't see. The suite MUST end green before you push.
3. ${SKIP_APP_SMOKE ? 'App smoke skipped this run — rely on the integrated suite.' : `Run ONE end-to-end smoke of the assembled app (${manifest.runAppHint ?? 'how a user runs it'}): exercise the iteration's primary new path + one neighbouring existing path (regression check). Quote the observed evidence in \`smokeEvidence\`.`} DEFINITION OF DONE — trace to the PRD, not just the spec: for each shipped feature, confirm it observably satisfies the PRD acceptance criteria it traces to (the spec's "Requirements traced" links them; the PRD's section 6 criteria are written as Given/When/Then assertions). A feature whose spec boxes are ticked but whose PRD criterion isn't met is NOT done — record it as not-done in that feature's outcome (step 4) and treat it as left-out, not shipped.
4. AMEND EACH FEATURE'S OUTCOME INTO ITS OWN SPEC (there is NO separate convergence-report file). For each feature, append a short "### Build outcome" note under its "## Build plan (approved)" section in its spec file: shippable y/n, acceptance status, any unresolved gating finding, deferred low findings, and a one-line QA evidence quote. Keep it tight — this is the durable record. Commit these spec edits on the integration branch. Do NOT reference ephemeral build-process internals in any code you touch — only in spec/commit text.
5. PROPAGATE DURABLE LESSONS now (commit on the integration branch): a retro lesson that changes the design → ARCHITECTURE.md or a new ADR; that changes the plan → ROADMAP.md; about how to build in this repo → CLAUDE.md. "Nothing material" is a valid outcome — don't manufacture lessons. Separately, fill \`learned\` with the TEACHING version of what building taught (2-4 plain sentences for the human) — the footgun, the perf cliff, the contract that needed another variant, the assumption that broke — so the human learns from the build, not just the agents. This is returned to the human, not written to a file. ALSO update \`docs/STATUS.md\` if it exists (commit on the integration branch): mark this iteration's shipped features shipped and any blocked ones blocked, set the "Now"/"What's next" lines to reflect reality (e.g. the next iteration to plan/build, noting any that can run concurrently). Keep it terse — it's the project's rolling re-entry point. If STATUS.md doesn't exist, skip it (an older project may predate it).
6. PUSH + OPEN THE MR autonomously — do NOT wait for the human, do NOT ask permission (the human delegated finalization by running this build). \`git push -u origin integration/${ITERATION_SLUG}\`, then open ONE MR/PR against the repo's default branch using the project's forge (\`glab mr create\` / \`gh pr create\`; discover which from the remote). MR body = the decisions + load-bearing areas to review manually (contract changes, trust boundaries) + deferred/blocked items. Do NOT merge it. Return the MR URL in \`mrUrl\` — do NOT write it into any tracked file (that forces another commit/push and the back-link rots; the user gets it from your return). If push or MR-open genuinely fails (no remote, auth), set \`pushError\` to the exact error and \`mrOpened\`=false so the human can finish — that is the ONLY case where you stop short of an open MR.
7. REPORT, for the deterministic teardown that runs next: set \`shipped\` to the feature ids whose commits you VERIFIED are present on \`integration/${ITERATION_SLUG}\` (do a \`git log\`/\`git cherry\` check — only ids you confirmed), and \`leftOut\` to the blocked/conflicting ids whose worktrees must be PRESERVED. Do NOT remove any worktree or branch yourself.

Preliminary shippable (tests green, no unresolved gating — cherry-pick + ship these): ${JSON.stringify(shippable.map((r) => ({ id: r.featureId, branch: r.branch, specPath: r.specPath })), null, 2)}
Preliminary blocked (leave OUT, preserve worktrees): ${JSON.stringify(blocked.map((r) => ({ id: r.featureId, branch: r.branch, unresolvedGating: r.unresolvedGating })), null, 2)}`,
  { label: 'converge', phase: 'Converge', schema: CONVERGE_SCHEMA, model: 'opus' },
)

// === Deterministic teardown ================================================
// Teardown runs HERE, in workflow code, keyed off the ids the converge agent
// VERIFIED shipped — not buried in the agent's checklist where an early stop
// would silently skip it. Guard: only if the MR actually opened (a pushError
// means the human still needs the branches), and only for ids in `shipped`
// (never `leftOut`/blocked). A dedicated agent runs the git commands so it can
// re-verify each commit is present before deleting and report what it did.
const shipped = Array.isArray(convergence?.shipped) ? convergence.shipped : []
const leftOut = Array.isArray(convergence?.leftOut) ? convergence.leftOut : blocked.map((r) => r.featureId)
let teardown = null
if (convergence?.mrOpened && !convergence?.pushError && shipped.length) {
  teardown = await agent(
    `Tear down the transient build scaffolding for iteration "${manifest.iterationName}" now that its MR is open. Work via git from the repo root; NEVER \`git checkout\`/\`switch\` the primary worktree (the human works there on main).

For EACH shipped feature id [${shipped.join(', ')}]: FIRST re-verify its commits are present on \`integration/${ITERATION_SLUG}\` (\`git cherry\` / \`git log integration/${ITERATION_SLUG}\` — confirm before deleting; if a feature's commits are NOT there, do NOT delete it, report it under kept). Then for each confirmed one: \`git worktree remove ${WORKTREE_DIR}/<id-lowercased>\` and \`git branch -D feat/<id-lowercased>\`.
Also remove the contract worktree \`${WORKTREE_DIR}/contracts\` (its commits are on \`${buildBranch}\`, which integration was cut from).
KEEP, do NOT touch: the integration worktree/branch \`${WORKTREE_DIR}/integration\` (holds the pushed branch), \`${buildBranch}\`, and every LEFT-OUT/blocked feature's worktree+branch [${leftOut.join(', ') || 'none'}] (un-collected work — never delete it).

Report exactly which worktrees + branches you removed and which you kept.`,
    { label: 'teardown', phase: 'Converge', model: 'sonnet', schema: {
      type: 'object',
      required: ['removed', 'kept'],
      properties: {
        removed: { type: 'array', items: { type: 'string' } },
        kept: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    } },
  )
} else {
  log(`Skipping teardown — ${convergence?.pushError ? 'push/MR-open failed' : 'no MR opened or nothing verified shipped'}. Worktrees preserved for the human.`)
}

const mrLine = convergence?.mrUrl
  ? `MR: ${convergence.mrUrl}`
  : (convergence?.pushError ? `MR NOT opened — ${convergence.pushError} (branch integration/${ITERATION_SLUG} is local; finish the push/MR by hand)` : 'MR status unknown — check the converge output')
log(`Build complete. ${shipped.length} shipped, ${leftOut.length} left out. ${mrLine}`)
// Cost visibility: rough output-token spend for this build run (shared turn pool).
try { log(`Spend: ~${Math.round(budget.spent() / 1000)}k output tokens so far this turn (${manifest.features.length} feature(s) built + reviewed).`) } catch {}

return {
  iteration: manifest.iterationName,
  iterationSlug: ITERATION_SLUG,
  buildBranch,
  worktreeDir: WORKTREE_DIR,
  contractCommit: barrier.commitSha,
  integrationBranch: convergence?.integrationBranch ?? `integration/${ITERATION_SLUG}`,
  mrOpened: convergence?.mrOpened === true,
  mrUrl: convergence?.mrUrl ?? null, // returned to the user; never written to a file
  pushError: convergence?.pushError ?? null,
  shipped,
  leftOut,
  suiteGreen: convergence?.suiteGreen === true,
  summary: convergence?.summary ?? '',
  // What building taught the human — relay this to them, it's the build's
  // contribution to the teach-the-human loop. Not written to any file.
  learned: convergence?.learned ?? '',
  teardown: teardown ? { removed: teardown.removed ?? [], kept: teardown.kept ?? [] } : null,
  // The MR URL is the deliverable — say it to the user; it is deliberately NOT
  // written into any tracked file.
  nextStep: convergence?.pushError
    ? `Push/MR-open failed: ${convergence.pushError}. The integration branch integration/${ITERATION_SLUG} is assembled locally — finish pushing + opening the MR by hand. Worktrees were preserved.`
    : leftOut.length > 0
      ? `${shipped.length} feature(s) shipped on integration/${ITERATION_SLUG}; ${mrLine}. Review/merge that MR. ${leftOut.length} feature(s) were left out — their worktrees/branches are preserved; resolve them with the human, then re-run or hand-land.`
      : `All ${shipped.length} features shipped on integration/${ITERATION_SLUG}; ${mrLine}. Review and merge the MR (see its body for manual-review hotspots). Transient worktrees were torn down. Next: any iteration that doesn't hard-depend on this one can be planned/built CONCURRENTLY with the next — every artifact is slug-scoped, so independent iterations don't collide; consult the roadmap for which are independent.`,
}
