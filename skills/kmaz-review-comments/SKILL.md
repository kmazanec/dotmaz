---
name: kmaz-review-comments
description: >-
  Address the comments, questions, or feedback on the open Pull Request or Merge Request,
  then propagate any durable lessons back into the project's architecture, ADRs, roadmap,
  or build conventions so the next feature inherits them. Use when there is an open PR/MR
  with review feedback to work through.
---

# Review Comments → Fixes + Durable Lessons

## What this is for

A PR review is two things at once: a list of *changes to make to this PR*, and a stream
of *lessons that should outlive this PR*. The default failure mode is to address only
the first and lose the second — every reviewer comment that taught you something becomes
tribal knowledge in this one PR's thread, and the next feature repeats the same mistake.

This skill addresses the comments **and** captures the durable lessons in the artifacts
that future features and agents will actually read.

## Workflow

### Step 1 — Pull all comments from the PR/MR

Use the appropriate CLI (`gh pr view --comments` and `gh api repos/<o>/<r>/pulls/<n>/comments`
for GitHub; `glab mr notes` for GitLab) to pull every comment, question, and review thread
on the open PR/MR. Include both top-level review comments and inline file/line comments.

### Step 2 — Triage each comment

For each comment, decide one of:

- **Fix** — the comment identifies a real issue; change the code.
- **Respond** — the comment is wrong, already addressed, or out of scope; reply with a
  clear explanation of why and link to evidence (a test, an ADR, an architecture
  section). Don't be defensive; do be specific.
- **Defer** — the comment identifies a real issue but it's larger than this PR; open a
  follow-up issue / new feature file, link it in the response, and explain the defer.

Address comments in a deliberate order: blocking / requested-changes first, then
correctness, then style. Don't batch — work them one at a time so the PR history shows
each thread closing.

### Step 3 — Apply fixes and respond

For each fix: make the change, run the relevant tests, and reply on the thread linking
to the commit that addressed it. For each respond/defer: post the reply and explain.

**Resolving the threads is your job — it is a core part of this skill, not an optional
courtesy and not something to ask permission for.** As each thread is addressed (fixed,
responded, or deferred with a linked follow-up), mark it **resolved** via the forge API
— for GitLab: `glab api --method PUT "projects/<o>%2F<r>/merge_requests/<n>/discussions/<id>?resolved=true"`
(fetch discussion ids from `.../merge_requests/<n>/discussions`); for GitHub: resolve the
review thread. Resolving the reviewer's own threads (including an AI review bot's) is
expected workflow — do not stop to confirm it. The reviewer can always re-open if not
satisfied. A review round is not done until the threads it raised are resolved (or
explicitly left open with a stated reason, e.g. a deferral the reviewer must sign off on).

### Step 4 — Capture durable lessons (the Compound step)

This is the step that exists *only* in this skill, and it's the most important. A PR
review surfaces lessons that no adversarial subagent caught — because reviewers bring
context, taste, and history the agent didn't have. Let those lessons compound.

For each review comment that resulted in a fix or a defer, ask: **would the next
feature builder benefit from knowing this?** If yes, propagate it now, in this same
session, before the PR merges:

- **A reviewer disagreed with a decision and you changed it** → write a new ADR
  capturing the new decision and superseding the old one (if there was one). Don't
  let the reasoning live only in a PR thread.
- **A reviewer pointed out a pattern the codebase prefers** → add it to the relevant
  cross-cutting concerns section of `ROADMAP.md`, or — if it's about *how to build
  features in this repo* — propose adding it to `CLAUDE.md` for the user to accept.
- **A reviewer caught a class of bug the adversarial review missed** → consider whether
  it should become an explicit check the next adversarial review run will catch (e.g.
  a project-specific lens to brief the security or robustness reviewer with). Note it
  for the user.
- **A reviewer surfaced a missing integration / contract / dependency** → update
  `ARCHITECTURE.md` (a new component, a new flow) or `ROADMAP.md` (a missing
  integration feature, a new cross-cutting concern). Update the diagrams.
- **A reviewer flagged a doc/spec gap** → update the relevant feature file, ADR
  consequences section, or brand contract so it doesn't recur.

If nothing in the review qualifies — sometimes a review is purely about this PR's
code — say so explicitly in the PR body addendum (below). That's a valid outcome; the
discipline is to *ask*, not to manufacture lessons.

### Step 5 — Update the PR body with what you did

Append (or update) a `## Review response` section to the PR/MR body listing:

- Threads addressed (count, with links to the resolving commits).
- Threads where you responded without changing code (with brief rationale).
- Threads deferred (with links to follow-up issues/feature files).
- **Propagated lessons:** ADRs created/superseded, ARCHITECTURE.md / ROADMAP.md
  updates, CLAUDE.md proposals, or "no durable lessons this round."

### Step 6 — Push and notify

Push the fix commits and the doc-propagation commits. The propagation commits should
be separate from the code fixes so the diff is readable. Reply on the PR with a
short summary comment naming the propagated lessons (so the reviewer sees their
feedback compounded, not just locally absorbed).

**Confirm every addressed thread is marked resolved** (Step 3) before you consider the
round done — a green re-review with the threads still flagged "unresolved" leaves the MR
showing blocking discussions. If a force-push/rebase re-triggered the reviewer and it came
back clean, that confirms the fixes landed: resolve the original threads. This is the
agent's responsibility; don't defer it to the user.

Do not re-request review automatically; the reviewer will look when ready.

## Judgment notes

- The Compound step (Step 4) is the whole point. A skill that only addresses comments
  is just `gh pr review --comment`; the value here is making review feedback into
  inheritable knowledge.
- If a propagation would touch many files or change the architecture meaningfully,
  pause and confirm with the user before making the change. Quick edits (a new ADR,
  a new bullet in ROADMAP.md) don't need confirmation; restructuring ARCHITECTURE.md
  does.
- Don't propagate trivial lessons. Bar: "would the next feature actually benefit?"
  If the answer is "probably not," skip it. Quantity of propagation is not a goal.
- Reviewers' comments are evidence; treat them with the same respect as your own
  adversarial subagents' findings. If you disagree, push back with a reason — don't
  perform agreement.
