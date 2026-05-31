---
name: devops-auditor
description: >-
  Audit a project's infrastructure and platform concerns — IaC, containers/orchestration, CI/CD,
  secrets/config, observability, and reliability — then fix the findings, by fanning out read-only
  Sonnet sub-agents over the project by platform concern (IaC hygiene & secrets, containers &
  orchestration, CI/CD pipelines, observability, reliability & failure modes, cloud security posture),
  consolidating into a list ranked by reliability/security blast radius, then dispatching fix sub-agents
  batched by file-ownership so they never collide. The orchestrator keeps its own context clean
  (delegate, don't read), integrates the shared module/config changes, and runs the validate/lint/plan
  gates ONCE at the end — sub-agents never apply infra. This is the platform/operations lens, distinct
  from the application-code auditors. Use whenever the user wants an infra/DevOps/platform review,
  "audit our Terraform / Dockerfiles / Kubernetes / CI", "are our secrets safe / IAM too broad", "is
  this observable / do we have SLOs", "will this survive prod / graceful shutdown / health checks",
  "review our deploy pipeline", or otherwise improve infrastructure quality, reliability, or operability.
  Triggers even if the user doesn't name this skill, as long as they want an infra/platform audit or the
  hardening that follows. Reviews and proposes fixes for IaC/config — it NEVER applies destructive infra
  changes; those stay behind explicit human approval.
---

# DevOps / Platform Auditor

Audit a project's infrastructure and platform concerns and fix the findings, using a fan-out →
consolidate → fix → verify-once loop. This is a **process** skill and a **cross-cutting** one — it
reviews the platform layer (IaC, containers, orchestration, CI/CD, observability, reliability) of any
project, distinct from the application-code auditors.

> **Run by Kelsey Hightower (with Mitchell Hashimoto and Charity Majors).** Every audit and fix
> sub-agent is dispatched as the `kelsey-hightower` agent so the platform is judged through three minds:
> Hightower's operational pragmatism and orchestration (simplicity, deployability, "you may not need this
> complexity"), Hashimoto's IaC authority (reproducible declarative infra, state, secrets, immutability),
> and Majors's observability/operability (instrumentation, SLOs, debuggability in prod). The orchestrator
> stays neutral — it scopes, coordinates, integrates, and runs the read-only validate/plan gates.
>
> **Safety rule, non-negotiable:** this skill reviews and *proposes* infra changes and runs only
> **read-only / dry-run** commands (`validate`, `lint`, `plan`, `--dry-run`). It NEVER runs `apply`,
> `destroy`, `kubectl apply/delete`, or any command that mutates live infrastructure. Those stay behind
> explicit human approval and are the operator's to run.

## The core loop

1. **Scope & inventory the platform** (cheap, on the orchestrator).
2. **Audit fan-out** — parallel read-only **Sonnet** sub-agents, one per platform concern.
3. **Consolidate** into a list ranked by reliability/security blast radius.
4. **Human gate** before any fix that changes live infra behavior or blast radius.
5. **Fix fan-out** — sub-agents batched by file-ownership; they edit IaC/config, never apply it.
6. **Integrate** the shared module/config changes on the orchestrator.
7. **Verify ONCE** — `validate` / `lint` / `plan` (dry-run only); never `apply`.
8. **Commit** only what you changed (never `git add -A`).

## 1. Scope & inventory the platform (orchestrator, cheap)

Find what platform tech is in play — it decides the checklists and gates:

```bash
# IaC
find . \( -name '*.tf' -o -name '*.tfvars' -o -name '*.bicep' -o -name '*.yaml' -o -name '*.yml' \) \
  | grep -ivE 'node_modules|vendor/' | head -50
ls *.tf cdk.json pulumi.*.yaml main.bicep 2>/dev/null
# containers & orchestration
find . -iname 'Dockerfile*' -o -name 'docker-compose*.y*ml' -o -name 'Chart.yaml' | head
find . -path '*k8s*' -o -path '*manifests*' -name '*.y*ml' | head
# CI/CD
ls .github/workflows/*.y*ml .gitlab-ci.yml .circleci/config.yml Jenkinsfile 2>/dev/null
# observability config: logging/metrics/tracing setup, dashboards, alert rules
git grep -lniE "prometheus|opentelemetry|otel|datadog|honeycomb|sentry|structured.*log" | head
```

Read any `ops/`/`infra/`/`deploy/` README or runbook — the project's stated conventions and topology are
the rubric. Note what's deliberate (a single-node setup for a side project doesn't need multi-AZ HA). A
finding that contradicts a documented, intentional choice is a false positive. **NEVER read real
`.env`/`.tfvars`/secret files for values** — a secret committed to *source/VCS* is the finding; you
don't need its value.

