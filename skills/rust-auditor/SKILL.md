---
name: rust-auditor
description: >-
  Audit a Rust codebase for ownership, safety, idiom, and design problems, then fix the findings — by
  fanning out read-only Sonnet sub-agents over the project crate-by-crate (and concern-by-concern:
  panics & error handling, ownership & allocation, unsafe & soundness, lifetimes & traits, concurrency
  & async, idiom & API design), consolidating their reports into a severity-ranked list, then
  dispatching fix sub-agents batched by file/module-ownership so they never collide. The orchestrator
  keeps its own context clean (delegate, don't read), integrates the results, and runs the
  build/clippy/test gates ONCE at the very end — sub-agents never run the suite. Use whenever the user
  wants to review/audit/clean up/refactor an existing Rust project, "find where this isn't idiomatic
  Rust", "kill the unwraps / unnecessary clones", "is our unsafe sound", "fix our error handling /
  Send-Sync / async", "make illegal states unrepresentable", "improve code quality", or otherwise
  improve a Rust codebase's quality without adding a feature. Triggers even if the user doesn't name
  this skill, as long as they want a Rust idiom/safety/quality audit or the refactor that follows. NOT
  for greenfield product planning or adding a new feature.
---

# Rust Auditor

Audit an existing Rust project for ownership/safety/idiom/design violations and fix them, using a
fan-out → consolidate → fix → verify-once loop. This is a **process** skill; the loop is the same one
the other auditors use, but its checklists are Rust-specific.

> **Run by Niko Matsakis (with Jon Gjengset and Steve Klabnik).** Every audit and fix sub-agent is
> dispatched as the `niko-matsakis` agent so the code is judged through three Rust minds: Matsakis's
> language authority (ownership, lifetimes, traits, async/Send/Sync — *why* the rules exist), Gjengset's
> deep mechanics & performance (zero-cost abstractions, sound `unsafe`, allocation), and Klabnik's
> idiomatic craft & API design (error handling, the API guidelines, ergonomics). The orchestrator stays
> neutral — it scopes, coordinates, integrates, and runs the gates.

## The core loop

1. **Scope** the project (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per crate/concern.
3. **Consolidate** into a severity-ranked list.
4. **Human gate** only when a finding implies a real design decision.
5. **Fix fan-out** — sub-agents batched by file/module-ownership so no two edit the same file.
6. **Integrate** the cross-cutting edits on the orchestrator.
7. **Verify ONCE** (build / clippy / test); sub-agents never run the suite.
8. **Commit** only what you changed (never `git add -A`).

## 1. Scope (orchestrator, cheap)

```bash
cargo metadata --no-deps --format-version 1 | head      # the workspace/crate layout — your fan-out unit
find . -name '*.rs' -not -path '*/target/*' | xargs wc -l | sort -n | tail -30
cat Cargo.toml                                           # edition, MSRV, dependencies, features
cargo clippy --all-targets 2>&1 | tail -30               # a cheap pre-read of idiom issues
grep -rn "unsafe" --include='*.rs' . | grep -v '/target/' | head   # where's the unsafe?
```

Note the **edition and MSRV** — they're the rubric (don't suggest `let else` below 1.65, `async fn` in
traits below the version that has it, etc.). Read any `README`/`CONTRIBUTING`. A finding that contradicts
a deliberate, documented choice (a justified `unsafe` with a safety comment, a `clone` in a cold path
for clarity) is a false positive, not a fix.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch sub-agents **in a single message**, all as the `niko-matsakis` agent (`subagent_type:
niko-matsakis`, `model: sonnet`), read-only, one per concern:

- **Panics & error handling** — `unwrap()`/`expect()`/`panic!`/`unreachable!`/panicking indexing in
  library or request paths; `Result` ignored (`let _ =`) or swallowed; stringly-typed errors where an
  enum belongs; missing `?`; `Mutex::lock().unwrap()` ignoring poisoning; `thiserror`/`anyhow` used (or
  not) appropriately.
- **Ownership & allocation** — `.clone()` to dodge the borrow checker; taking `Vec`/`String` where
  `&[T]`/`&str` reads; `Rc<RefCell>`/`Arc<Mutex>` as a crutch for an ownership design that should be
  restructured; needless allocations in hot paths; `collect()` then re-iterate; `Cow` opportunities.
- **`unsafe` & soundness** — any `unsafe` without a documented safety invariant; potential UB (aliasing,
  uninit, bad transmute); unsound `Send`/`Sync` impls; FFI without validation; `unsafe` that a safe
  abstraction or vetted crate would replace.
- **Lifetimes & traits** — lifetimes leaking into APIs that should own; over-broad or missing trait
  bounds; giant traits; `dyn` where generics fit (or vice-versa); newtype opportunities; coherence/orphan
  hacks.
- **Concurrency & async** — `Send`/`Sync` mistakes; blocking calls on an async executor; futures not
  awaited; cancellation unhandled; `.await` holding a lock across a yield point; shared mutable state
  without synchronization; channel/`Arc<Mutex>` misuse.
- **Idiom & design** — manual loops clearer as iterator chains; nested `match`/unwrapping that `let
  else`/combinators simplify; non-idiomatic naming/conversions (`as_`/`to_`/`into_`, `From`/`TryFrom`);
  over-broad `pub` (vs `pub(crate)`); god-modules; duplication that should be one item (or an over-eager
  abstraction to re-inline); dead code; missing derives; loose primitives/bools that want an enum.
- **Tests** — behavior at the public API not internals; `#[cfg(test)]` units fast and isolated; property
  tests for tricky invariants; coverage gaps on error/edge paths.

**Prompt each agent to:** read the relevant files fully; report each finding with `file:line` +
**severity (HIGH/MEDIUM/LOW)** + the principle (and which mind) + a **concrete fix**; lead with
high-value (panics in real paths, unsound `unsafe`, `Send`/`Sync` bugs), separate from nitpicks; **call
out what's done well**. Return a structured report grouped by severity. Do NOT modify files. (Pure
formatting is a `rustfmt` job, and most style nits a `clippy` job — note "run rustfmt/clippy" once, not
per line.)

