export const meta = {
  name: 'kmaz-research',
  description:
    'Ground a project in cited, adversarially-verified research before planning or designing it. Fans out parallel investigators across four domains — the problem domain, the technology landscape, the business/market, and (when applicable) the target company — verifies the load-bearing claims by trying to refute them, and writes one cited file per domain under docs/research/ plus a README index with confidence flags. Reusable standalone or called inline by the PRD and architecture skills.',
  whenToUse:
    'Run when you need the problem/tech/business/company context in hand BEFORE interviewing for a PRD or deciding an architecture — or any time you want a cited, fact-checked briefing on a project space. Callable inline from a skill via the workflow() hook, or directly. Pass the brief/problem + which domains to cover via args.',
  phases: [
    { title: 'Frame', detail: 'turn the brief/problem into per-domain research questions; pick which domains to run' },
    { title: 'Investigate', detail: 'parallel investigators per domain gather sourced findings' },
    { title: 'Verify', detail: 'one batched skeptic per domain re-checks the unverified load-bearing claims; drop/downgrade what fails' },
    { title: 'Write', detail: 'one cited file per domain under docs/research/ + a README index with confidence flags' },
  ],
}

// ---------------------------------------------------------------------------
// kmaz-research — the shared, reusable research fan-out for the kmaz pipeline.
//
// WHY a workflow: research is the canonical fan-out + adversarial-verify shape
// workflows exist for. Independent investigators cover different angles in
// parallel; a verify pass tries to REFUTE each load-bearing claim so the output
// is fact-checked, not just voluminous; the orchestration holds the
// intermediate findings so the calling session's context stays clean.
//
// WHY callable from skills: the PRD skill (kmaz-prd) and the architecture skill
// (kmaz-prd-to-architecture) both need grounding but at different depths. This
// workflow takes a `depth` and a `domains` set so each caller scopes it:
//   - PRD-time: shallow-ish, domain + market + company (+ light tech), to make
//     the interviewer's questions informed.
//   - Architecture-time: a deeper TECHNOLOGY/tradeoff pass once requirements
//     are locked (Postgres vs Dynamo for THIS access pattern, etc.).
//
// Output: docs/research/{DOMAIN,TECHNOLOGY,MARKET,COMPANY}.md (only the domains
// run) + docs/research/README.md index. Every claim is sourced; low-confidence
// findings are flagged, never silently asserted. COMPANY.md's brand/voice
// section is written to serve as the downstream build's design contract.
//
// `args`:
//   { brief?: string,          // the brief/problem text (or a path to it)
//     briefPath?: string,      // path to a brief/PRD file to read instead
//     company?: string,        // target company name, if any
//     domains?: string[],      // subset of ['domain','technology','market','company']; default = all applicable
//     depth?: 'scan'|'standard'|'deep',  // investigators/domain (1/2/2) + whether a batched skeptic runs (scan: no); default 'standard'
//     focus?: string,          // optional extra steer, e.g. "tradeoffs for a realtime access pattern"
//     outDir?: string }        // default docs/research
// ---------------------------------------------------------------------------

const OUT_DIR = args?.outDir ?? 'docs/research'
const COMPANY = args?.company ?? null
const FOCUS = args?.focus ?? null
const DEPTH = ['scan', 'standard', 'deep'].includes(args?.depth) ? args.depth : 'standard'
const BRIEF = args?.brief ?? null
const BRIEF_PATH = args?.briefPath ?? null

const ALL_DOMAINS = ['domain', 'technology', 'market', 'company']
let requested = Array.isArray(args?.domains) && args.domains.length ? args.domains.filter((d) => ALL_DOMAINS.includes(d)) : ALL_DOMAINS.slice()
// Drop company research when there's no company to research.
if (!COMPANY) requested = requested.filter((d) => d !== 'company')

// Depth knob: how many independent investigators per domain. Verification is
// NOT a per-claim fan-out — investigators self-corroborate (≥2 sources for
// load-bearing claims), and ONE batched skeptic per domain re-checks them all
// in a single call. (Old design spawned REFUTERS agents PER load-bearing claim
// — dozens of token-heavy web-searching agents per run; that was the blowup.)
const INVESTIGATORS = { scan: 1, standard: 2, deep: 2 }[DEPTH]
// Skip the skeptic pass entirely on a scan; one batched skeptic per domain otherwise.
const SKEPTIC = DEPTH !== 'scan'

