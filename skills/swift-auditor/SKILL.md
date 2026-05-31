---
name: swift-auditor
description: >-
  Audit a Swift / iOS (or macOS/watchOS/visionOS) codebase for idiom, safety, concurrency, design, and
  UI-framework correctness problems, then fix the findings — by detecting whether it's SwiftUI, UIKit,
  or mixed during scope, then fanning out read-only Sonnet sub-agents over the project by concern,
  consolidating their reports into a severity-ranked list, then dispatching fix sub-agents batched by
  file-ownership so they never collide. The orchestrator keeps its own context clean (delegate, don't
  read), integrates the results, and runs the build/test gates ONCE at the very end — sub-agents never
  run the suite. Use whenever the user wants to review/audit/clean up/refactor an existing Swift/iOS
  app, "find where this isn't idiomatic Swift", "kill the force-unwraps / retain cycles", "fix our data
  races / modernize to async-await and actors", "make illegal states unrepresentable", "audit our
  SwiftUI state / view identity" or "our UIKit view controllers / memory", "improve code quality", or
  otherwise improve a Swift codebase's quality without adding a feature. Triggers even if the user
  doesn't name this skill, as long as they want a Swift/iOS quality/idiom/safety audit or the refactor
  that follows. NOT for greenfield product planning or adding a new feature.
---

# Swift Auditor

Audit an existing Swift / iOS project for idiom/safety/concurrency/design (and UI-framework)
violations and fix them, using a detect → fan-out → consolidate → fix → verify-once loop. This is a
**process** skill: the loop is the same one the other auditors use, but its checklists are
Swift-specific and it **adapts to the UI framework** it finds.

> **Run by Paul Hudson (with Chris Lattner and John Sundell).** Every audit and fix sub-agent is
> dispatched as the `paul-hudson` agent so the code is judged and reshaped through the three minds that
> define idiomatic Swift: Hudson's craft and code quality (value types, honest optionals, clean
> SwiftUI/UIKit, small cohesive types, duplication-vs-wrong-abstraction), Lattner's language and
> concurrency authority (protocol-oriented design, value semantics, safety, async/await + actors +
> Sendable + data-race safety), and Sundell's architecture and testability (dependency injection,
> decoupled units, testable seams). The orchestrator stays neutral — it detects the UI framework,
> coordinates the fan-out, integrates, and runs the gates. There is **one panel**; it applies the
> SwiftUI or UIKit checklist depending on what the project uses.

## The core loop

1. **Scope & detect the UI framework** (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents (all `paul-hudson`), one per concern.
3. **Consolidate** findings into a severity-ranked list.
4. **Human gate** only when a finding implies a real design decision.
5. **Fix fan-out** — sub-agents batched by file-ownership so no two edit the same file.
6. **Integrate** the cross-cutting edits on the orchestrator.
7. **Verify ONCE** at the end (build / test); sub-agents never run the suite.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean. Don't read the
whole project into the main context — that's what the sub-agents are for.

---

## 1. Scope & detect the UI framework (orchestrator, cheap)

Find the mass, the tooling, and — critically — **which UI framework(s) the app uses**, which decides
the UI checklist:

```bash
# size & shape
find . -name '*.swift' | grep -vE '\.build/|Pods/|DerivedData/|Carthage/' | sort
find . -name '*.swift' -not -path '*/.build/*' -not -path '*/Pods/*' | xargs wc -l | sort -n | tail -30

# project & tooling: SPM vs xcodeproj/workspace, deployment target, test setup, linters
ls *.xcodeproj *.xcworkspace Package.swift 2>/dev/null
cat Package.swift 2>/dev/null            # targets, dependencies, swift-tools-version (the language floor)
ls .swiftlint.yml .swiftformat 2>/dev/null

# DETECT THE UI FRAMEWORK
grep -rlE '^import SwiftUI'      --include='*.swift' . | head      # SwiftUI views present?
grep -rlE '^import UIKit|^import AppKit' --include='*.swift' . | head   # UIKit/AppKit present?
grep -rlE 'async |await |actor |Sendable|@MainActor' --include='*.swift' . | head   # concurrency in use?
```

Decide the UI surface from the evidence:
- **SwiftUI** if `import SwiftUI` dominates the view layer.
- **UIKit/AppKit** if `UIViewController`/`UIView`/`import UIKit` (or AppKit) dominate.
- **Mixed** is common (SwiftUI hosting UIKit via `UIViewRepresentable`, or a UIKit app adopting SwiftUI
  screens) — apply *both* UI checklists, scoped to the relevant files, and watch the bridge points.

Note the **swift-tools-version / deployment target** — it's the rubric (don't recommend the
`@Observable` macro, `async let`, or typed `throws` below the version that has them; don't assume
strict-concurrency checking on an old toolchain). Read any `README`/`CONTRIBUTING`/`AGENTS.md`. A
finding that contradicts a deliberate, documented choice is a false positive, not a fix. **State which
UI framework you detected and which checklists you'll run** before fanning out.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch the sub-agents **in a single message** so they run concurrently. **Run every sub-agent as the
`paul-hudson` agent** (`subagent_type: paul-hudson`, `model: sonnet`). Each agent is **read-only**
(tell it not to modify files) with a focused checklist. Split by concern:

