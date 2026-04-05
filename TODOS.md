# TODOS

## Port critical NanoClaw bug fixes
**Priority:** High
**What:** Review and port applicable bug fixes from NanoClaw upstream PRs.
**Why:** Known bugs likely affect NanoPilot's stability — message loss, deadlocks, security.
**PRs to evaluate:** #1576 (message loss), #1623 (stream deadlock), #1640 (stale cache), telegram#95 (self-message loop), telegram#119 (409 reconnect), whatsapp#83 (Baileys logger), gmail#7 (credential exposure).
**Depends on:** Nothing.

## Fix pre-existing test failures
**Priority:** Medium
**What:** Fix 3 test files that fail on main: `container-runtime.test.ts`, `routing.test.ts`, `task-scheduler.test.ts`.
**Why:** All fail due to `CREDENTIAL_PROXY_HOST` import from `credential-proxy.ts` throwing when `.env` doesn't have the value. From apple-container skill branch code leaking into imports.
**Depends on:** Nothing.