const briefSource = BRIEF_PATH
  ? `Read the brief/problem from the file \`${BRIEF_PATH}\`.`
  : BRIEF
    ? `The brief/problem is:\n"""\n${BRIEF}\n"""`
    : `There is no written brief yet — infer the research questions from the focus and company below, and flag that the framing is thin.`

// === Schemas ===============================================================

const FRAME_SCHEMA = {
  type: 'object',
  required: ['domains'],
  properties: {
    projectGist: { type: 'string', description: 'one-paragraph plain-language read of what this project/problem is' },
    domains: {
      type: 'array',
      items: {
        type: 'object',
        required: ['domain', 'questions'],
        properties: {
          domain: { type: 'string', enum: ALL_DOMAINS },
          rationale: { type: 'string', description: 'why this domain matters for THIS project' },
          questions: { type: 'array', items: { type: 'string' }, description: '3-8 specific research questions to answer for this domain' },
        },
      },
    },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['domain', 'findings'],
  properties: {
    domain: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'detail', 'sources', 'loadBearing', 'confidence'],
        properties: {
          claim: { type: 'string', description: 'a single factual claim, stated atomically' },
          detail: { type: 'string', description: 'the supporting detail / nuance' },
          sources: { type: 'array', items: { type: 'string' }, description: 'URLs or named sources; empty array = unsourced (must be flagged low confidence)' },
          loadBearing: { type: 'boolean', description: 'true if a PRD/architecture decision would rest on this claim' },
          selfVerified: { type: 'boolean', description: 'true ONLY for a load-bearing claim you corroborated against ≥2 INDEPENDENT sources before reporting it. If you could only find one source (or none) for a load-bearing claim, either keep searching or report it at low confidence with selfVerified:false — never present a single-sourced claim as settled.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    // Company-only: the brand/voice design contract the build phase consumes.
    brandVoice: {
      type: 'string',
      description: 'COMPANY domain only: a concrete brand/voice section (color, type, density, motion, copy tone) usable as a design contract. Empty for other domains.',
    },
  },
}

// ONE skeptic per domain triages ALL the domain's load-bearing claims in a
// single call (verdict per claim id) — not one agent per claim.
const BATCH_VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'holds'],
        properties: {
          id: { type: 'string', description: 'the claim id you were given' },
          holds: { type: 'boolean', description: 'false if you could refute or failed to corroborate it; default false if uncertain' },
          revisedConfidence: { type: 'string', enum: ['high', 'medium', 'low', 'refuted'] },
          correctedClaim: { type: 'string', description: 'if partly wrong, the corrected version; else empty' },
        },
      },
    },
  },
}

// === Phase 1: Frame ========================================================

phase('Frame')

