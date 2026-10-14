# Finalize Feature

```
Objective:
Run a full code review + security pass on the current branch vs `dev`, then open a PR — or stop and catalog blocking issues if any are found.

Starting State:
Run these commands first:
  git status
  git diff
  git diff --staged
  git log developer..HEAD --oneline
  git diff developer...HEAD

Read ALL files in `.claude/rules/` before proceeding.
Read every modified file in full — not just the diff.

Target State:
Either a PR opened against `developer` (never `main`) with a complete description, or a blocking issues report delivered to the user.

---

## STOP CONDITIONS
Pause immediately and report to the user when:
- Any blocking issue or security vulnerability is found — DO NOT open the PR
- Any test command found in `package.json` fails
- Build command found in `package.json` fails or TypeScript type-check reports errors
- `grep -rE "console\.(warn|info|debug|table)" src/ --include="*.ts"` returns results — these are never allowed
- `grep -rn "console\.log" src/ --include="*.ts"` returns results that look like forgotten debug logs (review each one)
- User declines to commit uncommitted changes (wait for manual commit, then re-run)

---

## STEP 1 — Working Tree Check

If `git status` shows uncommitted or staged files, ask the user:

> "Existem alterações não commitadas. Quer que eu agrupe e commite as alterações por contexto e continue com o review?"

**If user confirms** — group all changed files by semantic context and create one conventional commit per group:

  | Prefix      | When to use                                              |
  |-------------|----------------------------------------------------------|
  | `feat:`     | New feature files (use-cases, routes, controllers, components) |
  | `fix:`      | Bug fixes                                                |
  | `chore:`    | Config, renames, reorganization — no behavior change     |
  | `refactor:` | Performance, structure, readability improvements         |
  | `test:`     | Test files only                                          |
  | `docs:`     | Documentation only                                       |

  For each group:
  ```bash
  git add <files in this group>
  git commit -m "feat: implement member password reset"
  ```
  Rules: commit messages must be written in English; single-line message only — no body, no co-author, no footer.

**If user declines** — STOP. Wait for manual commit before proceeding.

Only continue to Step 2 when the working tree is clean and all changes are committed.

---

## STEP 2 — Code Review

Work through every category. Flag real violations only — not style preferences.

### Architecture (Clean Architecture)
Dependencies MUST point inward: Infrastructure → Application → Domain.

BLOCKING violations:
- Domain layer (entities, value objects) imports from `prisma`, `express`, or any infrastructure lib
- Prisma types (`Prisma.XCreateInput`, `PrismaClient`) in entity constructors, use-case signatures, or repository interfaces
- Use Cases import from `express` or access `req`/`res` directly
- Orchestration logic (load → mutate → persist) scattered in controllers or routes instead of use cases
- Domain errors constructed in controllers or routes (must be thrown from entities/use cases)

Layer responsibility reference:

  | What | Belongs In | Never In |
  |------|-----------|---------|
  | `schemaValidation`, `authorizationMiddleware`, dep wiring | Route | UseCase, Entity |
  | Request extraction, `SuccessHandler`, try/catch | Controller | UseCase, Entity |
  | Business rules, invariants | Entity / Value Object | Controller, Route, Repository |
  | Orchestration (load → mutate → persist) | Use Case | Controller, Entity |
  | `runDb()`, Prisma queries | Prisma Repository | UseCase, Entity, Controller |
  | External API calls | Infrastructure Service | Entity, UseCase (only via interface) |

### Domain Model
BLOCKING violations:
- Entity state mutated directly from outside — must go through named domain methods
- `static create()` missing as the sole valid constructor, or it does not enforce invariants
- Value Objects with setters or mutation methods
- Business concepts modelled as raw strings instead of Value Objects (e.g., email, CPF, phone)
- Repository interfaces exposing Prisma types in method signatures
- `findById`/`findOne` returning plain object instead of Entity; `findAll` instantiating Entity unnecessarily

### API Contract
- HTTP verb correct: POST=create, PATCH=partial update, PUT=full replace, DELETE=remove, GET=read
- URL segments are `kebab-case`, represent resources not actions
- Swagger `summary` and `description` in English
- Error messages in plain Portuguese, no technical jargon
- Responses sent via `SuccessHandler.success`, `SuccessHandler.createSuccess`, or `SuccessHandler.accepted` — never raw `res.json`
- New routes registered in the route index

### Audit Log
Every persistent state mutation (create/update/delete) MUST be audited.
- Use `ChangeLogRepository.createChangeLog()` — never a custom logger
- Fields: `action` ('create'/'update'/'delete'), `tableName` (camelCase), `userId`, `recordId: String(id)`, `changes: { item }`
- UPDATE: capture `previous` BEFORE mutation, pass as second arg to `createChangeLog`
- Passwords, hashes, and salts never written to `changes`

### Database
- Migration exists if schema changed
- New list queries have `orderBy` for consistent pagination
- Multi-step writes use `$transaction`
- New query patterns on large tables have an appropriate index

### Performance
- No per-iteration repository queries in loops — use `findMany` with `IN` filter
- New list endpoints have server-side pagination
- `include` scoped to what the endpoint returns — no over-fetching

### Error Handling
- No bare `new Error()` — always a domain error class (`NotFoundError`, `BadRequestError`, etc.)
- Controllers MUST have `try/catch` calling `HttpException.handlerError(res, error, fallback)`
- Repositories return `null` on not-found — never throw
- Errors thrown only in use cases or entity/value object `static create()` methods
- Never `return { error: '...' }` — always `throw`

### Tests — Run this check first
```bash
git diff developer...HEAD --name-only --diff-filter=A | grep "use-case.ts$"
git diff developer...HEAD --name-only --diff-filter=A | grep -E "(entity|validator)\.ts$"
```
BLOCKING: any new use case, entity, or value object without a matching `.spec.ts` file.

Test quality:
- `sut` names the system under test; `beforeEach` recreates all dependencies
- One `describe` per file
- Faker used for all synthetic data — no hardcoded strings
- Tests cover happy path AND main error paths (not-found, forbidden, hierarchy violations)

### Code Style (Biome)
- 2 spaces indentation, single quotes for strings, trailing commas
- No `any` — use `unknown` or a proper type
- `type` over `interface` for shapes; `interface` only for class contracts (repositories, services)
- `const` over `let`; no `var`
- No `I`/`T` prefix on types or interfaces
- No unused variables or imports
- Early return pattern — no nested `if/else` blocks

### Do Not Merge If
- `console.warn`, `console.info`, `console.debug`, or `console.table` present in source
- Hardcoded secrets or credentials
- Commented-out code blocks
- `TODO` comments without a tracking issue
- Raw SQL via string concatenation
- Multi-step Prisma writes outside `$transaction`
- Validation logic duplicated between Zod schema and use case
- `process.env` accessed outside `src/config/` or `src/env.ts`

---

## STEP 3 — Security Review

Check each item. Flag any failure as blocking.

- Authentication: `authToken` middleware active (applied once in `applyRoutes.ts`)
- Authorization: `authorizationMiddleware(action, subject)` applied on every protected endpoint in the Route
- Input validation: all user input validated by `schemaValidation(schema)` in the Route — nowhere else
- Secrets: no hardcoded tokens, passwords, or keys anywhere in the diff
- Injection: no user-controlled input passed to Prisma raw queries or shell commands
- Sensitive data: passwords, hashes, and salts never returned in API responses or written to logs

---

## DECISION GATE

### Blocking issues found → STOP
Do NOT open the PR. Deliver this report and tell the user to fix and re-run `/finalize`:

  ## Issues Found — Action Required

  ### Blocking (must fix before PR)
  | Severity | File | Line | Issue | Suggested Fix |
  |----------|------|------|-------|---------------|

  ### Non-blocking (recommended improvements)
  | Severity | File | Line | Issue | Suggested Fix |
  |----------|------|------|-------|---------------|

### No blocking issues → proceed to Step 4

---

## STEP 3.5 — Deploy Scripts

Follow `.claude/rules/deploy-scripts.md`. If the branch has `scripts/<feature-slug>/*.sql` (anything outside `scripts/integration-tests/`):

1. Build the `## ⚠️ Scripts de deploy — rodar manualmente (administrador)` section: run order table + one `<details>` block per script with the **full** SQL. It goes at the **top** of the PR body, before `[## ⚠️ Scripts de deploy — only if the feature has deploy scripts (STEP 3.5); always the first section]

## Descrição`.
2. Check that no integration test seed points to `scripts/<feature-slug>/` (`INTEGRATION_SEED_FILES`); if one does, copy the needed part to `scripts/integration-tests/` first and rerun `npm run test:integration`.
3. `git rm -r scripts/<feature-slug>` and commit: `chore: move deploy SQL scripts to the PR description`.

## STEP 4 — Open the PR

Pre-flight (all must pass):
1. Read `package.json` to find all available test commands and the build command.
2. Run every test command found (e.g., `npm run test:unit`, `npm run test:integration`).
3. Run the build command — for the API it is `npm run build:dev`, which includes a TypeScript type-check. STOP if any type errors are reported.
4. Check for forbidden console methods and debug leftovers:

```bash
npm test
npm run build:dev     # type-check (tsc) + build — must succeed with zero errors

# BLOCKING — these are never allowed:
grep -rE "console\.(warn|info|debug|table)" src/ --include="*.ts"

# REVIEW — inspect each result and confirm it is intentional, not a forgotten debug log:
grep -rn "console\.log" src/ --include="*.ts"
```

Before opening the PR — check for a Linear task link:
- If a Linear task link was already shared in this conversation, use it.
- Otherwise ask the user: "Existe uma task no Linear para essas alterações? Se sim, envie o link."
- If a link is obtained, add a `## Referencias:` section at the end of the PR body.
- If no link is available, omit that section entirely.

Create the PR — always target `developer`, NEVER `main`:
```bash
gh pr create --base developer --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

PR description (use `git diff developer...HEAD` and `git log developer..HEAD --oneline` — describe at feature level, not file level):

```markdown
## Descrição

[One paragraph: what the feature does and why it was built. Focus on user/product outcome.]

## Alterações realizadas

1. [Meaningful change — what was done and why. Reference component/module, not file path.]
2. ...

## Checklist

- [x] Rodar builds
- [x] Rodar testes
- [x] Sem `console.warn/info/debug/table` no código
- [x] Alterações testadas

## Referencias:

[Task no Linear](https://linear.app/...) ← include only if a link was obtained; omit section otherwise
```

---

Checkpoints:
After each major step, output: ✅ [what was completed]
At the end, output a summary of every file reviewed and the final decision (PR opened or issues found).
```
