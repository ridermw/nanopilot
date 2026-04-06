# TODOS

## Port critical NanoClaw bug fixes
**Priority:** High
**What:** Review and port applicable bug fixes from NanoClaw upstream PRs.
**Why:** Known bugs likely affect NanoPilot's stability — message loss, deadlocks, security.
**PRs to evaluate:** #1576 (message loss), #1623 (stream deadlock), #1640 (stale cache), telegram#95 (self-message loop), telegram#119 (409 reconnect), whatsapp#83 (Baileys logger), gmail#7 (credential exposure).
**Context:** Each upstream PR needs individual evaluation; some fixes may not apply cleanly to NanoPilot's Copilot SDK architecture or current channel-skill layout.
**Depends on:** Nothing.

## Configure branch protection rules
**Priority:** High
**What:** Enable branch protection on `main`: require status checks (CI, security), require PR reviews, prevent force-push.
**Why:** CI pipeline is useless without enforcement — code can still land on main bypassing all checks. This is the highest risk-reduction-per-effort setting available.
**Depends on:** CI/CD pipeline (ci.yml, security.yml) must be merged first so status checks exist.

## Fix pre-existing test failures
**Priority:** Medium — resolved on testing branch, pending merge to main.
**What:** Fix 3 test files that fail on main: `container-runtime.test.ts`, `routing.test.ts`, `task-scheduler.test.ts`.
**Why:** All fail due to `CREDENTIAL_PROXY_HOST` import from `credential-proxy.ts` throwing when `.env` doesn't have the value. From apple-container skill branch code leaking into imports.
**Depends on:** Nothing.

## Implement agentic workflows
**Priority:** Low
**What:** Add GitHub agentic workflows for issue triage (auto-labeling) and Copilot code review requests using the `gh-aw` CLI extension.
**Why:** Enables autonomous repo management — auto-label issues, request AI code review on PRs. Deferred because `gh-aw` extension availability is uncertain.
**Depends on:** `gh-aw` CLI extension being available for this repo's plan.

## Harden workflow permissions
**Priority:** Medium
**What:** Audit all workflow files and pin third-party actions by full commit SHA instead of version tags. Review and minimize permissions per job.
**Why:** Supply chain security for public repos — version tags can be moved, SHAs cannot. Current workflows use SHA pins; future additions should maintain this standard.
**Depends on:** Nothing.

## Import-guard test
**Priority:** Medium
**What:** Add a test that imports every `src/*.ts` module and verifies none throw when `.env` is missing.
**Why:** Prevents future CREDENTIAL_PROXY_HOST-type leaks where importing a module causes a side-effect crash if environment variables are absent.
**Depends on:** Nothing.

## Scheduled live E2E workflow
**Priority:** Low
**What:** Add a weekly CI workflow that runs `test/e2e/live.test.ts` against a real Copilot session to catch silent rot.
**Why:** Live E2E tests are skipped in normal CI (no token). Without periodic runs, the live test path can break without anyone noticing until someone manually tests.
**Depends on:** Phase 3 dual-mode E2E implementation.
