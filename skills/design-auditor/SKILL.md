---
name: design-auditor
description: >-
  Audit an existing frontend/UI for visual design, UX, design-system consistency, and accessibility,
  then fix the findings. Reviews hierarchy, layout, spacing, typography, color, depth, component
  consistency, interaction states, and WCAG issues; drives the running UI for evidence and validates
  with build/lint/a11y checks. Use when the user asks whether a UI looks good or usable, wants UI/UX
  polish, design-system cleanup, spacing/typography/color review, accessibility review, or a more
  professional interface. For designing a new UI from scratch, use frontend-design instead.
---

# Design Auditor

Audit an existing frontend/UI for visual quality, UX, design-system consistency, and accessibility, and
fix it — using a fan-out → consolidate → fix → verify-once loop. This is a **process** skill. It judges
whether the UI is **good and usable**, which is a different question from whether the framework code is
correct (the framework auditors own that). It is largely **framework-agnostic** — it reads the rendered
markup, components, and styles (and, ideally, the running UI) regardless of React/Vue/Svelte/Rails
views/SwiftUI/plain HTML.

> **Run by Paula Scher (with Adam Wathan, Steve Schoger, and Brad Frost).** Every audit and fix
> sub-agent is dispatched as the `paula-scher` agent so the UI is judged through four design minds:
> **Scher's bold art-direction voice** (lead — type as hero, fearless scale and color, a point of view
> that makes a design memorable, not just correct), Wathan/Schoger's visual craft (hierarchy, spacing,
> type, color, depth — Refactoring UI), and Frost's design-systems rigor (components, tokens,
> consistency). The orchestrator stays neutral — it scopes, coordinates, drives the running UI for
> evidence, integrates, and runs the gates.

## The core loop

1. **Scope & SEE the UI** (cheap, on the orchestrator) — find the components/styles AND look at the
   rendered result.
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per design concern.
3. **Consolidate** into a severity-ranked list.
4. **Human gate** only when a fix is a real visual/brand judgment call (a redesign, a palette change).
5. **Fix fan-out** — sub-agents batched by file-ownership so no two edit the same file.
6. **Integrate** the shared token/component changes on the orchestrator.
7. **Verify ONCE** — build, lint, an automated a11y pass, and re-view the rendered UI.
8. **Commit** only what you changed (never `git add -A`).

## 1. Scope & SEE the UI (orchestrator, cheap)

Design review needs the *rendered* result, not just the source. Find the UI layer and look at it:

```bash
# find the UI: components, templates, stylesheets, design tokens
find . \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' -o -name '*.erb' -o -name '*.html' -o -name '*.css' -o -name '*.scss' \) \
  | grep -vE 'node_modules|dist|build' | sort
# tokens / config: tailwind.config, a theme/tokens file, CSS custom properties
ls tailwind.config.* theme.* tokens.* 2>/dev/null; git grep -nE "--[a-z]+-(color|spacing|radius)" | head
```

**Then actually look at it.** Use the `run` skill (or the project's dev-server command) to launch the
app, and the chrome-devtools / playwright tools to **take screenshots** of the key screens at desktop
and mobile widths — the audit is far stronger judging pixels than reading class names. Note the project's
design system / component library (Tailwind, a design-tokens file, shadcn, Material, a bespoke kit) so
findings respect it. A deliberate brand choice is not a finding.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch sub-agents **in a single message**, all as the `paula-scher` agent (`subagent_type:
paula-scher`, `model: sonnet`), read-only, one per concern. Give each the relevant components/styles and
the screenshots:

- **Hierarchy & layout** — is the most important thing the most prominent? size-only hierarchy; loud
  secondary content; label noise; no clear primary action; misalignment; no grid; unconstrained/stretched
  content width.
- **Spacing & rhythm** — arbitrary/inconsistent spacing vs. a scale; cramped or starved whitespace; poor
  grouping/proximity; inconsistent padding across like components.
- **Typography** — too many sizes/weights; poor line-height/measure (45–75 chars); centered long text;
  all-caps abuse; no clear type scale.
- **Color & depth** — thin palette (3 grays + a blue); meaning conveyed by hue alone; weak/again contrast;
  inconsistent or physically-illogical shadows; flat where depth would aid affordance; buttons that don't
  look clickable.
- **Design system & consistency** — duplicated component variants that should be one; magic values instead
  of tokens; a fourth button style; drift between screens; one-off styles that should be primitives; ad-hoc
  dark-mode hacks; iconography/radius inconsistency.
- **Art direction & distinctiveness (the Scher lens)** — is this memorable or just correct? timid type
  with no scale contrast; no focal point or compositional drama; a generic "AI-default"/template look with
  no point of view; one tasteful accent doing all the work with no conviction; a hero/landing/brand surface
  that plays it safe where it should commit to a voice (color, type, composition). Weigh by context — a
  dense settings panel shouldn't shout; a marketing/landing/brand surface shouldn't whisper. The default
  failure of dev-built UI is *forgettable*, so on impression-making surfaces, push toward distinctiveness.
- **States** — missing or unstyled empty, loading (skeleton), error, disabled, and hover/focus states; no
  feedback on action; blank-box empty states that don't guide.
- **Accessibility (WCAG)** — contrast below AA (4.5:1 body / 3:1 large/UI); color-only meaning; missing
  form labels; missing/weak focus indicators; non-semantic markup (div-buttons); broken keyboard order or
  traps; tiny tap targets (<44px); missing alt text; motion not respecting `prefers-reduced-motion`;
  incorrect/lying ARIA.

**Prompt each agent to:** review the components/styles AND the screenshots; report each finding with
**severity (HIGH/MEDIUM/LOW)**, the principle (and which mind), the location/component, and a **concrete
fix** (the exact spacing/weight/color/token change, or the component to extract/consolidate); lead with
high-impact; **call out what's done well**. Accessibility failures that block use (contrast, focus,
keyboard, labels) rank HIGH. Return a structured report grouped by severity. Do NOT modify files.

