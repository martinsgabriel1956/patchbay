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
- `grep -rE "console\.(warn|info|debug|table)" src/ --include="*.tsx"` returns results — these are never allowed
- `grep -rn "console\.log" src/ --include="*.tsx"` returns results that look like forgotten debug logs (review each one)
- User declines to commit uncommitted changes (wait for manual commit, then re-run)

---

## STEP 1 — Working Tree Check

If `git status` shows uncommitted or staged files, ask the user:

> "Existem alterações não commitadas. Quer que eu agrupe e commite as alterações por contexto e continue com o review?"

**If user confirms** — group all changed files by semantic context and create one conventional commit per group:

  | Prefix      | When to use                                              |
  |-------------|----------------------------------------------------------|
  | `feat:`     | New feature files (components, pages, actions, hooks)    |
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

### Architecture (Next.js App Router)
Dependencies MUST follow the layered structure: page → _components → actions/hooks/schemas.

BLOCKING violations:
- `fetchApi` called directly in components or hooks (must go through server actions)
- Business logic in page components
- `ResponseApi<T>` imported from another file instead of declared locally in the action file
- Input or output not validated with `safeParse` in server actions
- `try/catch` used in server actions instead of `result.ok` check
- Error messages created on the frontend instead of using `result.message` from the API

Layer responsibility reference:

  | What | Belongs In | Never In |
  |------|-----------|---------|
  | Route definition | `constants/sidenav-data.tsx` | Component |
  | Data fetching/mutation | Server actions (`_components/actions/`) | Components, hooks |
  | React Query wrappers | Hooks (`_components/hooks/`) | Components directly |
  | UI rendering | Components (`_components/`) | Actions |
  | Page composition | `page.tsx` | Actions, hooks |

### Component Standards
BLOCKING violations:
- Raw `<input>`, `<select>`, `<textarea>` instead of built-in form components
- Forms not wrapped with `<Form {...form}>` from shadcn/ui
- `any` type usage anywhere in the diff
- `useEffect` used for data fetching instead of React Query

### API Contract
- Server actions use `fetchApi` from the project's http client
- `ResponseApi<T>` interface declared locally in each action file
- Input validated with `safeParse` before calling `fetchApi`
- Output validated with `safeParse` after receiving response
- Error propagated via `result.message`, not created on frontend

### Tests
BLOCKING: any new component, action, or hook without a matching test file.

Test quality:
- `describe` per file/component
- Tests cover happy path AND main error paths
- No hardcoded IDs or strings — use realistic mock data

### Code Style (Biome)
- No `any` — use `unknown` or a proper type
- `const` over `let`; no `var`
- No unused variables or imports
- Early return pattern — no deeply nested `if/else` blocks

### Do Not Merge If
- `console.warn`, `console.info`, `console.debug`, or `console.table` present in source
- Hardcoded secrets or API keys
- Commented-out code blocks
- `TODO` comments without a tracking issue

---

## STEP 3 — Security Review

Check each item. Flag any failure as blocking.

- Authentication: protected routes wrapped with auth guards
- Input validation: all user input validated by Zod schemas in server actions
- Secrets: no hardcoded tokens, passwords, or keys anywhere in the diff
- Sensitive data: passwords and tokens never returned in API responses or written to logs

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

## STEP 3.5 — Publish the Feature Map

The map (`tasks/prd-[feature-name]/map.md`, `.claude/rules/feature-map.md`) is served to ADMIN/OWNER at `/documentacao/[feature-name]`. Before the PR:

1. Copy `tasks/prd-[feature-name]/map.md` to `docs/features/[feature-name].md` (overwrite). The file name is the URL slug.
2. Commit it: `docs: publish [feature-name] map`. Nothing else to register — the portal reads the folder.

If the map is missing, has no front-matter (`titulo`, `area`, `descricao`, `tags`, `atualizado`) or still has `Pendente` sections, STOP and report it as blocking.

## STEP 4 — Open the PR

Pre-flight (all must pass):
1. Read `package.json` to find all available test commands and the build command.
2. Run every test command found (e.g., `npm test`, `npm run test:e2e`).
3. Run the build command — `npm run build`, which includes a TypeScript type-check. STOP if any type errors are reported.
4. Check for forbidden console methods and debug leftovers:

```bash
npm test
npm run build     # type-check (tsc) + build — must succeed with zero errors

# BLOCKING — these are never allowed:
grep -rE "console\.(warn|info|debug|table)" src/ --include="*.tsx"

# REVIEW — inspect each result and confirm it is intentional, not a forgotten debug log:
grep -rn "console\.log" src/ --include="*.tsx"
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

If the API PR of the same feature has a `## ⚠️ Scripts de deploy` section (see the API's `.claude/rules/deploy-scripts.md`), the app PR says so in a "Dependências de deploy" section, linking to it — e.g. a screen that returns 403 until the permission script runs.

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
