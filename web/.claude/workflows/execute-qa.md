# Execute QA — Frontend

You are validating a feature implementation against its PRD, TechSpec, and Tasks.

<critical>Read ONLY the files explicitly listed in the received prompt.</critical>
<critical>A single failing test = QA REJECTED. No exceptions.</critical>

## Prerequisites

Read:
- PRD: `./tasks/prd-[feature-name]/prd.md`
- TechSpec: `./tasks/prd-[feature-name]/techspec.md`
- Tasks: `./tasks/prd-[feature-name]/tasks.md`
- Rules: `.claude/rules/`

## Step 1 — Verify PRD Requirements

List each functional requirement from the PRD. For each one, confirm it is implemented and testable.

## Step 2 — Run Unit Tests (Vitest)

```bash
npm test
```

- All tests must pass
- If any fail: STOP — report failures and mark QA as REJECTED

## Step 3 — TypeScript Check

```bash
npx tsc --noEmit
```

- Must report 0 errors

## Step 4 — Lint Check

```bash
npm run lint
npx biome check --changed --since=origin/developer
```

- Must report 0 errors (warnings acceptable)

## Step 5 — Build Check

```bash
npm run build
```

- Must succeed

## Step 6 — E2E Tests (Playwright)

Playwright tests are in `/tests/`. Run:

```bash
npm run test:e2e
```

- Confirm the app is running on localhost before this step
- If not running, report as a blocker — do not start it without the user's direction
- All E2E tests must pass

## Step 7 — Rule Compliance Check

For each modified file, verify:

- [ ] Server actions use `fetchApi` (not direct fetch) and are in `_components/actions/`
- [ ] `ResponseApi<T>` declared in each action file
- [ ] Input AND output validated with `safeParse` in every action
- [ ] Hooks use `useQuery`/`useMutation` and call actions (not `fetchApi` directly)
- [ ] Components use built-in form components (not raw inputs)
- [ ] Forms wrapped with `<Form {...form}>` from shadcn/ui
- [ ] No `any` type usage
- [ ] No `try/catch` in server actions
- [ ] Error messages displayed from `result.message` (not created on frontend)
- [ ] Route added to `constants/sidenav-data.tsx`
- [ ] Test files exist alongside components

## Step 8 — Generate QA Report

Save report at `./tasks/prd-[feature-name]/qa-report.md`:

```markdown
# QA Report — [Feature Name]

## Outcome: APPROVED | REJECTED

## PRD Requirements
| Requirement | Status | Evidence |
|---|---|---|
| [req] | PASS/FAIL | [evidence] |

## Test Results
- Unit tests (Vitest): X passing, Y failing
- TypeScript: 0 errors
- Lint: 0 errors / X warnings
- Build: SUCCESS/FAIL
- E2E (Playwright): X passing, Y failing

## Rule Compliance
| Rule | Status | Notes |
|---|---|---|

## Bugs Found
[If any — save separately in bugs.md]

## Conclusion
[Summary]
```

If any bugs found, save to `./tasks/prd-[feature-name]/bugs.md` with severity (High/Medium/Low) and description.

## Approval Criteria

**APPROVED**: All tests pass, TypeScript clean, build succeeds, all PRD requirements met, rule compliance verified.

**REJECTED**: Any failing test, TypeScript error, build failure, missing PRD requirement, or critical rule violation.