## 3. Consolidate (orchestrator)

Merge into one severity-ranked list; **two-agent overlaps are high-signal**. Lead with safety/soundness
(panics in real paths, unjustified `unsafe`, `Send`/`Sync`); idiom and design come after. The per-agent
reports stay in the tool output.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask only when a finding implies a **design
decision** the audit can't settle (a fix that changes a public API/trait, an `unsafe` that may be load-
bearing for performance, a major ownership restructure), or before a large token spend.

## 5. Fix fan-out (parallel, batched by MODULE/FILE-OWNERSHIP)

> **Batch fixes so that no two parallel agents ever edit the same file.**

- **Run the fix agents as `niko-matsakis`** (`subagent_type: niko-matsakis`) so refactors are shaped by
  the three minds — `unwrap`→`?`/proper errors, restructured ownership over `clone`/`Arc<Mutex>`,
  justified-or-removed `unsafe`, iterator chains and combinators, `thiserror`/`anyhow` errors, API-
  guideline naming — in small, safe, reversible steps.
- **Sonnet is the default; Opus is the rare exception** — `model: sonnet` unless a batch genuinely
  exceeds it (a borrow-checker-heavy ownership restructure across modules, an async/Send-Sync rework,
  auditing nontrivial `unsafe` for soundness). Name *why*; if unsure, it's a Sonnet job.
- **Sub-agents do NOT run cargo build/clippy/test** and **do NOT commit.** They edit and report.
- **Freeze public APIs/traits** unless the finding is about one; tell each agent what others touch at
  shared boundaries (a new error enum, a moved trait); have it report file-by-file and flag cross-cutting
  one-liners.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners; resolve overlap; compile before the gates:

```bash
cargo build --all-targets
```

## 7. Verify ONCE — and expect refactor fallout

```bash
cargo build --all-targets
cargo clippy --all-targets -- -D warnings   # clippy is the idiom gate
cargo test
cargo audit                                  # dependency CVEs, if installed
```

**Refactors break the compile/test seam, not behavior.** Triage by root-cause:
- **Modeled a state into an `enum`** → `match`es now require every arm (the compiler found the gaps);
  callers reading the old bool/string break — update them, drop any catch-all `_` that re-hides cases.
- **`unwrap` → `?`** → the function signature gains a `Result`; every caller must now handle/propagate it
  (and may itself become `-> Result`). That cascade is the type system doing its job.
- **Restructured ownership / removed `clone`** → borrow-checker errors appear where lifetimes now actually
  matter; fix the ownership, don't re-add the `clone` reflexively.
- **Removed/justified `unsafe`** → if the safe version fails a test, the `unsafe` was load-bearing for a
  real reason — restore it *with* a documented invariant, don't leave it unsound.
- **Added `Send`/`Sync` correctness or async changes** → the compiler surfaces real concurrency bugs that
  were always there; fix the isolation.

Distinguish mechanical seam fallout from a **real bug the refactor surfaced** (a panic path a removed
`unwrap` exposed, a race the type system just caught) — fix the latter properly.

## 8. Commit

Stage **only the files this session touched** (never `git add -A`). Conventional-commit message; record
declined findings and any latent bug the refactor surfaced.

---

## Hard-won lessons

- **Fighting the borrow checker is a design smell, not a checker bug.** The fix for a borrow error is
  usually to restructure ownership (split borrows, narrow scopes, move data), not to reach for `clone()`,
  `Rc<RefCell>`, or `unsafe`. Reach for shared ownership only where the model is genuinely shared.
- **`unwrap()` in a real path is a documented crash.** Replacing it with `?` doesn't just satisfy style —
  it turns a panic into a handled error. If there's no sensible error to return, that's the design telling
  you the fallibility was never modeled.
- **`unsafe` needs an invariant, not a vibe.** Every `unsafe` block must document *why* it's sound and why
  safe Rust can't express it; most `unsafe` in application code shouldn't exist. Auditing for UB is
  finding the place the invariant is actually violated.
- **Audits produce false positives — verify against the code.** A `clone` in a cold path for clarity, an
  `unwrap` on a provable invariant (with a comment), a `dyn` chosen deliberately — decline these and say
  why.
- **The compiler is the ally.** Most of this audit's value is making the type system prove more — model
  states as enums, propagate errors as `Result`, encode invariants in types — so whole classes of bug
  stop compiling.
- **Keep the orchestrator's context clean.** Delegate the reading; hold the conclusions.

## Scaling the effort

"Clean up this module" → one or two concern agents, fix inline. "Audit the whole crate and fix
everything" → the full concern fan-out, batched fix fan-out, all on Sonnet unless a batch truly needs
Opus. The default (a handful of `Agent` calls per phase) is enough for most audits.
