# Test Helpers

## Database Testing Strategy

- **Mock the db** (`vi.mock('./db.js')`) when testing code that _calls_ the database
  (e.g., `index.ts` routing, `ipc.ts` task processing, `task-scheduler.ts` execution).
  This isolates the unit under test from database behavior.

- **Use real in-memory SQLite** (`_initTestDatabase()`) when testing code that
  _integrates_ with the database (e.g., `db.test.ts` itself, or integration tests that
  verify data flow end-to-end).

## Mock Factories

Import shared mocks from `./mocks.ts`:

```typescript
import { mockLogger, mockFs, createMockChannel, createMockContainerProcess } from '../../test/helpers/mocks.js';
```

## Naming Conventions

- `_` prefix exports (e.g., `_setRegisteredGroups`) are test-only APIs exposed by source modules.
- Test files co-locate with source: `src/foo.test.ts` tests `src/foo.ts`.
- E2E tests live in `test/e2e/`, chaos tests in `test/chaos/`.
