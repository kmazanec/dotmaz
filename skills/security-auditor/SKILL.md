---
name: security-auditor
description: >-
  Audit any codebase, in any language, for security vulnerabilities — then fix them — by tracing
  untrusted input from source to sink and fanning out read-only Sonnet sub-agents over the project by
  vulnerability class (injection, access control, auth/sessions, secrets/crypto, web/XSS-CSRF-SSRF,
  data handling/deserialization, dependencies/config), consolidating into a list ranked by
  exploitability × impact, then dispatching fix sub-agents batched by file-ownership so they never
  collide. The orchestrator keeps its own context clean (delegate, don't read), integrates the
  class-level fixes, and runs the build/test/secret-scan gates ONCE at the end — sub-agents never run
  the suite. This is a cross-cutting, language-agnostic DEFENSIVE security review that complements (and
  goes deeper than) the lighter security pass each language auditor does. Use whenever the user wants a
  security review/audit/pentest-style pass, "find vulnerabilities", "are we injectable / is our authz
  broken / any secrets in the repo / SSRF / XSS / insecure deserialization", "OWASP audit", "harden
  this before launch", or otherwise improve a codebase's security posture. Triggers even if the user
  doesn't name this skill, as long as they want a security audit or the hardening that follows. For
  authorized defensive review of your own code — not for producing exploits to use against systems you
  don't own.
---

# Security Auditor

Audit an existing codebase for security vulnerabilities and fix them, using a trace → fan-out →
consolidate → fix → verify-once loop. This is a **process** skill and a **cross-cutting, language-
agnostic** one — it works on any stack and complements the language auditors' lighter security pass by
going deep on security specifically. It is **defensive**: find and fix vulnerabilities in code you're
authorized to audit; report findings to remediate them, not to weaponize them.

> **Run by Troy Hunt (with Tanya Janca and Dafydd Stuttard).** Every audit and fix sub-agent is
> dispatched as the `troy-hunt` agent so the code is judged through three security minds: Hunt's
> breach reality (what gets exploited and what it costs), Janca's secure-coding / OWASP rubric (fix the
> class at the source), and Stuttard's attacker's eye (how an adversary actually breaks it). The
> orchestrator stays neutral — it scopes, coordinates, integrates, and runs the gates.

## The core loop

