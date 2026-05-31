---
name: python-auditor
description: >-
  Audit a Python codebase for idiom, design, typing, and correctness problems, then fix the findings
  — by fanning out read-only Sonnet sub-agents over the project package-by-package (and
  concern-by-concern: public API & types, idiomatic shape, error handling & resources, structure/
  imports, tests), consolidating their reports into a severity-ranked list, then dispatching fix
  sub-agents batched by file/module-ownership so they never collide. The orchestrator keeps its own
  context clean (delegate, don't read), integrates the results, and runs the format/lint/type/test
  gates ONCE at the very end — sub-agents never run the test suite. Use whenever the user wants to
  review/audit/clean up/refactor an existing Python project, "find where this isn't Pythonic", "make
  it more idiomatic", "audit the modules/types/error handling", "improve code quality", "are our
  type hints good / are we using the stdlib / any mutable-default or bare-except bugs", or otherwise
  improve a Python codebase's quality without adding a feature. Triggers even if the user doesn't name
  this skill, as long as they want a Python idiom/quality audit or the refactor that follows from one.
  NOT for greenfield product planning or adding a new feature.
---

# Python Auditor

Audit an existing Python project for idiom/design/typing/correctness violations and fix them, using a
fan-out → consolidate → fan-out → integrate → verify-once loop. This is a **process** skill: the loop
is the same one any large-codebase audit uses, but its checklists and gotchas are Python-specific.

> **Run by Raymond Hettinger (with Tim Peters and Guido van Rossum).** Every audit and fix sub-agent
> is dispatched as the `raymond-hettinger` agent so the code is judged and reshaped through the three
> minds that define idiomatic Python: Hettinger's craft ("there must be a better way" — comprehensions,
> dataclasses, itertools, context managers, EAFP, the stdlib used fully), Peters' Zen (explicit over
> implicit, simple over complex, flat over nested, readability counts, one obvious way), and van
> Rossum's authority on what is Pythonic (type hints, `Protocol`s, composition over inheritance, PEP
> 8/20). The orchestrator stays neutral — it coordinates the fan-out, integrates, and runs the gates —
> while the reading and refactoring is done in their voice.

## The core loop