- **Safety & optionals** — force-unwraps (`!`), `try!`/`as!`, implicitly-unwrapped optionals outside
  lifecycle necessity; sentinel values where an optional/enum belongs; `fatalError`/`precondition` as
  routine flow.
- **Memory & references** — **retain cycles**: closures capturing `self` strongly (missing `[weak
  self]`/`[unowned self]`), delegate properties not `weak`, parent↔child strong cycles; `class` where
  a `struct` fits; unmanaged shared mutable state.
- **Concurrency** (always — this is where most modern Swift review value lives) — completion-handler
  pyramids that should be `async`/`await`; data races / shared mutable state not isolated by an
  `actor`; missing `Sendable` across boundaries; UI work off the main actor (or missing `@MainActor`);
  unstructured `Task`s ignoring cancellation; blocking the main thread; `DispatchQueue` gymnastics
  where structured concurrency is cleaner.
- **Modeling & idiom** — loose booleans/strings that want an `enum` with associated values;
  non-exhaustive switches with a swallowing `default`; manual loops clearer as `map`/`compactMap`/
  `reduce`; `var` that should be `let`; missing/over-broad access control; reference-vs-value misuse.
- **Architecture & testability** — massive view controllers / massive views; `.shared` singletons as
  hidden dependencies; networking/parsing in the view layer; no protocol seam where a test needs a
  fake; logic entangled with UI so it can't be unit-tested; force-unwrapped or globally-reached deps.
- **SwiftUI (when detected)** — state-tool misuse (`@State` for data that should be `@Binding`/
  observed/injected; `@StateObject` vs `@ObservedObject`; `@Observable` vs old `ObservableObject`);
  non-pure `body` (side effects/work/non-deterministic values in `body`); view-identity bugs (`ForEach`
  with unstable/index ids; missing/incorrect `.id()`); over-stuffed views to decompose; heavy work in
  `body` instead of `.task`/a model.
- **UIKit (when detected)** — retain cycles in closures/delegates; lifecycle misuse; cell-reuse bugs
  (state not reset in `prepareForReuse`); UI mutated off the main thread; massive view controllers;
  force-unwrapped IBOutlets used before load.
- **General quality (the design lens)** — god-types; duplication that should be one named thing (or an
  over-eager abstraction to re-inline); dead code; deep nesting `guard` would flatten; deep class
  inheritance where protocols/composition fit; poor names.