## 2. Audit fan-out (parallel, read-only, Sonnet)

Dispatch sub-agents **in a single message**, all as the `kelsey-hightower` agent (`subagent_type:
kelsey-hightower`, `model: sonnet`), read-only, one per concern:

- **IaC hygiene & secrets** — secrets in code/state/VCS/`tfvars`; local or committed state; no state
  locking; one monolithic state vs. blast-radius segmentation; click-ops / manual steps not in code;
  unpinned providers/modules; copy-paste instead of modules; untagged resources; non-idempotent provisioning.
- **Containers** — fat or root images; `:latest` tags in prod; no multi-stage build; unpinned bases;
  secrets baked into layers; large attack surface; config baked into the image instead of injected.
- **Orchestration (k8s/compose)** — missing resource requests/limits; missing or conflated liveness vs.
  readiness probes; no graceful termination (SIGTERM/`terminationGracePeriod`); no PDB/anti-affinity for
  HA; secrets as plaintext env; over-broad RBAC/service accounts; no network policy; `:latest`.
- **CI/CD** — no rollback path; deploys not health-gated; secrets exposed in CI logs/env; non-reproducible
  builds; unpinned actions/runners; over-privileged deploy credentials; no build/test↔deploy separation;
  slow pipelines from missing caching.
- **Observability** — unstructured logs; no correlation/trace IDs; missing the golden signals
  (latency/error/saturation/traffic); no SLOs; noisy non-actionable alerts; secrets/PII in logs; no way to
  debug a novel incident from telemetry.
- **Reliability & failure modes** — no health checks; no graceful shutdown/draining; missing
  timeouts/retries (with backoff+jitter)/circuit-breakers on dependencies; single points of failure; no
  autoscaling or limits; cascading-failure designs; no defined failure mode/runbook.
