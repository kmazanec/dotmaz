---
name: kmaz-merge-and-cleanup
description: >-
  Safely land a completed feature branch into main with linear history, then clean up:
  rebase the branch onto local main, resolve only trivial conflicts (escalate real ones),
  protect any unrelated dirty state on main, fast-forward merge to keep history linear,
  then delete the branch and its git worktree. Use this skill whenever the user wants to
  merge/land/integrate a finished branch, "merge this into main", "land the feature",
  "ff-merge and clean up", "rebase and merge then delete the worktree", or otherwise
  finish and tidy up a development branch after the work and review are done. It is the
  natural follow-on to kmaz-feature-builder (which ends at an open, rebased PR). Trigger even
  if the user doesn't name this skill, as long as they're asking to merge a branch into
  main and tidy up afterward.
---

# Merge and Cleanup

## What this is for

The closer of the suite. `kmaz-architecture-to-roadmap` plans, `kmaz-feature-builder` builds and
opens a rebased PR; this skill takes a finished, reviewed branch and **lands it into main
with a linear history, without ever clobbering unrelated work, then removes the scaffolding**
(branch + worktree).

The whole skill is organized around one priority order: **never destroy unrelated work >
keep history linear > be autonomous.** When those conflict, the earlier one wins. Other
people or agents may be working in this repo concurrently; this skill assumes it does not
own the repo and acts conservatively around anything it didn't create.

## Preconditions to check first

Before touching anything, establish the facts:

- Identify the **feature branch**, its **worktree**, and the **target** (`main` or the
  repo's default branch — detect it, don't assume the name).
- Confirm the branch actually has commits to land and is not already merged. If it's
  already fully merged, skip straight to cleanup (Step 5) after confirming.
- Note the repo's test/build tooling (you'll need it for the pre-delete gate).
- Detect whether the branch has an **upstream/remote tracking branch and an open PR/MR**
  on a forge (GitHub/GitLab — `git rev-parse --abbrev-ref @{u}`, `gh pr`/`glab mr` as
  available). Record the PR/MR id if there is one. This determines whether Step 3b
  (remote sync so the PR/MR closes cleanly) applies at all.
