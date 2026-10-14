# Execute Task — Frontend

You are implementing a task from an approved task list. Your context starts clean.

<critical>Read ONLY the files explicitly listed in the received prompt. Do not explore the repository beyond what is necessary.</critical>
<critical>Invoke the relevant skill BEFORE writing any code for a given layer.</critical>
<critical>Run only the tests of what the task changes; run the full suite only if this is the LAST task of tasks.md</critical>
<critical>Before marking the task complete, update `tasks/prd-[feature-name]/map.md` with what the task built</critical>

## Prerequisites

Before writing any code, read:
- The task file: `./tasks/prd-[feature-name]/[num]_task.md`
- The Tech Spec: `./tasks/prd-[feature-name]/techspec.md`
- Project rules: `.claude/rules/` (all files)
- The feature map: `./tasks/prd-[feature-name]/map.md`

## Step 1 — Output Task Summary

Before writing any code, output:
```
## Task [num]: [task name]
**Approach:** [brief description of what you will implement]
**Files to create/modify:** [list]
**Skills to invoke:** [list the relevant skills: /schema, /action, /hook, /component, /routing, /table-chart]
```

## Step 2 — Read Skills

Invoke the appropriate skills before writing code for each layer:

| What you're creating | Skill to invoke |
|---|---|
| Zod schemas / types | `/schema` |
| Server actions | `/action` |
| React Query hooks | `/hook` |
| UI components / forms | `/component` |
| Sidebar route | `/routing` |
| Table or chart | `/table-chart` |
| Complete new feature | `/create-feature` |

## Step 3 — Implement

Follow the order defined in the Tech Spec. When creating a new feature module, follow this order:
1. Create folder structure
2. Schemas (`_components/schemas/`)
3. Server actions (`_components/actions/`)
4. React Query hooks (`_components/hooks/`)
5. Components (`_components/`)
6. Page (`page.tsx`)
7. Route (`/constants/sidenav-data.tsx`)
8. Tests

## Step 4 — Validate (scoped)

Run **only** what the task touches (`.claude/rules/tests.md` › Execution scope):

```bash
npx vitest run <test files of the task>   # or: npx vitest related --run <changed source files>
npx tsc --noEmit                          # no type errors
npx biome check <changed files>           # lint + formatting of the task's files
```

E2E: only the spec the task touched, and only if the app and the API are already running — never start them yourself.

**If this is the last task of `tasks.md`**, run the full suite instead — any failure means the task is not done:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npx biome check --changed --since=origin/developer
npm run build
```

If any command fails, fix the issue before marking the task complete.

## Step 5 — Update the Feature Map

Update `./tasks/prd-[feature-name]/map.md` following `.claude/rules/feature-map.md`: fill the APP sections this task owns (files, purpose, who calls whom, inputs/outputs with examples, query keys, exact messages), rewrite anything earlier tasks documented that this task changed, update the header date and the commit history. Only real code — no plans.

## Step 6 — Update Task Status

After all validations pass, update `./tasks/prd-[feature-name]/tasks.md`:
- Mark the task as `✅ Completed`
- Add a brief implementation note

## Rules

- Never skip the skill invocation step
- Never use `any` — if you don't know the type, use `unknown` and narrow it
- Never use `try/catch` in server actions — use `result.ok` check
- Never create error messages on the frontend — use the API's `result.message`
- Never call `fetchApi` directly in components — always go through server actions
- Always validate input AND output in every server action
- Always declare `ResponseApi<T>` interface in each action file (do not import it)
- Never install new libraries without explicit permission
