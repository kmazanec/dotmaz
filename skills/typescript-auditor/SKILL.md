---
name: typescript-auditor
description: >-
  Audit a TypeScript codebase for type-safety, idiom, design, and (framework-specific) correctness
  problems, then fix the findings — by detecting the ecosystem (pure TS / React / Node) during scope,
  then fanning out read-only Sonnet sub-agents over the project by concern, consolidating their
  reports into a severity-ranked list, then dispatching fix sub-agents batched by file-ownership so
  they never collide. The orchestrator keeps its own context clean (delegate, don't read), integrates
  the results, and runs the typecheck/lint/test/build gates ONCE at the very end — sub-agents never
  run the suite. The BASE TypeScript panel (type system + general code quality) always runs; framework
  panels (React, Node) LAYER on top when that stack is detected. Use whenever the user wants to review/
  audit/clean up/refactor an existing TypeScript project, "find where this isn't type-safe / isn't
  idiomatic TS", "kill the `any`s", "make illegal states unrepresentable", "audit our React hooks /
  effects / re-renders", "audit our Node async/error handling/streams", "improve code quality", or
  otherwise improve a TS codebase's quality without adding a feature. Triggers even if the user doesn't
  name this skill, as long as they want a TypeScript quality/type/idiom audit or the refactor that
  follows. NOT for greenfield product planning or adding a new feature.
---

# TypeScript Auditor

Audit an existing TypeScript project for type-safety/idiom/design (and framework-specific)
violations and fix them, using a detect → fan-out → consolidate → fix → verify-once loop. This is a
**process** skill: the loop is the same one the other auditors use, but its checklists are
TypeScript-specific and it **adapts to the ecosystem** it finds.

> **Layered personas.** The **base panel always runs**: the `matt-pocock` agent (Matt Pocock + Anders
> Hejlsberg + Ryan Cavanaugh) judges the **type system AND general code quality** (illegal states
> unrepresentable, no `any`, sound boundaries, small cohesive modules, duplication-vs-wrong-abstraction,
> dead code). On top of it, a **framework panel layers in when detected**:
> - **React** (incl. the React layer of Next.js) → the `dan-abramov` agent (Dan Abramov + Kent C.
>   Dodds): effects, re-renders, state modeling, hooks, component API, testing, a11y.
> - **Node / Deno / Bun backend** → the `ryan-dahl` agent (Ryan Dahl + Matteo Collina): async/error
>   propagation, event-loop blocking, streams/backpressure, leaks, graceful shutdown.
>
> The base panel owns types + design; the framework panel owns its framework lens and **defers type/
> structure findings to the base panel** so the two don't overlap. The orchestrator stays neutral —
> it detects, coordinates, integrates, and runs the gates.

## The core loop

1. **Scope & detect the ecosystem** (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents: the base `matt-pocock` panel by
   concern, plus the framework panel's concerns when a framework is detected.
3. **Consolidate** findings into a severity-ranked list.
4. **Human gate** only when a finding implies a real design decision.
5. **Fix fan-out** — sub-agents batched by file-ownership so no two edit the same file.
6. **Integrate** the cross-cutting edits on the orchestrator.
7. **Verify ONCE** at the end (typecheck / lint / test / build); sub-agents never run the suite.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean. Don't read the
whole project into the main context — that's what the sub-agents are for.

---

## 1. Scope & detect the ecosystem (orchestrator, cheap)

First find the mass, the config, and — critically — **what kind of TS project this is**, because that
decides which framework panel layers in:

```bash
# size & shape
find . -name '*.ts' -o -name '*.tsx' | grep -vE 'node_modules|\.d\.ts$|dist/|build/' | sort
find . \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' | xargs wc -l | sort -n | tail -30

# the rulebook: strictness is the audit's leverage
cat tsconfig*.json            # strict? noUncheckedIndexedAccess? exactOptionalPropertyTypes? skipLibCheck?

# DETECT THE ECOSYSTEM from package.json deps + file extensions
cat package.json              # look at dependencies / devDependencies and "type": "module"
```

Decide the ecosystem from the evidence:
- **React** if `react` is a dependency (and/or `.tsx` files, `next`, `react-native`, `@testing-library/react`). Next.js counts as React (+ note its server/client boundary).
- **Node / backend** if it's a server (`express`/`fastify`/`koa`/`nest`, or `http`, deno/bun config, a `bin`/`server` entry) with no browser UI.
- **Pure TS / library** if it's a package with a type-heavy public surface and neither of the above (a lib, a CLI's core, shared types). The base panel is the whole audit.
- **Both** is possible (a monorepo, or an SSR app) — layer *both* framework panels onto the relevant packages, scoped to their directories.

Read any `README`/`CONTRIBUTING`/`AGENTS.md` and note the **TS version and `strict` flags** — they're
the rubric (don't suggest `satisfies` to a pre-4.9 floor, etc.). A finding that contradicts a
deliberate, documented choice is a false positive, not a fix. **State which ecosystem you detected and
which panels you'll run** before fanning out.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch the sub-agents **in a single message** so they run concurrently. **The base panel always
runs as `matt-pocock`** (`subagent_type: matt-pocock`, `model: sonnet`); **the framework panel runs as
its agent when detected** (`subagent_type: dan-abramov` for React, `subagent_type: ryan-dahl` for
Node, `model: sonnet`). Each agent is **read-only** (tell it not to modify files) with a focused
checklist. Split by concern:

**Base panel — `matt-pocock` (always):**
- **Type holes** — `any` (explicit/implicit), unjustified `as`/`as any`/`!`, `@ts-ignore` vs a
  documented `@ts-expect-error`, public returns left to inference, `Function`/`object`/`{}` types.
- **Domain modeling** — loose booleans/strings where a **discriminated union** belongs; impossible
  states that compile; missing exhaustiveness (`switch` + `never`); primitive obsession a branded type
  would fix; `enum` vs literal-union misuse.
- **Sound boundaries** — external data (`fetch`/`JSON.parse`/env/req bodies) cast instead of validated;
  leaky `any` across an exported surface; `.d.ts`/public type-surface quality.
- **Generics & API** — type params that don't relate input→output; over-clever conditional/mapped
  types; missing `readonly`; an imprecise or unstable exported contract.
- **General code quality (the Metz lens)** — god-modules/functions; duplication that should be one
  named thing (or an over-eager abstraction to re-inline); dead code/unused exports; deep nesting;
  class-where-a-function-fits; tangled responsibilities; circular imports; barrel-file cycles.
- **Tests** — behavior at the public boundary not internals; type-level tests (`expectTypeOf`) for
  tricky types; mock at the seam.

**React panel — `dan-abramov` (when React detected):**
- **Effects** — effects that should be derived state / event handlers / nothing; lying or missing
  dependency arrays; cascading renders & fetch waterfalls; missing cleanup; `setState`-in-effect
  mirroring props.
- **Render & state** — derivable/colocatable state; server state duplicated into `useState`; cargo-cult
  `useMemo`/`useCallback`/`memo` (and the rare needed-but-missing one); context that re-renders the
  world; index-as-key; side effects/ref reads during render; god-components.
- **Component API & hooks** — prop-drilling composition would fix; boolean-prop explosions; logic that
  should be a custom hook; controlled/uncontrolled confusion; (Next) server/client boundary misuse.
- **Testing & a11y** — tests on implementation details vs user-visible behavior; test-id over role/
  label; mocking the component vs the network; missing keyboard/focus/semantic-HTML a11y.

**Node panel — `ryan-dahl` (when backend detected):**
- **Async & errors** — floating promises / missing `await`; unhandled rejections; swallowed errors;
  callback/promise mixing; needlessly serialized independent I/O, or unbounded `Promise.all` (needs a
  concurrency cap); missing `try/finally` cleanup.
- **Event-loop blocking** — sync FS/crypto/zlib or CPU-bound work in a request path; huge `JSON.parse`;
  `await` in a hot loop serializing I/O.
- **Streams & memory** — buffering large bodies/files instead of streaming; ignored backpressure;
  unbounded buffers/queues/caches; listeners never removed; request-scoped data retained in closures.
- **Robustness** — no timeout/cancellation (`AbortSignal`) on outbound calls; no graceful shutdown;
  unbounded request size/concurrency; `console.log` vs structured logging; secrets in logs;
  unvalidated input; unsanitized shell-out.

**Prompt each audit agent to:** read the relevant files fully; give every finding a `file:line` +
**severity (HIGH/MEDIUM/LOW)** + the principle violated (cite the rule, and the type/framework lens) +
a **concrete fix**; lead with high-value findings, separate them from nitpicks; **call out what's done
well**; and (framework agents) **defer pure type/structure findings to the base panel** to avoid
overlap. Return a structured markdown report grouped by severity. Do NOT modify files. (Pure formatting
is a Prettier/ESLint job — note "run the formatter/linter" once, not per line.)

## 3. Consolidate (orchestrator)

Merge into one severity-ranked list. **Findings independently flagged by two agents are high-signal.**
Where the base and framework panels both touched something (e.g. an untyped component-state union),
reconcile into one finding. Trim LOW nitpicks unless the user wants exhaustiveness; the long per-agent
reports stay in the tool output.

## 4. Human gate (only when it matters)

Most findings are obvious wins — just fix them. Stop and ask the user only when a finding implies a
**design decision** the audit can't settle from the code (a fix that changes a public API/type
contract, breaks compatibility, or contradicts a deliberate choice — see the hard-won lessons), or
before you spend a large batch of tokens. One good gate beats ten clarifications.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP)

