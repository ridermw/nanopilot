# TODOS

## Port critical NanoClaw bug fixes
**Priority:** High
**What:** Review and port applicable bug fixes from NanoClaw upstream PRs.
**Why:** Known bugs likely affect NanoPilot's stability — message loss, deadlocks, security.
**PRs to evaluate:** #1576 (message loss), #1623 (stream deadlock), #1640 (stale cache), telegram#95 (self-message loop), telegram#119 (409 reconnect), whatsapp#83 (Baileys logger), gmail#7 (credential exposure).
**Depends on:** Nothing.

## Fix pre-existing test failures
**Priority:** Medium — resolved on testing branch, pending merge to main.
**What:** Fix 3 test files that fail on main: `container-runtime.test.ts`, `routing.test.ts`, `task-scheduler.test.ts`.
**Why:** All fail due to `CREDENTIAL_PROXY_HOST` import from `credential-proxy.ts` throwing when `.env` doesn't have the value. From apple-container skill branch code leaking into imports.
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