## 3. Consolidate (orchestrator)

Merge into one severity-ranked list; **two-agent overlaps are high-signal** (e.g. "no spacing scale" and
"magic values not tokens" are the same root). Lead with accessibility blockers and broken hierarchy.
Trim subjective nitpicks unless the user wants exhaustiveness.

## 4. Human gate (visual judgment calls only)

Fix the clear wins (raise contrast, add focus states, apply the spacing/type scale, consolidate a
duplicate component). **Stop and ask** before a real aesthetic/brand decision — a palette overhaul, a
layout redesign, a typeface change — and show options (mockups/screenshots) so the user can choose. Don't
impose a personal aesthetic over a deliberate brand.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP)

> **Batch fixes so that no two parallel agents ever edit the same file.**

- **Run the fix agents as `paula-scher`** (`subagent_type: paula-scher`) so changes apply the spacing/
  type/color scale consistently, extract repeated patterns into shared components/tokens, raise contrast
  and add focus states, and add the missing empty/loading/error states.
- **Sonnet is the default; Opus is the rare exception** — `model: sonnet` unless a batch genuinely
  exceeds it (introducing a token system across the whole app, a design-system refactor). Name *why*; if
  unsure, it's a Sonnet job.
- **Sub-agents do NOT run the build/dev-server/tests** and **do NOT commit.** They edit and report.
- **Change presentation, not behavior** — don't alter data flow or framework logic (that's the framework
  auditors' domain); if a design fix needs a logic change, flag it.
- Tell each agent what others touch at shared boundaries (a shared `Button`, a tokens file); have it report
  file-by-file and flag cross-cutting token changes for you.

## 6. Integrate (orchestrator)

Apply the shared token/component changes (the design-system primitives multiple screens depend on).
Resolve overlap. Build before the gates.

## 7. Verify ONCE — re-SEE the UI

```bash
# the project's build + lint (read package.json/CI), then an automated a11y pass:
npx @axe-core/cli <url>      # or pa11y / Lighthouse accessibility — catches contrast/labels/roles
```

Then **re-launch the app and re-screenshot** the changed screens at desktop and mobile widths and
compare against the before — the proof of a design fix is visual, not a green build. Confirm contrast/
focus/keyboard fixes with the a11y tool. Watch for layout regressions a spacing/token change can cause.

## 8. Commit

Stage **only the files this session touched** (never `git add -A`). Conventional-commit message (e.g.
`style(ui):` / `feat(design-system):`); note before/after screenshots if useful and any gated aesthetic
decisions.

---

## Hard-won lessons

- **See it, don't just read it.** Class names lie; the rendered pixels don't. A design audit without
  screenshots is guessing. Drive the running UI.
- **Accessibility is correctness, not polish.** A contrast failure or an unfocusable control makes the
  product unusable for real people — rank those HIGH, fix them first, and never convey meaning by color
  alone.
- **Consistency beats local cleverness.** A bespoke just-right tweak on one screen that diverges from the
  system is usually a net loss — extract the primitive instead. (But don't force two things that merely
  look alike into one wrong shared component.)
- **Audits produce false positives — respect the brand.** A deliberate color, an intentional asymmetry,
  a brand typeface is not a "violation." When a finding fights a clear design intent, decline it and say
  so; for real aesthetic forks, gate to the human.
- **The fix is the token/component, not the one-off override.** Patching one button's padding leaves the
  other eleven wrong. Fix it in the scale/component so the whole app moves together.
- **Keep the orchestrator's context clean.** Delegate the reading; hold the conclusions and the
  screenshots.

## Scaling the effort

"Make this one screen look better" → one or two concern agents on it + screenshots, fix inline. "Audit
the whole app's design and accessibility" → the full concern fan-out across screens, the a11y pass, the
ranked report, batched token/component fixes — all on Sonnet unless a batch truly needs Opus. The
default (a handful of `Agent` calls per phase) is enough for most reviews.
