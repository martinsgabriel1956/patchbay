# Tasks

<critical>**BEFORE GENERATING ANY FILE, SHOW ME THE LIST OF HIGH-LEVEL TASKS FOR APPROVAL**</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>EACH TASK MUST BE A WELL-DEFINED DELIVERABLE</critical>
<critical>IT IS ESSENTIAL THAT FOR EACH TASK THERE IS A SET OF TESTS THAT GUARANTEES ITS FUNCTIONING AND BUSINESS GOAL</critical>
<critical>EVERY TASK HAS A SUBTASK TO UPDATE `tasks/prd-[feature-name]/map.md` (`.claude/rules/feature-map.md`), NAMING THE SECTIONS IT FILLS</critical>
<critical>TASKS RUN ONLY THE TESTS OF WHAT THEY CHANGE; THE LAST TASK OF THE LIST RUNS THE FULL SUITE (`.claude/rules/tests.md` › Execution scope)</critical>

## Role

You are an assistant specialized in software development project management. Your task is to create a detailed list of tasks based on a PRD and a Tech Spec for a specific feature.

## Prerequisites

The feature you will work on is identified by this slug:

- Required PRD: `tasks/prd-[feature-name]/prd.md`
- Required Tech Spec: `tasks/prd-[feature-name]/techspec.md`

## Process Steps

1. **Analyze PRD and Tech Spec**

- Extract requirements and technical decisions
- Identify main components

2. **Generate Task Structure**

- Organize sequencing
- **Each task must be a well-defined deliverable**
- **All tasks must have their own set of unit and integration tests**

3. **Generate Individual Task Files**

- Create a file for each main task
- Detail subtasks and success criteria
- Detail unit and integration tests

## Task Creation Guidelines

- Group tasks by logical deliverable
- Order tasks logically, with dependencies before dependents (e.g., backend before frontend, backend and frontend before E2E tests)
- Every task ends with a subtask `Atualizar map.md — seções [n, m]` (see `.claude/rules/feature-map.md`)
- The **last task** (highest number) also has a subtask to run the full test suite and build (`.claude/rules/tests.md` › Execution scope); earlier tasks list only the tests of the files they touch
- Make each main task independently completable
- Define clear scope and deliverables for each task
- Include tests as subtasks within each main task
- **DO NOT REPEAT IMPLEMENTATION DETAILS** that are already in the techspec, just reference them

## Output Specifications

### File Locations

- Feature folder: `./tasks/prd-[feature-name]/`
- Task list: `./tasks/prd-[feature-name]/tasks.md`
- Individual tasks: `./tasks/prd-[feature-name]/[num]_task.md`
- Template for the task list: **in the Task List Templates section**
- Template for each individual task: **in the Specific Task Templates section**

## Final Guidelines

- Assume the primary reader is a developer
- Avoid creating more than 10 tasks (group as previously defined)
- Use the X.0 format for main tasks, X.Y for subtasks

After completing the analysis and generating all necessary files, present the results to the user and wait for confirmation to proceed with the implementation.

## Template for Tasks

```markdown
# [Feature] Implementation Task Summary

## Tasks

- [ ] 1.0 Task Title
- [ ] 2.0 Task Title
- [ ] 3.0 Task Title
```

## Template for Each Task

```markdown
# Task X.0: [Task Title]

## Overview

[Brief description of the task]

<skills>
### Conformance with Skills

[Search `.claude/skills/` for skills that apply to this task and list them — these must be invoked during implementation. Always include `/tdd` and `/testing-anti-patterns` when the task involves writing code.]
</skills>

<rules>
### Conformance with Rules

[Search `.claude/rules/` for rules that apply to this task and list them — include filename and specific rule.]
</rules>

<requirements>
[List of mandatory requirements]
</requirements>

## Subtasks

> Follow TDD order: write failing tests first, then implement to make them pass.

- [ ] X.1 Write failing tests for [behavior] (`/tdd` + `/testing-anti-patterns`)
- [ ] X.2 Implement [component] to pass tests
- [ ] X.3 [Additional subtask]
- [ ] X.N Atualizar `map.md` — seções [n, m] (`.claude/rules/feature-map.md`)
- [ ] X.N+1 _(last task only)_ Full suite: `npm run test:run`, `npm run test:integration`, `npm run build:dev`, `npm run lint`

## Implementation Details

[Relevant sections from the technical spec **NO NEED TO SHOW THE FULL IMPLEMENTATION, JUST REFERENCE techspec.md**]

## Success Criteria

- [Measurable outcomes]
- [Quality requirements]

## Task Tests

> Tests are written **before** implementation (TDD). Use `/tdd` skill to drive the red-green-refactor loop and `/testing-anti-patterns` to avoid common mistakes.

- [ ] Unit tests (UseCase, Entity, Value Object — with InMemory repositories)
- [ ] Integration tests (HTTP + ephemeral Postgres, `.claude/rules/integration-tests.md`, if applicable)
- [ ] E2E tests (if applicable)

> Run only these tests while implementing (`npx vitest run --project unit <files>`); the full suite runs only in the last task.

## Relevant Files

- [Files relevant to this task]
```

<critical>**BEFORE GENERATING ANY FILE, SHOW ME THE LIST OF HIGH-LEVEL TASKS FOR APPROVAL**</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>DO NOT IMPLEMENT ANYTHING</critical>
<critical>EACH TASK MUST BE A WELL-DEFINED DELIVERABLE</critical>
<critical>IT IS ESSENTIAL THAT FOR EACH TASK THERE IS A SET OF TESTS THAT GUARANTEES ITS FUNCTIONING AND BUSINESS GOAL</critical>