- **Tests** — behavior at a protocol/public seam, not internals; fast and isolated (no network); fakes
  injected at protocol seams, not swizzled; async tests that actually await; XCTest/Swift Testing used
  well.

**Prompt each audit agent to:** read the relevant files fully; give every finding a `file:line` +
**severity (HIGH/MEDIUM/LOW)** + the principle violated (cite the Swift/concurrency/architecture lens)
+ a **concrete fix**; lead with high-value findings, separate them from nitpicks; **call out what's
done well**. Return a structured markdown report grouped by severity. Do NOT modify files. (Pure
formatting/style is a SwiftFormat/SwiftLint job — note "run the linter/formatter" once, not per line.)

## 3. Consolidate (orchestrator)

Merge into one severity-ranked list. **Findings independently flagged by two agents are high-signal.**
Trim LOW nitpicks unless the user wants exhaustiveness; the long per-agent reports stay in the tool
output. Lead with the safety/concurrency findings (force-unwraps, retain cycles, data races) — those
crash or corrupt; idiom and structure come after.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask the user only when a finding implies a
**design decision** the audit can't settle from the code (a fix that changes a public API/protocol,
breaks a module's interface, or contradicts a deliberate choice — see the hard-won lessons), or before
you spend a large batch of tokens. One good gate beats ten clarifications.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP)

The single most important rule of the fix phase:

> **Batch fixes so that no two parallel agents ever edit the same file.**

Group by file/type-ownership; give each batch to one agent; independent batches run concurrently.

- **Run the fix agents as `paul-hudson` too** (`subagent_type: paul-hudson`) so refactors are shaped by
  the three minds — force-unwraps become `guard let`, cycles get `[weak self]`, completion handlers
  become `async`/`await`, shared state moves into an `actor`, loose primitives become enums, god-types
  get decoupled behind protocols — in small, safe, reversible steps.
- **Sonnet is the default; Opus is the rare exception.** Dispatch every fix agent on `model: sonnet`
  unless a specific batch *genuinely* exceeds it — a deep structural/concurrency refactor where one
  wrong move cascades (migrating a subsystem to structured concurrency and actor isolation, modeling a
  domain into enums across many call sites, threading dependency injection through a deep tree). That
  bar is high: most "big" refactors are still a sequence of mechanical edits Sonnet handles well. Reach
  for `model: opus` only for the one or two batches that clear it, name *why* in the dispatch, and keep
  everything else on Sonnet. If you're unsure, it's a Sonnet job.
- **Sub-agents do NOT run xcodebuild/swift build/tests** and **do NOT commit.** They edit and report.
  (Verification is centralized at step 7.)
- **Freeze public/protocol surfaces** unless the finding is explicitly about changing one. When an
  agent splits a type or extracts a protocol, tell it the public API is frozen so callers compile.
