---
name: finalize
description: "Use when the user wants to finalize a feature branch: run code review, security pass, tests, and open a PR against dev. Triggers on: 'finalize', 'finalizar', 'open PR', 'abrir PR', 'review and PR'."
user-invocable: true
---

Objective:
Run a full code review + security pass on the current branch vs `dev`, then open a PR — or stop and catalog blocking issues if any are found.

Starting State:
Run these commands first:
  git status
  git diff
  git diff --staged
  git log dev..HEAD --oneline
  git diff dev...HEAD

Read ALL files in `docs/ai-rules/` before proceeding.
Read every modified file in full — not just the diff.

Target State:
Either a PR opened against `dev` with a complete description, or a blocking issues report delivered to the user.

---

## STOP CONDITIONS
Pause immediately and report to the user when:
- Any blocking issue or security vulnerability is found — DO NOT open the PR
- Any test command found in `package.json` fails
- Build command found in `package.json` fails or TypeScript type-check reports errors
- `grep -r "console.log" src/ --include="*.ts"` returns results
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

### Architecture (Clean Architecture + DDD)
Dependencies MUST point inward: Infrastructure → Application → Domain.

BLOCKING violations:
- Domain layer (entities, value objects) imports from `prisma`, `fastify`, `ky`, `redis`, or `bullmq`
- Prisma types (`Prisma.XCreateInput`, `PrismaClient`) in entity constructors, use-case signatures, or repository interfaces
- Use Cases import from `fastify` or access `req`/`res`/`reply` directly
- Orchestration logic (load → mutate → persist) scattered in controllers or routes instead of use cases
- Redis keys, cache strategies, or queue names referenced outside their service/worker files
- Domain errors constructed in controllers or routes (must be thrown from entities/use cases)

Layer responsibility reference:

  | What | Belongs In | Never In |
  |------|-----------|---------|
  | HTTP parsing, Zod schema | Route | UseCase, Entity |
  | Request extraction, reply.send | Controller | UseCase, Entity |
  | Business rules, invariants | Entity / Value Object | Controller, Route, Repository |
  | Orchestration (load → mutate → persist) | Use Case | Controller, Entity |
  | Persistence queries | Prisma Repository | UseCase, Entity, Controller |
  | Auth middleware, CASL setup | Route / Middleware | UseCase, Entity |
  | Cache, queue, external API calls | Infrastructure Service | Entity, UseCase (only via interface) |

### Domain Model
BLOCKING violations:
- Entity state mutated directly from outside — must go through named domain methods
- `static create()` missing as the sole valid constructor, or it does not enforce invariants
- Value Objects with setters or mutation methods
- Business concepts modelled as raw strings instead of Value Objects (e.g., email, temporary password)
- Repository interfaces exposing Prisma types in method signatures
- Side effects (emails, queues, notifications) triggered by direct calls inside a Use Case instead of via domain events or `IEventBus`

### API Contract
- HTTP verb correct: POST=create, PATCH=partial update, PUT=full replace, DELETE=remove, GET=read
- URL segments are `kebab-case`, represent resources not actions
- Swagger `summary` and `description` in English
- Error messages in plain Portuguese, no technical jargon
- No response envelope (`{ data: ... }`) — send payload directly
- New routes registered in the route index

### Audit Log
Every persistent state mutation MUST be audited.
- Both `AuditLogRepository` and `OrganizationAuditLogRepository` written via `AuditLogger.saveOrganizationAndSystemAuditLog`
- `entityLabel` is a human-readable identifier (email, name, title) — never an internal ID
- `changes` records only fields that changed with new values; `previous` records old values
- Passwords, hashes, and salts never written to audit fields

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
- No bare `new Error()` — always a domain error class
- No `try/catch` in controllers
- Repositories return `null` on not-found — never throw
- Errors thrown only in use cases or entity/value object `static create()` methods

### Tests — Run this check first
```bash
git diff dev...HEAD --name-only --diff-filter=A | grep "use-case.ts$"
git diff dev...HEAD --name-only --diff-filter=A | grep -E "(entity|validator)\.ts$"
```
BLOCKING: any new use case, entity, or value object without a matching `.spec.ts` file.

Test quality:
- `sut` names the system under test; `beforeEach` recreates all dependencies
- One `describe` per file
- Faker used for all synthetic data — no hardcoded strings
- Tests cover happy path AND main error paths (not-found, forbidden, hierarchy violations)

### Code Style (Biome 2.4.12)
- Tabs for indentation, double quotes for strings
- No `any` — use `unknown` or a proper type
- `type` over `interface`; `const` over `let`; named exports only
- No unused variables or imports
- No single-letter or abbreviated parameter names
- No type assertions (`as X`) — use `instanceof` guards
- No Portuguese identifiers in code — only in user-facing strings
- Early return pattern — no nested `if/else` blocks

### Frontend (apply only if Next.js files changed)
- `"use client"` on components using hooks, state, or browser events
- `"use server"` on server actions, living in `_actions/` files
- `updateTag` called in every mutation server action
- No server-only imports inside `"use client"` components

### Do Not Merge If
- `console.log` present in source
- Hardcoded secrets or credentials
- Commented-out code blocks
- `TODO` comments without a tracking issue
- Raw SQL via string concatenation
- Multi-step Prisma writes outside `$transaction`
- Validation logic duplicated between Zod schema and use case

---

## STEP 3 — Security Review

Check each item. Flag any failure as blocking.

- Authentication: every protected endpoint uses `authOrganization` or `requireAuctioneer` middleware
- Authorization: CASL ability checked before any business logic executes
- Input validation: all user input validated by the route's Zod schema — nowhere else
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

## STEP 4 — Open the PR

Pre-flight (all must pass):
1. Read `package.json` to find all available test commands and the build command.
2. Run every test command found (e.g., `npm run test:unit`).
3. Run the build command — for the app it is `npm run build`, which includes TypeScript type-checking via Next.js. STOP if any type errors are reported.
4. Run `grep -r "console.log" src/ --include="*.ts"` — must return empty.

```bash
# Example — always confirm the exact commands from package.json first
npm run test:unit   # run all test scripts found in package.json
npm run build       # App: Next.js build (includes tsc) — must succeed with zero errors
grep -r "console.log" src/ --include="*.ts"
```

Before opening the PR — check for a Linear task link:
- If a Linear task link was already shared in this conversation, use it.
- Otherwise ask the user: "Existe uma task no Linear para essas alterações? Se sim, envie o link."
- If a link is obtained, add a `## Referencias:` section at the end of the PR body.
- If no link is available, omit that section entirely.

Create the PR — always target `dev`, NEVER `main`:
```bash
gh pr create --base dev --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

PR description (use `git diff dev...HEAD` and `git log dev..HEAD --oneline` — describe at feature level, not file level):

```markdown
## Descrição

[One paragraph: what the feature does and why it was built. Focus on user/product outcome.]

## Alterações realizadas

1. [Meaningful change — what was done and why. Reference component/module, not file path.]
2. ...

## Checklist

- [x] Rodar builds
- [x] Rodar testes
- [x] Não deixar `console.log`
- [x] Alterações testadas

## Referencias:

[Task no Linear](https://linear.app/...) ← include only if a link was obtained; omit section otherwise
```

---

Checkpoints:
After each major step, output: ✅ [what was completed]
At the end, output a summary of every file reviewed and the final decision (PR opened or issues found).
