# Global instructions (Keith)

These apply to every session, in every project, regardless of which skill or
workflow is active. A project's own `CLAUDE.md` may add to these; where they
genuinely conflict, the project file wins.

## Asking Questions

Whenever I ask a question, just answer it, do not do anything else unless I ask you
do to something else, too. Whenever there is a question, answer it first.

## Git commits

Generally use conventional commits

Never use git add -A or git add .
Always commit only what you changed, ignore other changes, those are from the user or other agents

## Git: branch & worktree isolation

The primary worktree is yours and mine. Its branch is sacred.

- **Interactive / synchronous work with me** — anything where I'm in the loop
  turn-by-turn: the PRD interview, the architecture walkthrough, brainstorming,
  answering questions, and **post-merge cleanup / bugfixing** — happens **on the
  current branch of the primary worktree (normally `main`), and commits there**.
  Do **not** spin up a worktree or a feature branch for this; we are working
  together and the work lands where we are.

- **Any autonomous agent or build process** — a subagent or workflow doing
  multi-step build/implementation work on its own, without me in the loop for
  each step — **ALWAYS works in its own git worktree under
  `.claude/worktrees/<name>/` on its own branch.** It never works in the primary
  worktree.

- **NEVER change the branch of the primary worktree** (`git checkout <branch>`,
  `git switch`, `git checkout -b`, a branch-changing `git reset`, etc.) from an
  agent/build process. To work on a different branch, **create a new worktree**
  for it under `.claude/worktrees/` — `git worktree add` makes the branch there
  without touching the primary checkout. If you think you need to switch the
  primary worktree's branch, you've misread this rule: make a worktree instead.

- The orchestrator/workflow decides **how** work is divided and **when** a
  worktree is spun up and torn down — but the boundary above is not negotiable:
  autonomous build work is isolated in `.claude/worktrees/`, interactive and
  cleanup work stays on the primary branch.

- `.claude/worktrees/` must be **gitignored**. If it isn't, add it (to the
  project's `.gitignore`, or `.git/info/exclude` if you shouldn't touch the
  tracked ignore file) before creating worktrees there, so transient build trees
  never get committed.

- Tear down a worktree + its branch once its work has been collected (merged or
  cherry-picked onto the target). Don't leave orphaned worktrees behind.

The reason: I work on `main` in the primary checkout, live. An agent that
checks out a branch there yanks the rug out from under me — changing files in my
working tree mid-conversation. Worktrees give every autonomous actor its own
isolated checkout so parallel work never disturbs the seat I'm sitting in.