The single most important rule of the fix phase:

> **Batch fixes so that no two parallel agents ever edit the same file.**

Group by file/module-ownership; give each batch to one agent; independent batches run concurrently.

- **Dispatch each batch as the agent whose lens it needs** — type/design batches as `matt-pocock`,
  React batches as `dan-abramov`, Node batches as `ryan-dahl`. Keep a single file owned by one agent
  even if it has both kinds of finding (the owning agent applies all of them, in that file's lens).
- **Sonnet is the default; Opus is the rare exception.** Dispatch every fix agent on `model: sonnet`
  unless a specific batch *genuinely* exceeds it — a deep multi-file structural/type refactor where
  one wrong move cascades (modeling a domain into discriminated unions across many call sites,
  reworking an effect/data-flow architecture, threading a generic through a deep tree). That bar is
  high: most "big" refactors are still a sequence of mechanical edits Sonnet handles well. Reach for
  `model: opus` only for the one or two batches that clear it, name *why* in the dispatch, and keep
  everything else on Sonnet. If you're unsure, it's a Sonnet job.
- **Sub-agents do NOT run typecheck/lint/tests/build** and **do NOT commit.** They edit and report.
  (Verification is centralized at step 7.)
- **Freeze exported types/signatures** unless the finding is explicitly about changing one. When an
  agent splits a module or remodels a type, tell it the public surface is frozen so callers compile.
- **Tell each agent what the OTHER agents are changing** at shared boundaries (e.g. "a new `Result<T>`
  discriminated union now lives in `types.ts` — import it"; "another agent owns `server.ts`, don't
  touch it"), so parallel work composes.
- Have each agent **report file-by-file** and **flag anything ambiguous** (a cross-cutting one-liner it
  couldn't apply because it didn't own the file) for you to handle at integration.

## 6. Integrate (orchestrator)

Apply the cross-cutting one-liners the agents flagged. Resolve overlap, then a fast check before the
full gates:

```bash
npx tsc --noEmit                       # must typecheck before you trust anything
npx prettier --write . && npx eslint --fix .   # or the project's format/lint (pnpm/yarn/bun equiv)
```

## 7. Verify ONCE — and expect refactor fallout

Run the gates the project actually uses (read `package.json` scripts / CI for the real targets and the
right package manager — `npm`/`pnpm`/`yarn`/`bun`):

```bash
npx tsc --noEmit          # the typecheck — the point of any type refactor
npm run lint              # eslint (or the project's script)
npm test                  # vitest/jest/node:test (or the project's script)
npm run build             # if there's a build step (tsup/vite/next build/esbuild)
```

**Refactors predictably break the typecheck/test seam, not the behavior.** Triage by root-cause, not
count — many failures usually trace to a few causes. The TS classics:

- **Remodeled a type / added a discriminated union** → call sites that destructured the old shape, or
  switched without exhaustiveness, no longer compile. Update them; let the `never` default catch the
  rest. This is the type system doing its job.
- **Turned on a strict flag / removed an `any`** → `tsc` now surfaces pre-existing type errors the
  `any` was hiding. Fix the real bug; don't reintroduce `any` to silence it.
- **`useEffect` → derived state / event handler (React)** → tests or call sites depending on the old
  effect timing change; verify render behavior, not just compile.
- **Narrowed a catch / awaited a floating promise (Node)** → a previously-swallowed error now
  propagates — that usually *surfaces a real bug*. Handle it; don't re-swallow.
- **Module/barrel split** → import paths update; watch for newly introduced **circular imports**.

Distinguish typecheck/test-seam fallout (mechanical) from a **real regression or newly-surfaced bug**
(an error the `any`/bare-catch was hiding, a render the effect-removal exposed) — fix the latter
properly, don't paper over it.

## 8. Commit

Stage **only the files this session touched** (list them explicitly; never `git add -A`/`git add .`
— other agents or the user may have unrelated dirty state). Conventional-commit message; in the body
record any declined findings and any latent bug the refactor surfaced (a real error a removed `any` or
an awaited promise exposed).

---

## Hard-won lessons (the ones that cost time)

- **Audits produce false positives. Verify every finding against the actual code before acting.**
  An auditor pattern-matching on shape will "find" a "missing type", an "unnecessary effect", or a
  "should-be-streamed" that is in fact deliberate (a frozen public type, an effect that genuinely
  syncs an external store, a small payload that's fine buffered). Implementing it can break callers or
  behavior. When a finding contradicts how the code is actually used, **decline it and surface the
  conflict to the user** — it's a signal, not a task.

- **Deleting "dead" code can expose a latent bug.** Removing a redundant indirection (an `any` cast, a
  swallowed catch, an unused default) can reveal something only worked *because* of it. The honest fix
  completes the refactor and corrects the underlying defect, rather than restoring the dead code.

- **`any` and a bare `catch` both hide real bugs.** Replacing `any` with precise types, or narrowing a
  catch / awaiting a floating promise, makes `tsc` and the runtime surface errors that were always
  there. That's the audit *working* — fix them; don't reintroduce the hole to go green.

- **The type a teammate can't read is a liability.** "Clear is better than clever" applies to types:
  a deeply-generic type whose error message is unreadable, or that slows the editor, is worse than a
  simpler type plus a runtime guard. (Pocock-vs-Cavanaugh tension — resolve toward readable.)

- **Most `useEffect`s shouldn't exist; most memoization isn't needed.** The two highest-value React
  moves are deleting effects (derive, or handle in events) and removing cargo-cult `useMemo`/
  `useCallback` — and fixing renders by moving state down, not by memoizing.

- **In Node, the event loop is the whole game.** A single blocking call or floating promise in a hot
  path takes the service down under load in a way that never shows locally. Audit async, blocking, and
  backpressure as first-class, not afterthoughts.

- **Keep the orchestrator's context clean.** The reason the fan-out works is that you never load the
  project into your own window. Delegate the reading; hold the conclusions.

## Scaling the effort

Scale the fan-out to the request. "Make this module type-safe" → one or two base agents, fix inline.
"Audit the whole app and fix everything" → base panel + the detected framework panel, full concern
split, batched fix fan-out, all on Sonnet unless a batch truly needs Opus. When the user explicitly
opts into heavy multi-agent orchestration, the read-only audit fan-out and the ownership-batched fix
fan-out are exactly the shape a workflow encodes — but the default (a handful of `Agent` calls per
phase) is enough for most audits.
