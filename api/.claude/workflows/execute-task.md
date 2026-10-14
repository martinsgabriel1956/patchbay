You are an AI assistant responsible for implementing tasks correctly. You must identify the next available task, perform the necessary setup, and prepare to start the work **AND IMPLEMENT IT**.

<critical>Identify and load the skills needed for the task. Always invoke `/tdd` and `/testing-anti-patterns` before writing any code. Invoke `/no-workarounds` when fixing bugs or handling edge cases.</critical>
<critical>**YOU MUST** start the implementation right after the process above.</critical>
<critical>Use the Context7 MCP to analyze the documentation of the language, frameworks, and libraries involved in the implementation</critical>
<critical>After completing the task, mark it as complete in tasks.md</critical>
<critical>Run only the tests of what the task changes; run the full suite only if this is the LAST task of tasks.md (`.claude/rules/tests.md` › Execution scope)</critical>
<critical>Before marking the task complete, update `tasks/prd-[feature-name]/map.md` with what the task built (`.claude/rules/feature-map.md`)</critical>

## Provided Information

## File Locations

- PRD: `./tasks/prd-[feature-name]/prd.md`
- Tech Spec: `./tasks/prd-[feature-name]/techspec.md`
- Tasks: `./tasks/prd-[feature-name]/tasks.md`
- Feature map: `./tasks/prd-[feature-name]/map.md`
- Project Rules: `.claude/rules`
- Project Skills: `.claude/skills`

## Steps to Execute

### 1. Pre-Task Setup

- Read the task definition
- Review the PRD context
- Check the tech spec requirements
- Understand dependencies on previous tasks

### 2. Task Analysis

Analyze considering:

- Main objectives of the task
- How the task fits into the project context
- Alignment with the project's rules and standards
- Possible solutions or approaches

### 3. Task Summary

```
Task ID: [ID or number]
Task Name: [Name or short description]
PRD Context: [Main points from the PRD]
Tech Spec Requirements: [Main technical requirements]
Dependencies: [List of dependencies]
Main Objectives: [Primary goals]
Risks/Challenges: [Identified risks or challenges]
```

### 4. Approach Plan

```
1. [First step]
2. [Second step]
3. [Additional steps as needed]
```

### 5. Run the Task's Tests

While implementing (TDD) and before marking the task complete, run **only** what the task touches:

```bash
npx vitest run --project unit <spec files of the task>        # or: npx vitest related --run --project unit <changed source files>
npx vitest run --project integration <integration spec file>  # only if the task created/changed one (Docker required)
npx tsc --noEmit
npx biome check <changed files>
```

**If this is the last task of `tasks.md`**, run the full suite instead — any failure means the task is not done:

```bash
npm run test:run
npm run test:integration
npm run build:dev
npm run lint
npx biome check --changed --since=origin/developer src
```

### 6. Update the Feature Map

Update `./tasks/prd-[feature-name]/map.md` following `.claude/rules/feature-map.md`: fill the sections this task owns (files, purpose, who calls whom, inputs/outputs with examples, exact errors), rewrite anything earlier tasks documented that this task changed, update the header date and the commit history. Only real code — no plans.

<critical>DO NOT SKIP ANY STEP</critical>

## Important Notes

- Always check the PRD, tech spec, and task file
- Implement proper solutions **without using workarounds**
- Follow all established project standards
- After marking the task complete, optionally invoke the `task-reviewer` agent (`.claude/workflows/task-reviewer.md`) for an incremental review before the next task begins

<critical>Identify and load the skills needed for the task. Always invoke `/tdd` and `/testing-anti-patterns` before writing any code. Invoke `/no-workarounds` when fixing bugs or handling edge cases.</critical>
<critical>**YOU MUST** start the implementation right after the process above.</critical>
<critical>Use the Context7 MCP to analyze the documentation of the language, frameworks, and libraries involved in the implementation</critical>
<critical>After completing the task, mark it as complete in tasks.md</critical>