const frame = await agent(
  `You are scoping a research effort for a software project. ${briefSource}
${COMPANY ? `Target company: "${COMPANY}".` : 'No specific target company.'}
${FOCUS ? `Extra focus from the caller: ${FOCUS}` : ''}

Produce a research frame: a one-paragraph gist of the project, and for EACH of these domains [${requested.join(', ')}], 3-8 specific, answerable research questions tailored to THIS project (not generic). Definitions:
- domain: the problem space — how the problem is solved today, what users actually do, failure modes, terminology, regulatory/safety constraints.
- technology: the technologies/approaches/patterns in play — what they are, alternatives, tradeoffs, footguns${FOCUS ? ` (weight toward: ${FOCUS})` : ''}.
- market: market context, competitors, who pays and why, monetization/pricing patterns, business-model implications.
- company: ${COMPANY ? `"${COMPANY}"'s business model, tech stack (from job posts/eng blogs/talks/GitHub), founders & technical leadership and their public engineering values, and brand/voice (visual + copy).` : '(skipped — no company)'}

Return the structured frame covering only [${requested.join(', ')}].`,
  { label: 'frame', phase: 'Frame', schema: FRAME_SCHEMA, model: 'opus' },
)

const domainsToRun = (frame.domains ?? []).filter((d) => requested.includes(d.domain))
log(`Researching ${domainsToRun.length} domain(s) at depth=${DEPTH} (${INVESTIGATORS} investigator(s)/domain): ${domainsToRun.map((d) => d.domain).join(', ')}`)

// === Phases 2–3: Investigate -> Verify (pipelined per domain) ==============
// Each domain runs INVESTIGATORS independent gatherers (a per-domain barrier so
// their findings can be merged). Investigators self-corroborate load-bearing
// claims inline (≥2 sources); then ONE batched skeptic per domain re-checks only
// the still-unverified load-bearing claims in a single call. NOT one verifier
// per claim — that fan-out (REFUTERS × every load-bearing claim, each doing its
// own web searches) was the token/agent blowup this design removed.
// Pipeline so a domain that finishes gathering verifies while another still gathers.

const domainGuidance = {
  domain: 'Investigate the PROBLEM DOMAIN. Use web search/fetch. How is this problem solved today? What do real users do and where does it break? Domain terminology, workflows, regulatory/safety constraints. Cite every claim.',
  technology: `Investigate the TECHNOLOGY LANDSCAPE. Use web search/fetch and inspect the repo if relevant. For each technology/approach in play: what it is, its main alternatives and the tradeoff that matters HERE, the footguns, and 1-2 authoritative links.${FOCUS ? ` Weight toward: ${FOCUS}.` : ''} Pitch findings so a sharp novice could defend the choice. Cite every claim.`,
  market: 'Investigate the BUSINESS/MARKET context. Competitors and how they solve this, who pays and why, monetization/pricing patterns, business-model implications, domain signals that suggest valuable scope/stretch features. Cite every claim; flag anything speculative as low confidence.',
  company: `Investigate the TARGET COMPANY "${COMPANY}". Business model + stage; tech stack (job posts, eng blogs, conference talks, GitHub, StackShare); founders & technical leadership and their public engineering opinions/values; and BRAND & VOICE — concrete enough to be a design contract (color, type, density, motion; copy tone). Cite sources; flag low-confidence findings rather than guess (a confidently-wrong claim about their stack is worse than admitting uncertainty). Fill the brandVoice field.`,
}

const perDomain = await pipeline(
  domainsToRun,
  // Stage 1: independent investigators -> merged findings for the domain. Each
  // investigator SELF-CORROBORATES load-bearing claims (≥2 independent sources)
  // and omits what it can't — so most claims need no separate verifier at all.
  (d) =>
    parallel(
      Array.from({ length: INVESTIGATORS }, (_unused, i) => () =>
        agent(
          `${domainGuidance[d.domain]}\n\nProject gist: ${frame.projectGist}\nQuestions to answer:\n${d.questions.map((q, qi) => `${qi + 1}. ${q}`).join('\n')}\n\n(You are investigator ${i + 1} of ${INVESTIGATORS}; approach the questions from your own angle so the set covers more ground.) Return atomic, individually-sourced findings. Mark which are load-bearing (a PRD/architecture decision would rest on them). For EVERY load-bearing claim, corroborate it against ≥2 INDEPENDENT sources before reporting it and set selfVerified:true; if you can only find one source, report it at low confidence with selfVerified:false (or drop it). Do your verification INLINE as you research — do not defer it.`,
          { label: `investigate:${d.domain}:${i + 1}`, phase: 'Investigate', schema: FINDINGS_SCHEMA, model: DEPTH === 'deep' ? 'opus' : 'sonnet' },
        ),
      ),
    ).then((results) => {
      const good = results.filter(Boolean)
      const merged = good.flatMap((r) => r.findings ?? [])
      const brandVoice = good.map((r) => r.brandVoice).filter(Boolean).join('\n\n')
      return { domain: d.domain, findings: merged, brandVoice }
    }),
  // Stage 2: ONE batched skeptic per domain re-checks only the load-bearing
  // claims that were NOT already self-verified by their investigator (the weak
  // ones — single-sourced/uncorroborated). Self-verified claims are trusted.
  // This replaces the old one-agent-per-claim × REFUTERS fan-out (the blowup).
  async (gathered) => {
    const needsCheck = gathered.findings.filter((f) => f.loadBearing && f.selfVerified !== true)
    if (!SKEPTIC || !needsCheck.length) {
      const kept = gathered.findings.length
      log(`${gathered.domain}: ${kept} findings, ${needsCheck.length} unverified load-bearing claim(s) ${SKEPTIC ? '(none to check)' : '(scan: skeptic skipped)'}.`)
      return gathered
    }
    // Give each claim a stable id so the batched skeptic can return a verdict per claim.
    const indexed = needsCheck.map((f, i) => ({ id: String(i), f }))
    const skeptic = await agent(
      `Batch-verify these ${indexed.length} load-bearing research claim(s) in the ${gathered.domain} domain — they were reported WITHOUT independent corroboration, so check them in ONE pass. For each, search independently (don't just re-read the cited source) and decide if it holds. An unsourced or single-source claim must not survive as high confidence; default to NOT holding if you can't corroborate; give a corrected claim if it's partly wrong.\n\n${indexed.map(({ id, f }) => `[id ${id}] "${f.claim}" — ${f.detail} — cited: ${(f.sources ?? []).join(', ') || 'NONE'}`).join('\n')}\n\nReturn { verdicts: [{ id, holds, revisedConfidence, correctedClaim }] } for every id.`,
      { label: `skeptic:${gathered.domain}`, phase: 'Verify', schema: BATCH_VERDICT_SCHEMA, model: DEPTH === 'deep' ? 'opus' : 'sonnet' },
    )
    const verdictById = new Map((skeptic?.verdicts ?? []).map((v) => [String(v.id), v]))
    const finalFindings = gathered.findings
      .map((f) => {
        if (!f.loadBearing || f.selfVerified === true) return f
        const idx = indexed.find((x) => x.f === f)
        const v = idx && verdictById.get(idx.id)
        if (!v) return f // skeptic didn't rule on it — keep at its reported confidence
        if (v.revisedConfidence === 'refuted' || v.holds === false) return null // drop refuted
        return { ...f, claim: v.correctedClaim || f.claim, confidence: v.revisedConfidence ?? f.confidence }
      })
      .filter(Boolean)
    log(`${gathered.domain}: ${gathered.findings.length} findings, ${indexed.length} unverified claim(s) batch-checked, ${finalFindings.length} kept.`)
    return { ...gathered, findings: finalFindings }
  },
)