1. **Scope** the project (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only sub-agents, one per package/concern, each a focused checklist.
3. **Consolidate** — rank findings by severity; cross-referenced findings are high-signal.
4. **Gate with the human** if findings imply design changes or you're about to spend real tokens.
5. **Fix fan-out** — sub-agents batched by module/file-ownership so no two edit the same file;
   pick model by complexity; **sub-agents do NOT run the test suite**.
6. **Integrate** — apply cross-cutting one-liners yourself, resolve overlaps.
7. **Verify ONCE** at the end: format-check, lint, type-check, the full test suite. Fix fallout.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean. Do not read
the whole project into the main context — that's what the sub-agents are for. You hold the
conclusions, not the file dumps.

---

## 1. Scope (orchestrator, cheap)

Get a sizing pass before deciding the fan-out shape. Find where the mass is, what the package layout
looks like, and which modules are the god-files worth singling out:

```bash
find . -name '*.py' -not -path '*/.*' -not -path '*/venv/*' | sort
find . -name '*.py' -not -name 'test_*' -not -path '*/test*/*' | xargs wc -l | sort -n | tail -30
ruff check . 2>&1 | tail -20            # or flake8 — a cheap pre-read of obvious issues
# note the tooling actually present: pyproject.toml / setup.cfg / tox.ini, mypy/pyright config, pytest
```

Read any `README`, `CONTRIBUTING`, `pyproject.toml`, and module docstrings first — the project's
stated conventions and its declared Python version are the rubric (idioms differ across 3.8 → 3.12:
`match` statements, `X | None`, `tomllib`, etc. — don't recommend a construct the floor version lacks).
A finding that contradicts a deliberate, documented decision is a false positive, not a fix.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch one sub-agent per package or cross-cutting concern **in a single message** so they run
concurrently. **Run every sub-agent as the `raymond-hettinger` agent** (`subagent_type:
raymond-hettinger`) with a Sonnet model override (`model: sonnet`). Each agent is **read-only** (tell
it not to modify files) and gets a **focused checklist**. For Python, split by *concern* as much as by
package — the most valuable findings are cross-cutting:

- **Idiomatic shape** — manual loops a comprehension / `enumerate` / `zip` / `sum` / `any` / `all` /
  `min`/`max(key=)` replaces; `range(len(x))` indexing; building a list to iterate once (use a
  generator); `collections` (`Counter`/`defaultdict`/`deque`) and `itertools` left on the table;
  `%`/`.format` that should be f-strings; `os.path` string surgery that's `pathlib`; manual
  acquire/release that should be a `with`/`contextlib`; a hand-written attribute bag that should be a
  `@dataclass`/`NamedTuple`; magic strings that should be an `Enum`; truthiness misuse
  (`if len(x) == 0`).
- **Types & public API** — missing/weak hints on public functions and dataclasses; concrete container
  types in signatures where `Sequence`/`Mapping`/`Iterable`/`Protocol` belong (accept the general,
  return the specific); `Any` as an escape hatch; an API hard to use correctly; a class where a
  function or `@dataclass` would do; inheritance where composition fits; does it pass `mypy`/`pyright`?
- **Error handling & resources** — bare `except:` / `except Exception` swallowing everything; catching
  too broad; errors passing silently; exceptions as control flow where a check is clearer (and
  vice-versa); resources not opened in a `with` (leaked files/sockets/locks); exception chaining
  (`raise ... from`) dropped.
- **Correctness traps** — **mutable default arguments**; **late-binding closures** in loops;
  mutating a collection while iterating it; `==` vs `is` (esp. `is None`); shared class-level mutable
  state; floating-point/`==` surprises.
- **Structure & imports** — a god-module/god-class doing too much; deep nesting guard clauses would
  flatten; packages named for what they contain (`utils`/`helpers`/`common`) not what they provide;
  circular imports; wildcard imports; missing/over-broad `__all__`.
- **Subtle cost** — needless materialization of large lists; O(n²) membership tests on a list that
  should be a `set`; repeated work that `functools.lru_cache` or hoisting fixes; eager work that
  should be lazy.
- **Tests** — behavior at the public boundary, not internals; `pytest.mark.parametrize` and fixtures
  over copy-paste; mock at the seam, not the unit under test; no asserting on private attributes;
  coverage gaps on error/edge paths.

**Prompt each audit agent to:** read the relevant files fully; give every finding a
`file:line` + **severity (HIGH/MEDIUM/LOW)** + the idiom/principle violated (cite the Zen line or the
stdlib tool) + a **concrete fix**; lead with high-value findings and separate them from nitpicks;
**and call out what's done well** so you don't later "fix" a deliberate, correct choice. Return a
structured markdown report grouped by severity. Do NOT modify files. (Note: pure formatting — line
length, import order, spacing — is a `black`/`ruff`/`isort` job, not a finding each; just note "run
the formatter" once.)

## 3. Consolidate (orchestrator)

Merge the reports into one severity-ranked list. **Findings independently flagged by two agents are
high-signal — surface them.** Trim the LOW nitpicks unless the user wants exhaustiveness. Present the
ranked list; the long per-agent reports stay in the tool output for drill-down.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask the user only when a finding implies a
**design decision** the audit can't settle from the code (e.g. a fix that would change a public API or
signature, break compatibility, or contradict a deliberate choice — see the hard-won lessons below),
or before you spend a large batch of tokens. One good gate beats ten clarifications.

## 5. Fix fan-out (parallel, batched by MODULE/FILE-OWNERSHIP)

The single most important rule of the fix phase:

> **Batch fixes so that no two parallel agents ever edit the same file.**

Group the work by which files/modules it owns; give each batch to one agent; independent batches run
concurrently in one message.

- **Run the fix agents as `raymond-hettinger` too** (`subagent_type: raymond-hettinger`) so refactors
  are shaped by the three minds — loops become comprehensions/itertools, attribute bags become
  dataclasses, magic strings become enums, manual cleanup becomes context managers, boundaries gain
  type hints, the clever becomes the clear — in small, safe, reversible steps.
- **Sonnet is the default; Opus is the rare exception.** Dispatch every fix agent on Sonnet
  (`model: sonnet`) unless a specific batch *genuinely* exceeds it — deep structural work where one
  wrong move cascades (splitting a god-module, redesigning an API, threading types through a deep
  call tree). That bar is high: most "big" refactors are still a sequence of mechanical edits Sonnet
  handles well. Reach for `model: opus` only for the one or two batches that clear it, name *why* in
  the dispatch, and keep everything else on Sonnet. If you're unsure, it's a Sonnet job.
- **Sub-agents do NOT run the formatter/linter/type-checker/tests** and **do NOT commit.** They edit
  and report. (Verification is centralized at step 7 so you control it and see all fallout at once.)
- **Freeze public signatures** unless the finding is explicitly about changing one. When an agent
  splits a module or extracts a type, tell it the public API is frozen so callers still import/work.
- **Tell each agent what the OTHER agents are changing** at shared boundaries (e.g. "a new `Result`
  dataclass now lives in `models.py` — import it"; "another agent owns `client.py`, don't touch it"),
  so parallel work composes instead of conflicting.
- Have each agent **report file-by-file** and **flag anything ambiguous** (a cross-cutting one-liner it
  couldn't apply because it didn't own the file) for you to handle at integration.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners the agents flagged (edits that span an ownership boundary — e.g.
updating a call site to a renamed function in a file you own). Resolve overlap, then a fast check
before the full gates:

```bash
python -m py_compile $(git diff --name-only --diff-filter=ACM | grep '\.py$')   # syntax-check touched files
ruff check --fix .        # or: black . && isort .   — formatting/auto-fixes
```

## 7. Verify ONCE — and expect refactor fallout

Run the gates the project actually uses (read its `pyproject.toml` / `tox.ini` / Makefile / CI for the
real targets and the right interpreter / virtualenv):

```bash
ruff check .              # or flake8 — lint
black --check .           # or the project's formatter check
mypy .                    # or: pyright   — type-check (the point of any typing refactor)
pytest                    # or: tox / the project's test command
```

**Refactors predictably break the import/test seam, not the behavior.** When it goes red, triage by
root-cause, not by count — many failures usually trace to a few causes. The Python classics:

- **Module split/rename** → import paths and references update across the tree; watch for **new
  circular imports** the split introduced, and update `__all__`/`__init__.py` re-exports.
- **Loop → comprehension/generator** → a *generator* is consumed once and is lazy; if the old list was
  iterated twice, indexed, or had `len()` called, the generator breaks it — keep a list there.
- **Added/changed type hints** → `mypy`/`pyright` now flags pre-existing type errors the code always
  had; that's the type checker doing its job. Fix the real type bug; don't silence with `# type:
  ignore` unless you can state why.
- **Attribute bag → dataclass** → callers constructing it positionally, or mutating frozen fields, or
  relying on the old `__init__`/`__repr__`, may break; check the construction sites.
- **EAFP rewrite / narrowed except** → a previously-swallowed exception now propagates; that usually
  *surfaces a real bug* the bare `except` was hiding — fix it, don't re-broaden the catch.

Distinguish import/test-seam fallout (mechanical) from a **real regression or a newly-surfaced bug**
(an exception the old bare-`except` swallowed, a type error mypy just caught) — fix the latter
properly, don't paper over it.

## 8. Commit

Stage **only the files this session touched** (list them explicitly; never `git add -A`/`git add .`
— other agents or the user may have unrelated dirty state). Conventional-commit message; in the body
record any declined findings and any latent bug the refactor surfaced (especially a real error a
narrowed `except` or a new type hint exposed).

---

## Hard-won lessons (the ones that cost time)

- **Audits produce false positives. Verify every finding against the actual code before acting.**
  An auditor pattern-matching on shape will "find" a "missing type hint", an "un-Pythonic" loop, or a
  "class that should be a function" that is in fact deliberate (a frozen public API, a loop that can't
  be a comprehension because it has side effects, a class kept for subclassing). Implementing such a
  finding can break callers. When a finding contradicts how the code is actually used, **decline it and
  surface the conflict to the user** — it's a signal, not a task.

- **Deleting "dead" code can expose a latent bug.** Removing a redundant indirection (a swallowed
  exception, an unused default, a compatibility shim) can reveal that something only worked *because*
  of it. The honest fix completes the refactor and corrects the underlying defect rather than
  restoring the dead code to re-hide it.

- **A generator is not a list.** The most common idiomatic-rewrite regression: turning a list
  comprehension into a generator expression when the result is iterated more than once, indexed, or
  measured with `len()`. Lazy is great until the caller needs to look twice.

- **The narrowed `except` surfaces real bugs.** When you replace a bare `except:` with a specific one,
  exceptions that were silently swallowed start propagating. That is the audit *working* — those were
  hidden bugs. Fix them; don't re-broaden the catch to make the suite green again.

- **Types document the boundary, not every local.** "Simple is better than complex" applies to
  annotations too: annotate public functions, dataclasses, and seams; reach for `Protocol` for
  duck-typed boundaries; don't turn a three-line helper into a generics puzzle. A finding that demands
  exhaustive `Any`-free typing of internal code is often Peters-vs-van-Rossum tension — resolve toward
  readable.

- **Keep the orchestrator's context clean.** The reason the fan-out works is that you never load the
  project into your own window. Delegate the reading; hold the conclusions. If you find yourself
  opening file after file in the main loop, you've stopped orchestrating.

## Scaling the effort

Scale the fan-out to the request. "Make this module more Pythonic" → one or two audit agents, fix
inline. "Audit the whole project and fix everything" → the full concern/package split, batched fix
fan-out, all on Sonnet unless a batch truly needs Opus. When the user explicitly opts into heavy
multi-agent orchestration, the read-only audit fan-out and the ownership-batched fix fan-out are
exactly the shape a workflow encodes — but the default (a handful of `Agent` calls per phase) is
enough for most audits.