- This skill lands work into **local** main. It does not invent remote operations — but
  when the branch *does* have an open remote PR/MR, leaving the remote untouched is what
  produces a stale "still open / 0 changes" MR after a rebase. So: local landing is the
  default; remote sync (Step 3a) happens **only** when there is an open PR/MR to close.
  Force-pushing *that PR/MR's own branch* to the rebased commits needs no extra
  authorization (it's consented scaffolding carrying already-reviewed content); pushing
  `main` or any shared branch still does.

## The dirty-main rule (read before any git mutation)

Before any rebase or merge, check the **target branch's working tree and index for
uncommitted/unrelated changes** (and whether it's currently checked out elsewhere, e.g.
the main worktree). If main has dirty state you did not create:

**Stop. Do not stash, reset, checkout-over, or otherwise touch it. Ask the user how to
proceed** (options to offer: they commit/stash it themselves; they confirm it's safe and
how; abort). Auto-stashing someone else's uncommitted work is exactly the data-loss this
skill exists to prevent — convenience never justifies it.

To avoid disturbing main's working tree at all, prefer doing the integration **from the
feature worktree** and updating main's ref rather than checking main out. Only operate on
a checked-out main if it is clean and that's the simplest correct path.

## Workflow

### Step 1 — Rebase the feature branch onto local main

Rebase the feature branch onto the current tip of local main so its commits sit directly
on top of main (this is what makes the later merge a true fast-forward and the history
linear). Do this in the feature worktree.

### Step 2 — Resolve conflicts: trivial only, escalate the rest

If the rebase hits conflicts, classify each:

- **Trivial / unambiguous** — lockfiles, generated files, import ordering, formatting-only,
  pure-additive non-overlapping hunks: resolve them, preferring regeneration over hand-editing
  where a generator exists (e.g. re-run the lockfile tool).
- **Semantic / ambiguous** — any conflict where resolving it is a real code decision (logic,
  overlapping edits to the same behavior, anything you'd have to *reason* about): **pause and
  hand it to the user** with the conflicting hunks, both sides' intent, and your read of the
  options. Do not guess at semantic merges; a wrong silent resolution is worse than stopping.

Resolve, continue the rebase, repeat until it completes or you've escalated.

### Step 3a — Sync the rebased branch to its remote, *before* the local merge

**Only if Preconditions found an open remote PR/MR for this branch.** If there is no
upstream or no open PR/MR, skip straight to Step 3b — this is pure local landing.

The ordering bug this step exists to prevent: if you rebase locally, fast-forward main
locally, *then* push, the forge never sees the PR/MR's source-branch commits become
reachable through its own merge tracking — GitLab/GitHub leaves the MR **open showing
"0 changes"** (or you're tempted to fake a merge / force-push after the fact). Pushing
the rebased branch *before* the merge, then letting the forge close it, is what makes
the PR/MR show **cleanly merged** with no manual fix-up.

Sequence:

1. The rebase (Step 1) rewrote the branch's commits, so its local tip now diverges from
   the stale remote tip. Updating the remote branch to the rebased commits is therefore
   a **non-fast-forward (force) push** — the one place this skill force-pushes.
2. **No separate authorization is needed to force-push the PR/MR's own feature branch.**
   It is disposable scaffolding the user already consented to by running this workflow,
   and the push carries the *same content* that was reviewed (rebase only moved it onto
   a new base). This is categorically different from pushing `main` or any shared/
   long-lived branch — that still requires explicit permission and honors any standing
   per-push repo rule. The exception is strict: only *this* feature branch, only when
   it has an open PR/MR, only rebased-identical content.
3. Force-push **safely**: `git push --force-with-lease=<branch>:<expected-remote-sha>`
   (never bare `--force`) so a concurrent remote update aborts the push instead of
   clobbering someone else's work — the priority order still rules here. The rebased
   content must be identical to what you verified locally; confirm the diff to the old
   remote tip is empty (rebase-only, no content change) before pushing. State plainly
   what you did: which branch, from which remote SHA to which, and that its purpose is
   to let PR/MR `<id>` close cleanly.

After this push the remote branch holds the rebased commits; the forge can now record
the PR/MR as merged once main contains them (handled by its merge action or, for a
pure-ff forge flow, by Step 3b making them reachable on the target).

### Step 3b — Fast-forward merge, with re-rebase-on-race loop

Re-check the dirty-main rule (main may have changed while you worked). Then merge the
branch into main as a **fast-forward only** (no merge commit — linear history is the
point).

A fast-forward only succeeds if main's tip is exactly the commit the branch was rebased
onto. If main advanced in the meantime (a concurrent commit landed), the fast-forward
will be refused — **do not fall back to a merge commit.** Instead:

1. Re-rebase the feature branch onto the new main tip (Step 1 again).
2. Re-resolve any new conflicts under the Step 2 rule.
3. **Re-do Step 3a** if it applied (the re-rebase moved the branch again, so the remote
   needs the new tip too — same `--force-with-lease`, rebase-only discipline).
4. Retry the fast-forward.

Loop this until the fast-forward succeeds. The only things that break the loop are: a
conflict that must be escalated (hand off to the user), or the dirty-main rule tripping
(ask the user). A moving main is normal and handled automatically; it is not a failure.

If there is an open PR/MR and the forge does not auto-close it from the push + reachable
commits, close it via the forge CLI **with a merge action** (e.g. `glab mr merge` /
`gh pr merge`) so it reflects "merged", not a manual "closed" — never fabricate a merge
the history doesn't actually contain.

### Step 4 — Verify the merge before any deletion

Cleanup is effectively irreversible for the worktree, so gate it. **Both must hold:**

1. **Fully merged:** every feature commit is reachable from main's tip (the branch is
   genuinely integrated, not just "looks merged").
2. **Tests green post-merge:** run the repo's test suite *on the merged main state* and
   confirm it passes. A clean merge that breaks tests is not a successful landing.

If either fails: **do not delete anything.** Leave the branch and worktree intact, report
exactly what failed (and the merged state), and let the user decide. Preserving the
ability to investigate beats tidiness.

### Step 5 — Delete the branch and worktree

Only after Step 4 passes (or you confirmed in Preconditions it was already safely merged):

- Ensure the worktree has **no uncommitted changes** before removing it — if it does,
  something was never committed; stop and surface it rather than discarding it.
- Remove the git worktree, then delete the feature branch.
- Confirm both are gone and report the final state: branch landed on main (linear),
  worktree and branch removed, tests green.

**Closing the remote PR/MR — do not ask, hand it back.** Once local landing is done
and Step 3a has pushed the rebased commits to the PR/MR's own branch, the skill is
finished. **Do not prompt the user to choose how to close the MR, and do not run
`glab mr merge` / `gh pr merge` yourself** (that advances remote `main`, which the skill
never does). Closing the MR is the user's step: they push `main` themselves and the
forge auto-closes the PR/MR as merged from the fast-forward. So just **state the final
status and stop**: local `main` is at `<sha>` (linear), the rebased commits are on
`origin/<branch>`, the PR/MR will close automatically when the user pushes `main`. One
factual sentence — not a question, not an options menu.

## Judgment notes

- The priority order (don't destroy unrelated work > linear history > autonomy) resolves
  almost every edge case. When unsure, choose the option that preserves the user's/others'
  ability to recover, even if it means stopping and asking.
- "Linear history" specifically means: no merge commit for this landing, feature commits
  replayed on top of main. If the user later says they prefer a merge commit or squash,
  that's a different request — this skill is the fast-forward/linear one by design.
- The remote is touched in exactly one sanctioned place: **Step 3a**, force-pushing the
  PR/MR's *own* feature branch to the rebased commits so the PR/MR closes cleanly. That
  specific push needs no extra authorization (consented scaffolding, already-reviewed
  content) but must use `--force-with-lease` and be verifiably rebase-only. Outside that:
  never push a branch with no open PR/MR, never bare `--force`, never hard-reset a
  shared branch, **never push `main` or any shared/long-lived branch yourself**, and
  never fabricate a merge the local history doesn't contain.
- **The user closes the remote PR/MR by pushing `main` themselves — this is the expected
  end state, not an open question.** After local landing + Step 3a, do **not** ask the
  user how to close the MR and do **not** offer to merge it via the forge CLI. The
  fast-forward is verifiably genuine (Step 3a made the rebased commits reachable on the
  PR/MR's branch); the user pushing `main` lets the forge auto-close it as merged. End
  by stating that factual status and stopping. (If, unusually, the forge *cannot*
  fast-forward — `origin/main` is not an ancestor of the pushed branch — say so plainly
  and let the user decide; that is the only remaining MR-closing edge case worth
  surfacing.)
- If the repo isn't a git repo, the branch/worktree can't be found, or there's no `main`/
  default to land onto, stop and report — the skill's assumptions don't hold and guessing
  is dangerous here.
- This skill lands work; it does not review it. If the branch clearly isn't finished
  (failing tests before you even start, obvious WIP), say so and let the user decide
  rather than landing broken code.