1. **Scope & map attack surface** (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per vulnerability class, tracing
   input from source to sink.
3. **Consolidate** into one list ranked by **exploitability × impact** (CRITICAL→LOW), OWASP-tagged.
4. **Human gate** before fixes that change behavior (tightening authz, rotating live secrets, touching
   auth flows) — and always for anything that would alter production access.
5. **Fix fan-out** — sub-agents batched by file-ownership, fixing the **class, not the instance**.
6. **Integrate** the cross-cutting fixes on the orchestrator.
7. **Verify ONCE** at the end (build / test / secret-scan / dependency-CVE scan); sub-agents never run
   the suite.
8. **Commit** only what you changed (never `git add -A`).

The orchestrator's job is to **delegate and integrate**, keeping its own context clean.

## 1. Scope & map attack surface (orchestrator, cheap)

Find the trust boundaries — where untrusted input enters and where dangerous operations happen:

```bash
# entry points (sources): routes/controllers/handlers, request parsing, file uploads, message consumers
# dangerous sinks: DB queries, shell/exec, file paths, template render, deserializers, outbound HTTP, redirects
git grep -nE "exec|system|eval|popen|child_process|`" -- . | head        # command-exec sinks
git grep -ninE "password|secret|api[_-]?key|token|private[_-]?key|BEGIN .*PRIVATE" -- . | head  # secret smells
git grep -nE "SELECT .*\\+|query\\(|raw\\(|\\$\\{.*\\}|format!.*SELECT" -- . | head             # query building
# dependency manifests for a CVE pass:
ls package.json Gemfile.lock requirements.txt go.mod Cargo.lock Package.resolved 2>/dev/null
```

Identify the stack and its security idioms (the ORM's safe-query API, the framework's CSRF/authz
mechanisms, where secrets are supposed to live). Read any `SECURITY.md`/`README`/threat model. Note
what's **intentionally public** (a marketing page, a health endpoint) so you don't flag it. **NEVER
read real `.env`/secret files** to "verify" a finding — the presence of a secret in *source/VCS* is the
finding; you don't need its value.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch sub-agents **in a single message**, all as the `troy-hunt` agent (`subagent_type: troy-hunt`,
`model: sonnet`), read-only (tell them not to modify files), one per vulnerability class. Each traces
tainted input from **source** to **sink**:

- **Injection** — string-built SQL/NoSQL, OS-command/`exec`/`eval`/backticks with tainted input, raw
  ORM fragments, template injection (SSTI), XXE, LDAP, header/CRLF.
- **Broken access control** — IDOR (object refs not scoped to the caller), missing/inconsistent
  function-level authz, privilege escalation, mass-assignment / over-posting, trusting client-supplied
  role/owner/price/id, admin paths reachable without a check.
- **Auth & sessions** — weak/fast password hashing (vs bcrypt/argon2), no rate-limiting/lockout,
  predictable/non-expiring/non-rotating tokens, JWT not verified or `alg:none`, session fixation,
  recovery-flow leaks/bypass.
- **Secrets & crypto** — hardcoded secrets (and in git history), secrets in logs/errors/client bundles,
  hand-rolled or weak crypto, non-CSPRNG tokens, ECB/static-IV, missing TLS / verification disabled.
- **Web** — XSS (reflected/stored/DOM), CSRF on state-changing endpoints, SSRF (esp. to cloud metadata),
  open redirect, CORS misconfig, missing/incorrect security headers, insecure cookies.
- **Data handling** — insecure deserialization, path traversal / ZIP-slip, unrestricted file upload,
  over-broad data exposure in responses/serializers, PII logged.
- **Dependencies & config** — known-vulnerable packages (flag for a CVE scan), debug/verbose errors in
  prod, default creds, permissive config, leaked stack traces, directory listing.

**Prompt each agent to:** read the relevant files fully; report each finding with **severity
(CRITICAL/HIGH/MEDIUM/LOW)** by exploitability × impact, the **OWASP category**, `file:line`, a concise
**exploit sketch** (how an attacker triggers it), and the **class-level fix**; lead with the most
exploitable; separate confirmed from speculative; **call out what's done well** (defenses in place).
Return a structured report grouped by severity. Do NOT modify files. Do NOT read real secret files.

## 3. Consolidate (orchestrator)

Merge into one list ranked by **exploitability × impact**. CRITICAL = RCE / auth bypass / mass data
exposure; down to LOW = defense-in-depth. **Findings two agents reached independently are high-signal.**
Note where bugs **chain** (an info leak that enables an IDOR that enables takeover) — a chain is more
severe than its parts. Present the ranked list; the per-agent reports stay in the tool output.

## 4. Human gate (before behavior-changing fixes)

Just fix the clearly-safe class-level hardening (parameterize queries, encode output, move a secret to a
manager). **Stop and ask** before fixes that change behavior or access: tightening authz that may break
a client, rotating a live secret, altering an auth/login flow, or anything touching production access or
data. Present the finding, the fix, and the blast radius. One good gate beats a broken login.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP) — fix the CLASS

> **Batch fixes so that no two parallel agents ever edit the same file.**

- **Run the fix agents as `troy-hunt`** (`subagent_type: troy-hunt`) and **fix the class, not the
  instance** — parameterize *all* the queries (not the one), centralize the authz check, validate at the
  boundary with an allowlist, move *all* secrets to the manager, swap hand-rolled crypto for a vetted
  primitive, encode output by default.
- **Sonnet is the default; Opus is the rare exception** — `model: sonnet` unless a batch genuinely
  exceeds it (re-architecting an authz model across many endpoints, an auth-flow redesign). Name *why*;
  if unsure, it's a Sonnet job.
- **Sub-agents do NOT run build/test/scanners** and **do NOT commit.** They edit and report.
- **Never suppress a scanner / add an ignore to silence a finding** — the fix removes the vulnerability.
- **Don't widen behavior beyond closing the hole.** Tell each agent the public API is frozen unless the
  finding is about it; tell it what other agents touch at shared boundaries; have it report file-by-file
  and flag cross-cutting one-liners for you.

## 6. Integrate (orchestrator)

Apply the cross-cutting fixes (a shared sanitizer, a central authz helper, a secrets-loading change).
Resolve overlap. Quick compile/syntax check of touched files before the gates.

## 7. Verify ONCE

Run the project's build + tests, plus security-specific gates:

```bash
# the project's own build + test command (read its README/CI), then:
gitleaks detect --no-banner   # or trufflehog — confirm no secrets remain in tree/history
# dependency CVEs (pick what matches the stack):
npm audit --omit=dev | tail   # / bundler-audit / pip-audit / govulncheck ./... / cargo audit
# language SAST if present: semgrep --config auto, brakeman (Rails), gosec, bandit (Python)
```

**Expect that fixes surface real bugs, not break behavior** — a parameterized query or a real authz
check may reveal a test that depended on the insecure shortcut. That's the audit working; fix the test/
caller, don't reopen the hole. A narrowed input filter that breaks a client is a product decision (gate
it). Re-run the secret/CVE scan to confirm CRITICAL/HIGH are actually gone.

## 8. Commit

Stage **only the files this session touched** (never `git add -A`). Conventional-commit message;
describe fixes by class and OWASP category. **If a secret was committed, note that it must be rotated**
(removing it from code does not un-leak it — it's in history and must be revoked/rotated out of band);
flag that to the user explicitly. Record any declined/ gated findings.

---

## Hard-won lessons

- **Trace, don't pattern-match.** A real finding is tainted input reaching a dangerous sink with no
  validation in between — follow the data. A `query(...)` call with only constant input is not a SQL
  injection; an `exec` of a fixed string is not a command injection. Confirm the source is
  attacker-controlled and the path is reachable before you rank it CRITICAL.
- **Audits produce false positives — verify against the actual code.** "Missing CSRF" on a GET, a
  "hardcoded secret" that's a test fixture or public key, an "open redirect" to a fixed allowlist —
  decline these and say why. A finding that contradicts how the code is actually used is a signal, not a
  task.
- **Removing a secret from code does not un-leak it.** Once committed, it's in history and on every
  clone — the fix is *rotate the credential*, then remove it and load from a manager. Always say so.
- **Fix the class or it comes back.** One escaped query among ten string-built ones is not a fix.
  Parameterize all of them; centralize the check; validate at the boundary.
- **The fix removes the vulnerability — never the finding.** Suppressing a scanner, adding an
  `# nosec`/`// lgtm` to go green, or catching-and-ignoring the security exception is the anti-fix.
- **Defensive intent.** This audit exists to harden code you own. Findings and exploit sketches are for
  remediation; don't turn them into tooling against third parties.

## Scaling the effort

"Quick check for obvious holes" → a couple of class agents on the entry points, fix inline. "Full
security audit before launch" → the full vulnerability-class fan-out, the dependency/secret scans, the
ranked report, batched class-level fixes — all on Sonnet unless a batch truly needs Opus. When the user
opts into heavy multi-agent orchestration, the read-only source→sink fan-out and the ownership-batched
fix fan-out are exactly the shape a workflow encodes — but a handful of `Agent` calls per phase is
enough for most reviews.
