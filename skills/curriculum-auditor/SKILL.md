---
name: curriculum-auditor
description: >-
  Audit the PEDAGOGY of an educational product or curriculum — lessons, knowledge components, learning
  objectives, mastery thresholds, misconceptions, practice, assessments, sequencing, manipulatives,
  tutor scripts — against learning-science best practice for durable learning outcomes, then propose and
  apply fixes. It first infers the learner profile and objectives from the artifacts and asks the user
  ONLY the load-bearing unknowns it can't determine, then fans out read-only Sonnet sub-agents over the
  curriculum by pedagogical dimension (objectives & assessment alignment, mastery design, cognitive load
  & scaffolding, durability — spacing/retrieval/interleaving, effect-size leverage, sequencing &
  prerequisite structure), consolidates findings ranked by learning-outcome impact, gates the
  pedagogical-judgment calls back to the user, then applies content/config/sequencing fixes batched by
  ownership. This is a LEARNING-SCIENCE lens, not a code lens — it asks "will a learner actually, durably
  learn from this?" Use whenever the user wants a pedagogy/curriculum/instructional-design review of an
  educational app, course, lesson set, or tutor — "audit our curriculum / lessons / pedagogy", "is this
  teaching well", "are our mastery thresholds right", "do we follow learning-science best practices",
  "will learners actually learn / retain this", "review our knowledge components / misconceptions /
  scaffolding". Triggers even if the user doesn't name this skill, as long as they want an educational
  product's instructional design evaluated. It audits what is taught and how — not the engine's code
  quality (that's the language auditors) — but when the pedagogy needs a capability the engine lacks, it
  detects the stack and dispatches the matching language agent (Sonnet) to build it, then drives it from
  content/config.
---

# Curriculum Auditor

Audit the **pedagogy** of an educational product and improve it, using an intake → fan-out →
consolidate → gate → fix → review loop. This is a **process** skill and a **learning-science** one —
it judges whether the curriculum will produce *durable learning in the intended learner*, which is a
different question from whether the code is correct (the language auditors own that). It differs from
the code auditors in two structural ways: it **interviews adaptively first** (pedagogy depends on intent
that isn't always in the artifacts), and its "fixes" are usually **content / config / sequencing**
changes whose "verification" is coherence and human pedagogical review, not a test suite.

> **Run by Benjamin Bloom (with John Sweller, Robert Bjork, and John Hattie).** Every audit and fix
> sub-agent is dispatched as the `benjamin-bloom` agent so the curriculum is judged through four of the
> most influential learning scientists in history: Bloom's mastery/objectives/assessment-alignment
> (lead), Sweller's cognitive load theory, Bjork's desirable difficulties & durable learning, and
> Hattie's Visible-Learning effect sizes. The orchestrator stays neutral — it runs the intake, scopes,
> coordinates, gates the judgment calls, integrates, and re-checks coherence.

## The core loop

1. **Intake (adaptive)** — infer learner & objectives from the artifacts; ask the user ONLY the
   load-bearing unknowns. (Blocking, but minimal.)
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per pedagogical dimension.
3. **Consolidate** into findings ranked by **learning-outcome impact**.
4. **Human gate** on the pedagogical-judgment calls (desirable-difficulty vs. overload, mastery bar,
   objective scope) — heavier here than in the code auditors, because these are genuine judgments.
5. **Fix fan-out** — sub-agents batched by ownership, applying content/config/sequencing changes.
6. **Integrate** the cross-cutting changes on the orchestrator.
7. **Review** — re-check curriculum coherence (objective↔assessment alignment, prerequisite graph) and
   surface the pedagogical changes for the educator to confirm. No automated "pass" here.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean.

## 1. Intake (adaptive — infer, then ask only what's load-bearing)

Pedagogy can't be judged without knowing **who** is learning, **what** they're meant to learn, and what
**success** means — and these are often *not* fully in the code. First **infer** them from the artifacts;
then **ask the user only the unknowns that would change the audit's conclusions.**

Read the curriculum's own documentation and structure first:

```bash
# the pedagogical artifacts (paths vary — these are the kinds of thing to find):
find . \( -path '*lesson*' -o -path '*curriculum*' -o -path '*content*' \) -name '*.json' -o -name '*.md' \
  | grep -ivE 'node_modules' | head -40
# common per-lesson artifacts: content.json, mastery_config.json, kc_vocabulary.json, misconceptions.json
# research/design docs that state the pedagogy and the learner:
ls docs/ 2>/dev/null; find . -iname '*research*' -o -iname '*pedagog*' -o -iname '*ARCHITECTURE*' | grep -v node_modules | head
cat README.md 2>/dev/null | head -40       # often states the learner age + the concept taught
```

Establish (infer from artifacts where stated; **ask only what you genuinely can't determine**):
- **Learner profile** — age/grade, prior knowledge, novice vs. developing. (Drives the whole
  novice-vs-expert / desirable-difficulty calculus — load-bearing.)
- **Learning objective(s)** — the specific skill/concept and its level on Bloom's taxonomy.
- **Mastery vs. exposure intent** — is this meant to take a learner to mastery, or introduce/explore?
- **What "learned" means** — in-session correctness? durable retention? transfer to new problems?
- **Constraints** — session length, modality (voice/visual/interactive), platform, single-session vs.
  spaced-over-time (this determines whether spacing/interleaving even apply).

If the repo's docs already answer these (e.g. a README stating "fraction equivalence for ~9-year-olds",
research docs on teaching the concept, a `mastery_config`), **don't ask — proceed.** Ask a concise,
batched set of questions ONLY for the load-bearing gaps. State the inferred profile + objectives back to
the user before fanning out, so a wrong inference gets corrected cheaply. **Auditing against the wrong
learner or objective is the worst failure mode here — when truly unsure, ask.**

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch sub-agents **in a single message**, all as the `benjamin-bloom` agent (`subagent_type:
benjamin-bloom`, `model: sonnet`), read-only, one per pedagogical dimension. Give each the relevant
artifacts and the locked learner/objective context:

- **Objectives & assessment alignment (Bloom)** — are objectives explicit and well-formed? does each
  state a skill at a defined taxonomy level? does the assessment measure *that* skill at *that* level, or
  an easier proxy? is exposure mislabeled as mastery? (constructive alignment)
- **Mastery design (Bloom)** — mastery thresholds set on evidence vs. arbitrary; passable by guessing/
  gaming; enough of the right items; correctives/re-tries present; advancement gated on demonstrated
  mastery (not time/single-attempt); re-check after a delay.
- **Cognitive load & scaffolding (Sweller)** — intrinsic load sequenced simple→complex; extraneous load
  cut (split attention across transcript+manipulative+voice, redundant text/narration, seductive detail);
  worked-examples→faded-practice for novices; scaffolding that adapts (expertise-reversal); element
  interactivity not dumped all at once.
- **Durability — spacing, retrieval, interleaving, transfer (Bjork)** — effortful retrieval vs. re-read/
  recognize; spaced vs. massed; interleaved vs. blocked; varied surface features for transfer; feedback
  targeting the *reason* for errors; known misconceptions anticipated and *directly confronted*;
  in-session performance not mistaken for durable learning.
- **Effect-size leverage (Hattie)** — high-effect-size practices (formative feedback, clear success
  criteria, retrieval, metacognition) present and strong; low/null-effect practices dressed as
  innovation; engagement mechanics decoupled from the objective (theater); is there a loop that
  *measures* whether learners actually learned/retained?
- **Sequencing & prerequisite structure** — the KC/skill graph: are prerequisites taught before what
  depends on them? gaps or inversions? a coherent progression, or a pile of lessons?

**Prompt each agent to:** read the relevant artifacts fully against the locked learner/objective; report
each finding with **severity (HIGH/MEDIUM/LOW)** by learning-outcome impact, the principle (and which
mind), the location/artifact, and a **concrete pedagogical fix**; explicitly separate a *confirmed*
problem from a *pedagogical judgment call* (which it should flag for the human gate, not assert); lead
with high-impact; **call out what's done well** (sound pedagogy already present). Return a structured
report grouped by severity. Do NOT modify files. Frame everything in terms of *this* learner and
objective, never the abstract.

## 3. Consolidate (orchestrator)

Merge into one list ranked by **impact on durable learning** — a misaligned assessment or a guessable
mastery bar outranks a minor scaffolding tweak. **Two-agent overlaps are high-signal** (e.g. "no
retrieval practice" from Bjork and "low-leverage" from Hattie are the same root). Separate the
**confirmed findings** from the **judgment calls** the panel flagged — the latter go to the gate.

## 4. Human gate (heavier here — these are real judgments)

This auditor gates more than the code auditors, because pedagogy hinges on intent and tradeoffs only the
educator can settle. **Surface to the user** every flagged judgment call with the panel's reasoning and
options — especially:
- **Desirable difficulty vs. overload** — is this struggle building durable learning, or just
  overwhelming *this* learner? (The hardest call; depends on the learner's level.)
- **Mastery bar** — where should the threshold sit for this stakes/learner?
- **Objective scope / taxonomy level** — is "understand" really the goal, or is fluent application?
- **Engagement mechanics** — keep (serves the objective) or cut (theater)?

Present these as choices (the `AskUserQuestion`-style fork), with the learning-science argument for each
option. Fix the unambiguous findings without gating. One good round of judgment calls beats either
guessing or interrupting constantly.

## 5. Fix fan-out (parallel, batched by OWNERSHIP)

> **Batch fixes so that no two parallel agents ever edit the same file/lesson.**

- **Run the fix agents as `benjamin-bloom`** (`subagent_type: benjamin-bloom`) so changes are shaped by
  the learning science: rewrite an objective to name the skill + taxonomy level, re-set a mastery
  threshold on evidence, add worked examples + a fading sequence, convert re-read recall into retrieval
  practice, space/interleave a practice set, add a misconception confrontation with specific feedback,
  cut extraneous load, replace a low-leverage mechanic with a high-leverage one, fix a prerequisite
  inversion in the sequence.
- **Most fixes are content / config / sequencing, not code** — editing `content.json`, `mastery_config.json`,
  `misconceptions.json`, lesson copy, item banks, the KC graph, tutor scripts. The `benjamin-bloom` fix
  agents own these directly.
- **When a pedagogical fix needs an ENGINE capability the engine lacks, close the loop — don't just
  flag it.** If raising the learning outcome genuinely requires a code change (e.g. the engine can't
  *space* practice across sessions, can't *interleave* item types, can't gate advancement on mastery,
  has no hook to surface a misconception, can't record a retrieval attempt), the curriculum auditor
  **specifies the capability in pedagogical terms and dispatches the matching language agent to
  implement it** — the curriculum auditor owns the *what & why*, the language agent owns the idiomatic
  *how*. To do this:
  1. **Detect the engine's language/stack** from the repo (the same scope signals the language auditors
     use — `package.json`/`tsconfig` → TypeScript, `Gemfile` → Rails, `pyproject.toml` → Python,
     `go.mod` → Go, `Cargo.toml` → Rust, `Package.swift`/`*.xcodeproj` → Swift).
  2. **Pick the matching language agent** and dispatch it on **Sonnet** (`model: sonnet`) with a precise
     spec: the pedagogical capability needed, the desired behavior, the relevant files/engine seam, and
     the constraint that it must follow that language's idiom and not change unrelated behavior. The
     mapping: TypeScript → `matt-pocock` (+ `dan-abramov` if the change is in React UI, `ryan-dahl` if
     in a Node service); Ruby/Rails → `sandi-metz`; Python → `raymond-hettinger`; Go → `rob-pike`;
     Rust → `niko-matsakis`; Swift/iOS → `paul-hudson`. (If the engine's language has no agent yet,
     fall back to a `general-purpose` Sonnet agent with the same spec, and note it.)
  3. **Keep the boundary clean:** the language agent implements the *capability*; the `benjamin-bloom`
     agents then use it from the content/config side (e.g. once the engine can space practice, the
     pedagogy fix sets the spacing schedule in config). Treat the engine change as its own
     file-ownership batch so it doesn't collide with content edits.
  Only do this for a capability that genuinely raises the learning outcome and that config/content
  can't achieve — not to refactor the engine for its own sake (that's the language auditor's job, run
  separately). A large or risky engine change is still worth gating to the user first (step 4).
- **Sonnet is the default; Opus is the rare exception** — `model: sonnet` for every fix agent
  (`benjamin-bloom` and any dispatched language agent) unless a batch genuinely exceeds it
  (re-architecting a whole lesson's mastery model, redesigning a KC graph, a deep engine change where
  one wrong move cascades). Name *why*; if unsure, it's a Sonnet job.
- **Sub-agents do NOT commit**, and they do NOT apply gated judgment-call fixes without the user's
  decision. They edit and report. Tell each what others touch at shared boundaries (a shared KC
  vocabulary, a mastery-config schema); have them report file-by-file.

## 6. Integrate (orchestrator)

Apply the cross-cutting changes (a shared KC/objective vocabulary, a consistent mastery-config pattern,
a re-sequenced lesson order). Resolve overlap. If artifacts have a schema (e.g. a JSON schema for
`content.json`), validate the edited files against it.

## 7. Review — coherence + educator confirmation (no automated "pass")

There's no test suite that proves a curriculum teaches. Instead, re-check **coherence** and hand the
pedagogy back to the human:
- **Objective ↔ assessment alignment** holds after edits (every objective still has an aligned check).
- **Prerequisite graph** is acyclic and complete — nothing depends on a KC introduced later; no orphan
  KCs.
- **Mastery configs** are internally consistent and match their schema; thresholds reflect the gated
  decisions.
- **If an engine capability was implemented this run, it DOES get the code gate** — run the repo's
  build/typecheck/test for that stack (the same gates the matching language auditor would: `tsc
  --noEmit`/tests for TS, `bundle exec rspec` for Rails, `cargo test` for Rust, etc.) so the engine
  change is verified like any code change. The content/config edits that ride on top of it still get
  only the coherence checks above.
- If the app can be run, **drive a lesson** (via the `run` skill) to sanity-check that the changed
  content renders, the new engine capability behaves, and the flow is coherent for the learner.
- **Surface the pedagogical changes to the educator for confirmation** — a curriculum change is a
  content/teaching decision; the human owns the final call on whether it teaches *their* learner better.
  The real proof is a downstream learning-outcome measurement (pre/post, retention check), which this
  audit can *recommend instrumenting* but cannot itself run.

## 8. Commit

Stage **only the files this session touched** (never `git add -A`). Conventional-commit message (e.g.
`content(lessons):` / `fix(curriculum):`) describing the pedagogical changes and the learning-science
rationale. If an engine capability was added, note it and the language agent that implemented it.
Record gated decisions and any fix deferred to the educator.

---

## Hard-won lessons

- **Learning ≠ performance ≠ engagement.** A learner who looks engaged and answers correctly *in session*
  may have learned little that survives to tomorrow. The whole point of the audit is durable learning and
  transfer — never accept in-session smoothness or a fun mechanic as proof.
- **Audit against the real learner, or you audit nothing.** The novice-vs-expert distinction flips half
  the recommendations (worked examples, scaffolding, desirable difficulty). Infer the learner from the
  artifacts; when it's load-bearing and unclear, *ask* — auditing fraction-equivalence-for-9-year-olds as
  if for undergrads produces confident, wrong findings.
- **Desirable difficulty is not the same as "hard."** Difficulty intrinsic to retrieval/spacing/transfer
  builds durable learning; difficulty from confusing UI, split attention, or a novice with no worked
  example is just extraneous load. Distinguish the *source* before you praise or flag a struggle. This is
  a judgment call — gate it.
- **Audits produce false positives — respect the design intent.** A deliberately exploratory,
  exposure-first lesson isn't a "broken mastery design"; a single-session app can't be faulted for "no
  spacing across sessions" if spacing isn't in scope. When a finding fights a stated, deliberate
  pedagogical choice, decline it and say so.
- **Most fixes are content, not code — but a missing capability gets fixed, not just flagged.** The
  leverage is usually in the objectives, items, misconception list, mastery thresholds, and sequence —
  edit those directly. When the pedagogy genuinely needs a capability the engine lacks, don't stop at a
  note: detect the engine's language, dispatch the matching language agent (Sonnet) with a precise
  pedagogical spec to build it, then drive the new capability from config/content. The curriculum
  auditor owns the *what & why*; the language agent owns the idiomatic *how*. Reserve this for
  capabilities that genuinely raise the learning outcome — don't refactor the engine for its own sake,
  and gate a large/risky engine change to the user first.
- **There is no green build for teaching.** Coherence checks and the educator's confirmation are the
  gate; the true verdict is a learning-outcome measurement downstream. Recommend instrumenting it.
- **Keep the orchestrator's context clean.** Delegate the reading; hold the conclusions and the locked
  learner/objective context.

## Scaling the effort

"Look at this one lesson's pedagogy" → a quick intake + one or two dimension agents, fix inline. "Audit
the whole curriculum" → the full intake, the dimension fan-out across lessons, the ranked report, the
judgment-call gate, batched content fixes — all on Sonnet unless a batch truly needs Opus. The default
(a handful of `Agent` calls per phase) is enough for most reviews.