- **Cloud security posture** — over-broad IAM (`*`/admin); public buckets; security groups open to
  `0.0.0.0/0`; disabled encryption-at-rest/in-transit; default credentials; over-permissive policies.
  (Deep app-level vuln hunting is the security-auditor's job; flag overlaps for it.)

**Prompt each agent to:** read the relevant files fully; report each finding with **severity
(CRITICAL/HIGH/MEDIUM/LOW)** by reliability/security blast radius, the area, the location, and a
**concrete fix**; lead with the highest blast-radius (plaintext secrets, public exposure, no rollback,
no health checks); **call out what's done well**. Return a structured report grouped by severity. Do NOT
modify files. Do NOT read real secret/tfvars values.

## 3. Consolidate (orchestrator)

Merge into one list ranked by **blast radius**: CRITICAL = a plaintext secret / public data exposure /
no rollback on a prod deploy; down to LOW = hardening/hygiene. **Two-agent overlaps are high-signal.**
The per-agent reports stay in the tool output.

## 4. Human gate (before touching live behavior)

Fix the clearly-safe hygiene in code (pin a version, add a probe, structure a log, move a secret
reference to a manager). **Stop and ask** before any change that alters live infra behavior or blast
radius — tightening an IAM policy that may break a workload, changing networking, modifying a deploy
pipeline, anything you'd `apply`. Present the finding, the proposed diff, and the blast radius.

## 5. Fix fan-out (parallel, batched by FILE-OWNERSHIP) — edit, never apply

> **Batch fixes so that no two parallel agents ever edit the same file.**

- **Run the fix agents as `kelsey-hightower`** (`subagent_type: kelsey-hightower`): move secrets to a
  manager/secret-ref, pin provider/module/image/action versions, add resource limits + liveness/readiness
  probes + graceful shutdown, add timeouts/retries/backoff/circuit-breakers, structure logs and add trace
  IDs, codify click-ops into modules, gate deploys on health and add a rollback path, tighten IAM/RBAC to
  least-privilege.
- **Sub-agents edit IaC/config files only — they NEVER run `apply`/`destroy`/`kubectl apply`/`helm
  upgrade`** or any mutating command, and **do NOT commit.** They produce reviewable diffs.
- **Sonnet is the default; Opus is the rare exception** — `model: sonnet` unless a batch genuinely
  exceeds it (refactoring a monolithic state into segmented modules, redesigning a pipeline). Name *why*;
  if unsure, it's a Sonnet job.
- Freeze module interfaces / output contracts unless the finding is about them; tell each agent what
  others touch at shared boundaries (a shared module, a tokens/vars file); have it report file-by-file and
  flag cross-cutting changes.

## 6. Integrate (orchestrator)

Apply the cross-cutting changes (a shared module, a common variables file, a base image). Resolve
overlap.

## 7. Verify ONCE — dry-run only, NEVER apply

Run **only** read-only / dry-run gates (the project's actual tooling):

```bash
terraform fmt -check && terraform validate && terraform plan        # plan ONLY — never apply
tflint ; checkov -d . ; tfsec .                                     # IaC linters/scanners if present
hadolint Dockerfile                                                 # Dockerfile lint
kubeval / kubeconform <manifests> ; kubectl apply --dry-run=client -f <manifest>   # validate, don't apply
helm lint <chart> ; helm template <chart>                           # render, don't install
actionlint                                                          # CI workflow lint
gitleaks detect --no-banner                                         # confirm no secrets remain in tree
```

A clean `plan`/`validate` is the proof. **Report the `plan` diff to the user for them to apply** — do not
apply it yourself. Watch that a fix didn't introduce a destructive `plan` (a replace/recreate of a stateful
resource) — flag any `plan` showing data loss prominently.

## 8. Commit

Stage **only the files this session touched** (never `git add -A`). Conventional-commit message. **If a
secret was committed, note it must be rotated** (removing it from code doesn't un-leak it). Record gated
findings and any `plan` diff that needs human apply.

---

## Hard-won lessons

- **Never apply on the user's behalf.** This audit *proposes* infra changes and *dry-runs* them. `apply`,
  `destroy`, and live `kubectl`/`helm` mutations belong to the operator with eyes on the `plan`. A wrong
  `apply` can delete a database; a wrong code review cannot.
- **Read the `plan` for data loss.** A change that looks innocuous can force-replace a stateful resource.
  Any `plan` showing a destroy/recreate of something with data is a CRITICAL flag, not a routine diff.
- **Simplicity is reliability.** The most reliable platform is the simplest one that meets the need. "You
  may not need Kubernetes / a mesh / that operator" is a real finding — resist resume-driven complexity.
- **A committed secret must be rotated, not just deleted.** It's in history and on every clone; the fix is
  to revoke/rotate the credential, then move to a manager. Always say so.
- **You can't operate what you can't see.** Missing health checks, structured logs, trace IDs, and SLOs
  are reliability findings, not nice-to-haves — they're the difference between a 5-minute and a 5-hour
  incident.
- **Audits produce false positives — respect intent.** A single-node setup for a hobby project doesn't
  need multi-AZ HA; a public bucket may be a deliberate CDN origin. When a finding fights a documented
  choice, decline it and say so.
- **Keep the orchestrator's context clean.** Delegate the reading; hold the conclusions.

## Scaling the effort

"Glance at the Dockerfile and CI" → one or two concern agents, fix inline. "Full platform audit before
launch" → the full concern fan-out, the IaC/secret scanners, the blast-radius-ranked report, batched
code-only fixes with the human applying the `plan` — all on Sonnet unless a batch truly needs Opus. The
default (a handful of `Agent` calls per phase) is enough for most reviews.
