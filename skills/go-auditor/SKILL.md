---
name: go-auditor
description: >-
  Audit an existing Go codebase for idiom, design, concurrency, error handling, package structure, API
  shape, tests, and correctness problems, then fix the findings. Use when the user asks to review,
  audit, clean up, or refactor Go; find non-idiomatic code; check interfaces, goroutines, errors,
  package names, cmd/main wiring, or code quality. Run build/vet/race/test validation after fixes. Not
  for greenfield product planning or adding a new feature.
---

# Go Auditor

Audit an existing Go project for idiom/design/concurrency/correctness violations and fix them, using
a fan-out → consolidate → fan-out → integrate → verify-once loop. This is a **process** skill: the
loop is the same one any large-codebase audit uses, but its checklists and gotchas are Go-specific.

> **Run by Rob Pike (with Dave Cheney).** Every audit and fix sub-agent is dispatched as the
> `rob-pike` agent so the code is judged and reshaped through the two minds that define idiomatic
> Go: Pike's philosophy and taste (clear over clever, small consumer-defined interfaces, errors are
> values, a little copying beats a little dependency, share memory by communicating) and Cheney's
> craft (error wrapping with context, functional options, APIs hard to misuse, honest package names,
> goroutines with known lifetimes and honored `context`). The orchestrator stays neutral — it
> coordinates the fan-out, integrates, and runs the gates — while the reading and refactoring is done
> in their voice.

## The core loop

