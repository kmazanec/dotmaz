---
name: rails-auditor
description: >-
  Audit a Rails codebase for convention/SOLID/best-practice violations, then fix the findings —
  by fanning out read-only Sonnet sub-agents over the app layer-by-layer (models, controllers/routes,
  service objects, jobs, views/helpers, config), consolidating their reports into a severity-ranked
  list, then dispatching fix sub-agents batched by file-ownership so they never collide. The
  orchestrator keeps its own context clean (delegate, don't read), integrates the results, applies
  cross-cutting one-liners itself, and runs the test/lint/security gates ONCE at the very end —
  sub-agents never run specs. Use whenever the user wants to review/audit/clean up/refactor an
  existing Rails app, "find where we don't follow Rails conventions", "audit the models/controllers/
  services", "improve code quality", "are our controllers thin / scopes used / tests over-mocked /
  do we follow SOLID", or otherwise improve an existing Rails codebase's quality without adding a
  feature. Triggers even if the user doesn't name this skill, as long as they want a Rails
  quality/convention audit or the refactor that follows from one. NOT for greenfield product
  planning (that's the kmaz pipeline) or adding a new feature (that's kmaz-feature).
---

# Rails Auditor

Audit an existing Rails app for convention/SOLID/best-practice violations and fix them, using a
fan-out → consolidate → fan-out → integrate → verify-once loop. This is a **process** skill: it is
language-agnostic in shape (the same loop works for any large codebase) but its checklists and
gotchas are Rails-specific.

> **Run by Sandi Metz.** Every audit and fix sub-agent is dispatched as the `sandi-metz` agent
> (the ruby-wizard) so the code is judged and reshaped through her object-design lens. The
> orchestrator stays neutral — it coordinates the fan-out, integrates, and runs the gates — while
> the actual reading and refactoring is done in her voice: small objects, messages over classes,
> depend on abstractions, and *duplication is cheaper than the wrong abstraction*.

## The core loop

1. **Scope** the app (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only sub-agents, one per layer, each a focused checklist.
3. **Consolidate** — rank findings by severity; cross-referenced findings are high-signal.
4. **Gate with the human** if findings imply design changes or you're about to spend real tokens.
5. **Fix fan-out** — sub-agents batched by file-ownership so no two edit the same file; pick model
   by complexity; **sub-agents do NOT run specs**.
6. **Integrate** — apply cross-cutting one-liners yourself, resolve overlaps.
7. **Verify ONCE** at the end: full test suite, lint, security scan. Fix fallout.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean. Do not read
the whole app into the main context — that's what the sub-agents are for. You hold the conclusions,
not the file dumps.

---

## 1. Scope (orchestrator, cheap)

Get a sizing pass before deciding the fan-out shape. One `find` + `wc -l` over `app/**` tells you
where the mass is and which files are the god-objects worth singling out:

```bash
find app -type f | sort
wc -l app/models/*.rb app/controllers/**/*.rb app/services/**/*.rb app/jobs/*.rb
find spec -type f -name "*.rb" | sort   # or test/ for Minitest
```

Read the project's `CLAUDE.md`/`README`/ADRs first — its stated conventions are the rubric. A
finding that contradicts a deliberate, documented decision is a false positive, not a fix.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch one sub-agent per layer **in a single message** so they run concurrently. **Run every
sub-agent as the `sandi-metz` agent** (`subagent_type: sandi-metz`) with a Sonnet model override
(`model: sonnet`) — the audit is judged through her object-design lens (messages over classes,
small objects, depend on abstractions, *duplication is cheaper than the wrong abstraction*, test
the public interface). Each agent is **read-only** (tell it not to modify files) and gets a
**focused, layer-specific checklist**. Typical split for a mid-size app:

- **Models** — naming/purpose, god-objects, associations & `dependent:`, validations that should be
  backed by DB constraints (and vice-versa), **scopes vs inline `where` chains scattered across
  callers**, heavy/side-effecting callbacks, enum/state-machine modeling, fat-model vs fat-service
  balance, secure-token conventions.
- **Controllers + routes** — **thin controllers** (business logic that belongs in models/services),
  RESTful design, strong params & mass-assignment, before_action/auth consistency (which endpoints
  are *intentionally* public?), correct status codes, error handling that doesn't leak exception
  detail, DRY across actions.
- **Service objects / orchestrators** — **SRP** (map the responsibilities of the biggest file;
  recommend extractions), **dependency injection vs hard-coupling** (can you test the seam without
  stubbing constants or `any_instance`?), Open/Closed (is a provider behind a clean interface?),
  error handling (exceptions vs result objects vs nil; retry/timeout placement), procedural-vs-OO &
  primitive obsession (hashes passed around instead of value objects).
- **Supporting services / serializers / presentation** — duplicated serialization, SRP in big
  generators (e.g. a PDF builder mixing geodesy + querying + rendering), storage/URL abstraction
  duplication, helpers doing business logic or DB queries, magic numbers / silent-default config.
- **Jobs + views + config** — job idempotency/retry/`discard_on`, thin jobs delegating to services,
  logic-in-views (queries, model-class calls, complex conditionals in `.erb`), partial reuse,
  config that should fail-fast at boot, environment settings (SSL, storage service, hosts).

**Test quality is a first-class audit dimension, not an afterthought.** Each agent should flag:
over-mocking (especially **stubbing the private methods of the object under test**, and
`expect_any_instance_of`/`class_double` where `instance_double` or a real collaborator gives more
confidence), reflection-based "tests" that assert the framework wired an association, magic-number
fixtures, and coverage gaps (error paths, boundary/DoS limits, missing spec files).

**Prompt each audit agent to:** read the relevant files fully; give every finding a
`file:line` + **severity (HIGH/MEDIUM/LOW)** + the convention/principle violated + a **concrete
fix**; lead with high-value findings and separate them from nitpicks; **and call out what's done
well** so you don't later "fix" something that was a deliberate, correct choice. Return a structured
markdown report grouped by severity. Do NOT modify files.

## 3. Consolidate (orchestrator)

Merge the reports into one severity-ranked list. **Findings independently flagged by two agents are
high-signal — surface them.** Trim the LOW nitpicks unless the user wants exhaustiveness. Present
the ranked list; the long per-agent reports stay in the tool output for drill-down.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask the user only when a finding implies a
**design decision** the audit can't settle from the code (e.g. a finding whose "fix" would change
behavior, or one that contradicts a deliberate choice — see the first hard-won lesson below), or
before you spend a large batch of tokens. One good gate beats ten clarifications.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP)

