# dotmaz

Keith's dotfiles, machine setup, and Claude Code configuration — shell config,
Homebrew bundle, Vim/iTerm/Cursor settings, plus a library of Claude Code
**agents**, **skills**, and **workflows** that are version-controlled here and
symlinked into `~/.claude/`.

## To run

1. Clone this repo locally (must have `git` installed).
2. From the repo root, run the setup script:

   ```sh
   ./setup/setup.zsh
   ```

`setup.zsh` is idempotent — it installs Homebrew + the `Brewfile`, oh-my-zsh,
NVM/node/yarn, git helpers, and the Vim plugin manager; symlinks every dotfile
in `dotfiles/.*` into `~/`; symlinks every agent and skill into `~/.claude/`
(see below); then runs the SSH, MCP, and Cursor sub-setups. Anything already
linked is skipped.

## Layout

| Path          | What it holds |
| ------------- | ------------- |
| `dotfiles/`   | Shell + tool config, symlinked into `~/` (`.zshrc`, etc.). |
| `setup/`      | `setup.zsh` and the SSH / MCP / Cursor sub-setup scripts. |
| `agents/`     | Claude Code subagent personas (one flat `<name>.md` each). |
| `skills/`     | Claude Code skills (one directory each, containing `SKILL.md`). |
| `workflows/`  | Reusable multi-agent workflow scripts. |
| `claude/`     | Global Claude instructions (`CLAUDE.md`), symlinked to `~/.claude/CLAUDE.md`. |
| `utils/`      | Misc helper scripts. |
| `Brewfile`    | Homebrew packages installed by `brew bundle`. |

### Claude Code agents (`agents/`)

Each agent is a single Markdown file named after the agent (`<name>.md`), with
YAML frontmatter (`name`, `description`) and a body that becomes the agent's
system prompt. Identity comes from the `name:` field, not the filename. They are
symlinked into `~/.claude/agents/` so Claude Code discovers them.

The agents are **expert-persona panels** — each channels famous practitioners of
its ecosystem so code is judged and refactored through their lens:

| Agent               | Persona(s) | For |
| ------------------- | ---------- | --- |
| `sandi-metz`        | Sandi Metz + Aaron Patterson (tenderlove) + Nate Berkopec | Ruby/Rails: object design, framework/internals, performance |
| `rob-pike`          | Rob Pike + Dave Cheney | Go: idiom, design, concurrency, error handling |
| `raymond-hettinger` | Raymond Hettinger + Tim Peters + Guido van Rossum | Python: idiomatic style, the Zen, types |

Multi-persona agents reason as each voice, agree where the voices agree, and
**name and resolve the tension** where they'd differ.

### Auditor skills (`skills/*-auditor`)

The `rails-auditor`, `go-auditor`, and `python-auditor` skills share one
**fan-out → consolidate → fix → verify-once** process for auditing and
refactoring an existing codebase for idiom, design, and best-practice
violations:

1. **Scope** the project (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per
   layer/package/concern, each a focused checklist.
3. **Consolidate** findings into a severity-ranked list.
4. **Human gate** only when a finding implies a real design decision.
5. **Fix fan-out** — sub-agents batched by file-ownership so no two edit the
   same file. **Sonnet is the default; Opus is the rare exception**, used only
   for a batch that genuinely exceeds it.
6. **Integrate** the cross-cutting edits on the orchestrator.
7. **Verify ONCE** at the end (build / lint / type / test / security gates);
   sub-agents never run the suite themselves.
8. **Commit** only what changed.

Each auditor dispatches its sub-agents as the matching ecosystem agent
(`rails-auditor` → `sandi-metz`, `go-auditor` → `rob-pike`, `python-auditor` →
`raymond-hettinger`), so the audit and the refactors are done in the persona's
voice. The other `kmaz-*` skills form a separate product-build pipeline
(PRD → architecture → roadmap → plan → build).

## Updating

Edit the file in this repo — the `~/.claude/` symlinks point back here, so
changes take effect on the next Claude Code session (agents and skills are
discovered at session start). New agents/skills are picked up by re-running
`./setup/setup.zsh`, which links anything not already linked.