const verifiedDomains = perDomain.filter(Boolean)

// === Phase 4: Write ========================================================
// One cited file per domain + a README index with confidence flags. Files are
// disjoint so they write in parallel. Keep COMPANY.md's brand/voice intact as
// the build's design contract.

phase('Write')

const FILE_FOR = { domain: 'DOMAIN.md', technology: 'TECHNOLOGY.md', market: 'MARKET.md', company: 'COMPANY.md' }

await parallel(
  verifiedDomains.map((d) => () =>
    agent(
      `Write the research file \`${OUT_DIR}/${FILE_FOR[d.domain]}\` for the ${d.domain} domain. Overwrite any existing file. Write in plain, novice-friendly prose at the right altitude for someone who will defend these findings. Every claim must carry its source(s) inline or in a references list. Group related findings under headings. At the top, a one-line confidence summary. Flag every low-confidence or single-source finding explicitly as such — never present a shaky claim as settled.${d.domain === 'company' ? ' Include a clearly-marked "## Brand & voice (design contract)" section with the concrete brand/voice guidance below — this section is consumed by the build phase as a binding design contract, so make it actionable (color, type, density, motion, copy tone).' : ''}

Findings (already adversarially verified — refuted claims removed):
${JSON.stringify(d.findings, null, 2)}
${d.domain === 'company' && d.brandVoice ? `\nBrand/voice raw material:\n${d.brandVoice}` : ''}

After writing, confirm the path and the count of sourced vs flagged-low-confidence findings.`,
      { label: `write:${d.domain}`, phase: 'Write', model: 'sonnet' },
    ),
  ),
)

await agent(
  `Write the research index \`${OUT_DIR}/README.md\`. Overwrite any existing file. It is the single entry point the PRD and architecture phases read to find all grounding. Structure:

# Research — ${frame.projectGist ? frame.projectGist.split('.')[0] : 'project'}

**Depth:** ${DEPTH} · **Domains:** ${verifiedDomains.map((d) => d.domain).join(', ')}

A table: each research file (link it), a one-line summary of what it covers, and its overall confidence (high/medium/low based on how many of its findings are high-confidence + sourced). Mark any file dominated by low-confidence findings so a reader knows to verify before relying on it.

Then a short "## Caveats" section: anything the research could NOT establish, and what a human should verify before betting a decision on it.

Files written: ${verifiedDomains.map((d) => `${OUT_DIR}/${FILE_FOR[d.domain]}`).join(', ')}
Project gist: ${frame.projectGist}`,
  { label: 'write-index', phase: 'Write', model: 'opus' },
)

log(`Research complete. ${verifiedDomains.length} file(s) under ${OUT_DIR}/ + README index.`)

return {
  outDir: OUT_DIR,
  depth: DEPTH,
  domains: verifiedDomains.map((d) => d.domain),
  files: verifiedDomains.map((d) => `${OUT_DIR}/${FILE_FOR[d.domain]}`),
  index: `${OUT_DIR}/README.md`,
  findingCounts: Object.fromEntries(verifiedDomains.map((d) => [d.domain, d.findings.length])),
  brandContract: verifiedDomains.some((d) => d.domain === 'company') ? `${OUT_DIR}/COMPANY.md` : null,
}