This is the single most important rule of the fix phase:

> **Batch fixes so that no two parallel agents ever edit the same file.**

Many findings touch the same hot files (the biggest orchestrator, a shared serializer, the storage
classes, `production.rb`, a helper, a template). Group the work by which files it owns, and give
each batch to one agent. Independent batches run concurrently in one message.

- **Run the fix agents as `sandi-metz` too** (`subagent_type: sandi-metz`) so the refactors are
  shaped by her hand — small objects, injected dependencies, conditionals replaced by polymorphism,
  bad abstractions flushed back to duplication before the right seam is extracted, in small safe
  reversible steps.
- **Sonnet is the default; Opus is the rare exception.** Dispatch every fix agent on Sonnet
  (`model: sonnet`) unless a specific batch *genuinely* exceeds it — a deep multi-file structural
  refactor where one wrong move cascades (decomposing a 600-line orchestrator, reworking
  error-handling semantics across many call sites). That bar is high: most "big" refactors are still
  a sequence of mechanical edits Sonnet handles well. Reach for `model: opus` only for the one or two
  batches that clear it, name *why* in the dispatch, and keep everything else on Sonnet. If you're
  unsure, it's a Sonnet job.
- **Sub-agents do NOT run tests/specs/lint/migrations** and **do NOT commit.** They edit and report.
  (Verification is centralized at step 7 so you control it and see all fallout at once.)
- **Freeze public interfaces.** When an agent decomposes a class, tell it the public API + injectable
  deps are frozen so the existing specs still bind. It extracts collaborators *behind* the seam.