1. **Scope** the project (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only sub-agents, one per package/concern, each a focused checklist.
3. **Consolidate** — rank findings by severity; cross-referenced findings are high-signal.
4. **Gate with the human** if findings imply design changes or you're about to spend real tokens.
5. **Fix fan-out** — sub-agents batched by package/file-ownership so no two edit the same file;
   pick model by complexity; **sub-agents do NOT run the test suite**.
6. **Integrate** — apply cross-cutting one-liners yourself, resolve overlaps.
7. **Verify ONCE** at the end: build, `go vet`, the race detector, the full test suite. Fix fallout.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean. Do not read
the whole project into the main context — that's what the sub-agents are for. You hold the
conclusions, not the file dumps.

---

## 1. Scope (orchestrator, cheap)

Get a sizing pass before deciding the fan-out shape. Find where the mass is, what the package graph
looks like, and which files are the god-files worth singling out:

```bash
go list ./...                                   # the package list — your fan-out unit
find . -name '*.go' -not -name '*_test.go' | xargs wc -l | sort -n | tail -30
go vet ./... 2>&1 | head                        # cheap pre-read of obvious issues
go build ./... 2>&1 | head                       # does it even build right now?
```

Read any `README`, `CONTRIBUTING`, `AGENTS.md`/`CLAUDE.md`, and `doc.go` files first — the project's
stated conventions are the rubric. A finding that contradicts a deliberate, documented decision is a
false positive, not a fix. (`internal/` boundaries, a deliberately monolithic package, a generated
file — all legitimate choices.)

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch one sub-agent per package or cross-cutting concern **in a single message** so they run
concurrently. **Run every sub-agent as the `rob-pike` agent** (`subagent_type: rob-pike`) with a
Sonnet model override (`model: sonnet`). Each agent is **read-only** (tell it not to modify files)
and gets a **focused checklist**. For Go, split by *concern* as much as by package — the most
valuable findings are cross-cutting:

- **API & interface design** — interfaces small and **defined by the consumer**, not the producer
  ("the bigger the interface, the weaker the abstraction"); accept interfaces, return concrete
  types; useful zero values; exported surface minimal (unexport anything that isn't a promise); no
  name stutter (`http.HTTPServer`); functional-options instead of giant parameter lists / mutable
  config structs; constructors that can't produce an invalid object.
- **Error handling** — errors wrapped with context as they cross a boundary (`fmt.Errorf("...: %w")`);
  inspected with `errors.Is`/`errors.As`, never string-matched; **no error silently discarded to
  `_`** without a stated reason; **no `panic` as control flow or thrown across a package boundary**
  (Go handles errors, it does not throw); sentinel/typed errors used deliberately; the failure path
  crafted as carefully as the happy path.
- **Concurrency** — every goroutine has a known lifetime and a way to stop (**no leaks**);
  `context.Context` threaded as the first parameter and actually honored (cancellation propagates);
  channel ownership and direction clear; no unbuffered-channel deadlocks; `sync.WaitGroup`/`Mutex`
  used correctly; **the race detector would stay quiet**; the simplest primitive chosen (a mutex is
  often clearer than a channel); captured loop variables (pre-1.22) checked.
- **Package layout & dependencies** — packages named for what they *provide*, not what they contain
  (no `util`/`common`/`helpers`/`base`/`models`); no import cycles; dependencies point inward;
  `internal/` used to enforce boundaries; `main`/`cmd` thin, wiring only — logic lives in importable
  packages.
- **Correctness & efficiency** — nils & interface-nil traps; maps written before `make`; slice
  aliasing/append surprises; needless allocations, large structs copied by value, `defer` in hot
  loops, unbounded growth; resource leaks (unclosed files/bodies/rows — `defer Close()` with its
  error checked).
- **Tests** — **table-driven** with `t.Run` subtests; real behavior over heavy mocking; interfaces
  faked at the seam rather than monkeypatching; no asserting on unexported internals; `t.Helper()`,
  `t.Cleanup()`, and `testing.T` used idiomatically; coverage gaps on error/edge/concurrency paths.

**Prompt each audit agent to:** read the relevant files fully; give every finding a
`file:line` + **severity (HIGH/MEDIUM/LOW)** + the idiom/principle violated (cite the Go Proverb or
the practice) + a **concrete fix**; lead with high-value findings and separate them from nitpicks;
**and call out what's done well** so you don't later "fix" a deliberate, correct choice. Return a
structured markdown report grouped by severity. Do NOT modify files. (Note: `gofmt`/`goimports`
violations are not worth a finding each — just note "run gofmt" once.)

## 3. Consolidate (orchestrator)

Merge the reports into one severity-ranked list. **Findings independently flagged by two agents are
high-signal — surface them.** Trim the LOW nitpicks unless the user wants exhaustiveness. Present the
ranked list; the long per-agent reports stay in the tool output for drill-down.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask the user only when a finding implies a
**design decision** the audit can't settle from the code (e.g. a fix that would change a public API,
break compatibility, or contradict a deliberate choice — see the hard-won lessons below), or before
you spend a large batch of tokens. One good gate beats ten clarifications.

## 5. Fix fan-out (parallel, batched by PACKAGE/FILE-OWNERSHIP)

The single most important rule of the fix phase:

> **Batch fixes so that no two parallel agents ever edit the same file.**

Group the work by which files/packages it owns; give each batch to one agent; independent batches
run concurrently in one message.

- **Run the fix agents as `rob-pike` too** (`subagent_type: rob-pike`) so refactors are shaped by the
  two minds — small interfaces discovered from use, errors handled with context, panics turned into
  returned errors, goroutines given lifetimes and `context`, packages renamed honestly, cleverness
  replaced by clarity — in small, safe, reversible steps.
- **Sonnet is the default; Opus is the rare exception.** Dispatch every fix agent on Sonnet
  (`model: sonnet`) unless a specific batch *genuinely* exceeds it — deep structural work where one
  wrong move cascades (reworking a concurrency model, redesigning a package boundary, threading
  `context` through a deep call tree). That bar is high: most "big" refactors are still a sequence of
  mechanical edits Sonnet handles well. Reach for `model: opus` only for the one or two batches that
  clear it, name *why* in the dispatch, and keep everything else on Sonnet. If you're unsure, it's a
  Sonnet job.
- **Sub-agents do NOT run the build/vet/race/tests** and **do NOT commit.** They edit and report.
  (Verification is centralized at step 7 so you control it and see all fallout at once.)
- **Freeze exported APIs** unless the finding is explicitly about changing one. When an agent splits a
  package or extracts an interface, tell it the public signatures are frozen so callers still compile.
- **Tell each agent what the OTHER agents are changing** at shared boundaries (e.g. "a new
  `Store` interface now lives in package `x` — depend on it"; "another agent owns `server.go`, don't
  touch it"), so parallel work composes instead of conflicting.
- Have each agent **report file-by-file** and **flag anything ambiguous** (a cross-cutting one-liner
  it couldn't apply because it didn't own the file) for you to handle at integration.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners the agents flagged (edits that span an ownership boundary — e.g.
updating a call site to a renamed function in a file you own). Resolve overlap, then a fast compile
check before the full gates:

```bash
gofmt -l .            # list anything unformatted; gofmt -w . to fix
goimports -w .        # if available — fixes import grouping
go build ./...        # must compile before you run the suite
```

## 7. Verify ONCE — and expect refactor fallout

Run the gates the project actually uses (read its README/Makefile for project-specific targets):

```bash
go build ./...
go vet ./...
go test -race ./...        # the race detector is the whole point for concurrency refactors
go test ./...              # (or the project's `make test` / golangci-lint run)
golangci-lint run          # if the project uses it
```

**Refactors predictably break the compile/test seam, not the behavior.** When it goes red, triage by
root-cause, not by count — many failures usually trace to a few causes. The Go classics:

- **Extracted/narrowed an interface** → call sites that depended on a method you dropped no longer
  compile, or a concrete type no longer satisfies the interface. Re-check the method set.
- **Threaded `context.Context`** → every caller of the changed signature must pass a `ctx`; the leaf
  uses `ctx.Done()`/honors cancellation; tests pass `context.Background()` or `t.Context()`.
- **panic → returned error** → callers must now check and propagate the error; the function signature
  grew an `error` return that every call site has to handle.
- **Package split/rename** → import paths and references update across the tree; watch for newly
  introduced import cycles (the compiler will tell you).
- **Race detector newly green/red** → if `-race` now fails, the refactor *exposed* a real data race,
  not created one; fix the synchronization, don't revert.

Distinguish compile/test-seam fallout (mechanical) from a **real regression or a newly-surfaced bug**
(a race the detector just caught, a nil the new path hits) — fix the latter properly, don't paper over it.

## 8. Commit

Stage **only the files this session touched** (list them explicitly; never `git add -A`/`git add .`
— other agents or the user may have unrelated dirty state). Conventional-commit message; in the body
record any declined findings and any latent bug the refactor surfaced (especially a race the detector
caught).

---

## Hard-won lessons (the ones that cost time)

- **Audits produce false positives. Verify every finding against the actual code before acting.**
  An auditor pattern-matching on shape will "find" a too-big interface, a missing `context`, or an
  "un-idiomatic" name that is in fact deliberate (a public API frozen for compatibility, an interface
  sized for a real second implementation). Implementing such a finding can break callers or
  compatibility. When a finding contradicts how the code is actually used, **decline it and surface
  the conflict to the user** — it's a signal, not a task.

- **Deleting "dead" code can expose a latent bug.** Removing a redundant indirection (an unused
  return, a swallowed error, a compatibility shim) can reveal that something only worked *because* of
  it. The honest fix completes the refactor and corrects the underlying defect rather than restoring
  the dead code to re-hide it.

- **A panic is not error handling.** Go handles errors as values; a `panic` thrown across a package
  boundary is a bug, not a style choice. Convert it to a returned, wrapped error and make callers
  handle it — the failure path deserves the same care as the happy path.

- **The bigger the interface, the weaker the abstraction.** A finding that says "extract an
  interface" is often wrong: interfaces are *discovered from use* and *defined by the consumer*. If
  there's one implementation and no test seam needs it, the concrete type is the better design.
  (Where Pike's "a little copying beats a little dependency" pulls against a Cheney-style abstraction,
  say so and resolve it with a reason.)

- **A leaked goroutine is invisible until production.** Every `go` statement needs an answer to "how
  does this stop?" — a `context`, a closed channel, a `done` signal. The race detector catches data
  races; nothing catches a leak but reading the lifetime. Audit both ends.

- **Keep the orchestrator's context clean.** The reason the fan-out works is that you never load the
  project into your own window. Delegate the reading; hold the conclusions. If you find yourself
  opening file after file in the main loop, you've stopped orchestrating.

## Scaling the effort

Scale the fan-out to the request. "Take a quick look at the error handling" → one or two audit
agents, fix inline. "Audit the whole project and fix everything" → the full concern/package split,
batched fix fan-out, all on Sonnet unless a batch truly needs Opus. When the user explicitly opts into
heavy multi-agent orchestration, the read-only audit fan-out and the ownership-batched fix fan-out
are exactly the shape a workflow encodes — but the default (a handful of `Agent` calls per phase) is
enough for most audits.
