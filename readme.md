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

The agents are **expert-persona panels** — each channels famous practitioners so
code is judged and refactored through their lens. **Language/ecosystem** panels:

| Agent               | Persona(s) | For |
| ------------------- | ---------- | --- |
| `sandi-metz`        | Sandi Metz + Aaron Patterson (tenderlove) + Nate Berkopec | Ruby/Rails: object design, framework/internals, performance |
| `rob-pike`          | Rob Pike + Dave Cheney | Go: idiom, design, concurrency, error handling |
| `raymond-hettinger` | Raymond Hettinger + Tim Peters + Guido van Rossum | Python: idiomatic style, the Zen, types |
| `matt-pocock`       | Matt Pocock + Anders Hejlsberg + Ryan Cavanaugh | TypeScript (base): type system + general code quality |
| `dan-abramov`       | Dan Abramov + Kent C. Dodds | React (layers on TS base): effects, renders, state, hooks, testing, a11y |
| `ryan-dahl`         | Ryan Dahl + Matteo Collina | Node/backend (layers on TS base): async/errors, event loop, streams, robustness |
| `paul-hudson`       | Paul Hudson + Chris Lattner + John Sundell | Swift/iOS: idiom, value semantics, concurrency safety, SwiftUI/UIKit, architecture |
| `niko-matsakis`     | Niko Matsakis + Jon Gjengset + Steve Klabnik | Rust: ownership, safety, `unsafe`, error handling, idiom |

**Cross-cutting** panels — applicable across codebases and domains:

| Agent               | Persona(s) | For |
| ------------------- | ---------- | --- |
| `troy-hunt`         | Troy Hunt + Tanya Janca + Dafydd Stuttard | Security: OWASP, injection, authz, secrets, crypto (defensive) |
| `paula-scher`       | Paula Scher + Adam Wathan + Steve Schoger + Brad Frost | Frontend design/UX: art direction, hierarchy, spacing, type, color, design systems, WCAG a11y |
| `kelsey-hightower`  | Kelsey Hightower + Mitchell Hashimoto + Charity Majors | DevOps/platform: IaC, containers/orchestration, CI/CD, observability, reliability |
| `benjamin-bloom`    | Benjamin Bloom + John Sweller + Robert Bjork + John Hattie | Curriculum/pedagogy: objectives, mastery, cognitive load, durable learning, effect sizes |

Multi-persona agents reason as each voice, agree where the voices agree, and
**name and resolve the tension** where they'd differ. The TypeScript agents are
**layered**: the `matt-pocock` base panel always covers the type system and
general code quality, and a framework panel (`dan-abramov` for React,
`ryan-dahl` for Node) adds its lens on top when that stack is detected.

### Auditor skills (`skills/*-auditor`)

The auditor skills share one **fan-out → consolidate → fix → verify-once**
process for auditing and refactoring an existing codebase, each dispatching the
matching persona panel. **Language/ecosystem:** `rails-auditor` (`sandi-metz`),
`go-auditor` (`rob-pike`), `python-auditor` (`raymond-hettinger`),
`typescript-auditor` (`matt-pocock` base + `dan-abramov`/`ryan-dahl` layers),
`swift-auditor` (`paul-hudson`), `rust-auditor` (`niko-matsakis`).
**Cross-cutting** (any codebase): `security-auditor` (`troy-hunt`),
`design-auditor` (`paula-scher`), `devops-auditor` (`kelsey-hightower`).
**Pedagogy** (educational products): `curriculum-auditor` (`benjamin-bloom`) —
audits the *learning design* (objectives, mastery, cognitive load, durable
learning), not the code; it interviews adaptively up front, gates the
pedagogical-judgment calls, and applies content/config/sequencing fixes (its
"verify" is curriculum coherence + educator review, not a test suite). The
shared loop:

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

Both the audit and the refactors are done in the persona's voice. Sonnet is the
default for every sub-agent; Opus is the rare, named exception for a batch that
genuinely needs it. The cross-cutting auditors run only read-only/dry-run gates
where they touch sensitive ground — `security-auditor` never weakens a scanner
to go green, and `devops-auditor` never applies infra (no `apply`/`destroy`),
leaving those behind explicit human approval. The other `kmaz-*` skills form a
separate product-build pipeline (PRD → architecture → roadmap → plan → build).

## Updating

Edit the file in this repo — the `~/.claude/` symlinks point back here, so
changes take effect on the next Claude Code session (agents and skills are
discovered at session start). New agents/skills are picked up by re-running
`./setup/setup.zsh`, which links anything not already linked.