- **Tell each agent what the OTHER agents are changing** at shared boundaries (e.g. "a new
  `X.for_owner` scope now exists — use it"; "another agent owns `that_file.rb`, don't touch it"), so
  parallel work composes instead of conflicting.
- Have each agent **report file-by-file** and **flag anything ambiguous** (a cross-cutting one-liner
  it couldn't apply because it didn't own the file) for you to handle at integration.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners the agents flagged (the edits that span an ownership boundary —
e.g. wiring a call site to a method another agent added in a file you own). Resolve any overlap. Syntax-check
all touched Ruby before running the suite:

```bash
for f in $(git status --short | awk '{print $2}' | grep '\.rb$'); do ruby -c "$f" >/dev/null || echo "FAIL $f"; done
```

## 7. Verify ONCE — and expect refactor fallout

Run the gates the project actually uses (read `CLAUDE.md` for the exact commands; run them **bare**,
no inline env-var prefixes if the project forbids them):

```bash
bin/rails db:migrate && bin/rails db:test:prepare   # only if you added a migration
bundle exec rspec       # or: bin/rails test
bin/rubocop             # autocorrect with -a, then re-check
bin/brakeman            # security scan
```

**Refactors predictably break the spec seam, not the behavior.** When the suite goes red, triage by
root-cause, not by count — a hundred failures usually trace to two or three causes. The classics:

- **`class_double(X)` → `instance_double(X)`**: if you removed class-method shortcuts and switched a
  collaborator's injected default from `X` (the class) to `X.new` (an instance), every verifying
  double that stubbed a class method now fails ("does not implement the class method"). Switch the
  doubles to `instance_double`, and for direct-`X.new` call sites stub
  `allow(X).to receive(:new).and_return(instance_double(X, ...))`.
- **`has_many` → `has_one`**: `obj.things.first`/`.count` callers (including in specs) break →
  `obj.thing` / `Thing.where(...).count`.
- **Obsolete tests**: delete the examples that only tested the thing you deleted. Don't preserve
  coverage of dead code.

Distinguish spec-seam fallout (fix the spec) from a **real regression** a refactor introduced (fix
the code) — don't paper over the latter.

## 8. Commit

Stage **only the files this session touched** (list them explicitly; never `git add -A`/`git add .`
— other agents or the user may have unrelated dirty state). Conventional-commit message; in the body
record the declined findings and any latent bug the refactor surfaced.

---

## Hard-won lessons (the ones that cost time)

- **Audits produce false positives. Verify every finding against the actual code before acting.**
  An auditor that pattern-matches the *schema* (or any one layer) without reading the *code* will
  "find" missing foreign keys, missing validations, or table/column inconsistencies that are in fact
  deliberate — a column may diverge from its siblings precisely because the code uses it differently.
  Implementing such a finding can break a path that worked. When a finding contradicts how the code
  actually behaves, **decline it and surface the conflict to the user** — it's a signal, not a task.

- **Deleting "dead" code can expose a latent bug.** Removing a redundant indirection (a forwarding
  shim, an unused default, a compatibility alias) can reveal that something only worked *because* of
  it. The honest fix completes the refactor and corrects the underlying bug, rather than restoring
  the dead code to re-hide it. Treat "removing this broke things" as information about a pre-existing
  defect, not a reason to revert.

- **The empty-collection identity bug.** A fold over an empty collection should return the operation's
  identity element — `1.0` for a product, `0` for a sum, `true` for an all-`and` — not a hardcoded
  zero/false. Watch for guards like `xs.empty? ? 0 : xs.reduce(:*)` that pick the wrong base case.

- **Fail-fast-at-boot beats fail-at-request.** Required external config (secrets, a storage service,
  a schema file) belongs in an `after_initialize` check that raises in production / warns in dev —
  so a bad deploy dies on boot with a clear message instead of leaving health-checks green while
  every affected request 500s.

- **Wired-but-unsubscribed is dead code.** A Turbo broadcast to a stream nobody subscribes to (or a
  partial nobody renders) fires into the void. Grep both ends.

- **Keep the orchestrator's context clean.** The reason the fan-out works is that you never load the
  app into your own window. Delegate the reading; hold the conclusions. If you find yourself opening
  file after file in the main loop, you've stopped orchestrating.

## Scaling the effort

Scale the fan-out to the request. "Take a quick look at the models" → one or two audit agents, fix
inline. "Audit the whole app and fix everything" → the full layer split, batched fix fan-out, all on
Sonnet unless a batch truly needs Opus. When the user explicitly opts into heavy multi-agent orchestration, the
read-only audit fan-out and the file-ownership-batched fix fan-out are exactly the shape a workflow
encodes — but the default (a handful of `Agent` calls per phase) is enough for most audits.