- **Tell each agent what the OTHER agents are changing** at shared boundaries (e.g. "a new
  `enum LoadState` now lives in `Models.swift` — use it"; "another agent owns `FeedViewController.swift`,
  don't touch it"), so parallel work composes.
- Have each agent **report file-by-file** and **flag anything ambiguous** (a cross-cutting one-liner it
  couldn't apply because it didn't own the file) for you to handle at integration.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners the agents flagged. Resolve overlap, then build before the full
gates. Use the project's real build path (SPM vs Xcode):

```bash
swift build                                   # for an SPM package, or:
xcodebuild -scheme <Scheme> -destination 'platform=iOS Simulator,name=iPhone 15' build  # for an app
```

## 7. Verify ONCE — and expect refactor fallout

Run the gates the project actually uses (read the scheme / Package.swift / CI for the real targets):

```bash
swift build && swift test                     # SPM, or:
xcodebuild -scheme <Scheme> -destination 'platform=iOS Simulator,name=iPhone 15' test
swiftlint                                     # if the project uses it
```

**Refactors predictably break the compile/test seam, not the behavior.** Triage by root-cause, not
count — many failures usually trace to a few causes. The Swift classics:

- **Modeled a state into an `enum`** → `switch`es over it now need every case (good — the compiler
  found the missing ones); call sites that read the old boolean/string break. Update them; drop any
  `default:` that would re-hide a future case.
- **Removed force-unwraps / added `guard let`** → control flow gains early-return paths a caller may
  depend on; verify the non-happy path is handled, not silently skipped.
- **Migrated to async/await or `@MainActor`/`actor`** → the compiler now surfaces real **data races and
  Sendable violations** that were always there — that's the audit working. Fix the isolation; don't
  reach for `@unchecked Sendable` or `nonisolated(unsafe)` to silence it unless you can justify it.
  Callers of a newly-`async` function must now `await` (and be in an async context).
- **Broke a retain cycle with `[weak self]`** → `self` is now optional inside the closure; a `guard let
  self else { return }` may change whether the closure body runs — confirm that's intended.
- **Extracted a protocol / injected a dependency** → construction sites and tests must pass the new
  dependency; watch for a now-missing default.

Distinguish compile/test-seam fallout (mechanical) from a **real regression or newly-surfaced bug** (a
data race the concurrency checker just caught, a nil path a removed `!` exposed) — fix the latter
properly, don't paper over it with an unsafe escape hatch.

## 8. Commit

Stage **only the files this session touched** (list them explicitly; never `git add -A`/`git add .`
— other agents or the user may have unrelated dirty state). Conventional-commit message; in the body
record any declined findings and any latent bug the refactor surfaced (a data race the concurrency
checker caught, a crash a removed force-unwrap exposed).

---

## Hard-won lessons (the ones that cost time)

- **Audits produce false positives. Verify every finding against the actual code before acting.**
  An auditor pattern-matching on shape will "find" a force-unwrap that's a guaranteed-valid IBOutlet, a
  "missing `[weak self]`" in a closure that doesn't outlive `self`, or a "should-be-struct" class that
  genuinely needs identity. Implementing it can break behavior. When a finding contradicts how the code
  actually behaves, **decline it and surface the conflict to the user** — it's a signal, not a task.

- **Deleting "dead" code can expose a latent bug.** Removing a redundant indirection (a swallowed
  `catch`, an unused default, a force-cast) can reveal something only worked *because* of it. The
  honest fix completes the refactor and corrects the underlying defect rather than restoring the dead
  code.

- **The compiler's concurrency checker surfaces real races — don't silence it.** Migrating to
  async/await, `@MainActor`, or actors makes the compiler flag `Sendable` violations and data races
  that were always present. That's the audit *working*. Fix the isolation; reach for `@unchecked
  Sendable`/`nonisolated(unsafe)` only with a stated, localized reason — never to make it build.

- **A force-unwrap is a documented crash.** Replacing `!` with `guard let`/`??` doesn't just satisfy
  style — it converts a runtime crash into a handled path. If removing one reveals there's no sensible
  fallback, that's the design telling you the optionality was never modeled honestly.

- **The two highest-value iOS moves are killing retain cycles and getting UI on the main actor.** A
  leaked closure or a background-thread UI mutation is the kind of bug that ships and then crashes/
  glitches in the field. Audit those as first-class, before idiom and structure.

- **Keep the orchestrator's context clean.** The reason the fan-out works is that you never load the
  project into your own window. Delegate the reading; hold the conclusions.

## Scaling the effort

Scale the fan-out to the request. "Make this view controller idiomatic" → one or two agents, fix
inline. "Audit the whole app and fix everything" → the full concern split (with the detected UI
checklist), batched fix fan-out, all on Sonnet unless a batch truly needs Opus. When the user
explicitly opts into heavy multi-agent orchestration, the read-only audit fan-out and the
ownership-batched fix fan-out are exactly the shape a workflow encodes — but the default (a handful of
`Agent` calls per phase) is enough for most audits.
