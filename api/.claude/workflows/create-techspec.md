# TechSpec

<critical>EXPLORE THE PROJECT FIRST BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>DO NOT GENERATE THE TECH SPEC WITHOUT FIRST ASKING CLARIFYING QUESTIONS (USE YOUR ASK USER QUESTIONS TOOL)</critical>
<critical>USE THE CONTEXT 7 MCP FOR TECHNICAL QUESTIONS AND WEB SEARCH (WITH AT LEAST 3 SEARCHES) TO LOOK UP BUSINESS RULES AND GENERAL INFORMATION BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU DEVIATE FROM THE TECHSPEC TEMPLATE STANDARD</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
<critical>CREATE (OR COMPLETE) THE FEATURE MAP `tasks/prd-[feature-name]/map.md` FOLLOWING `.claude/rules/feature-map.md`</critical>
<critical>DATABASE MIGRATIONS ARE RUN MANUALLY BY THE PROJECT ADMINISTRATOR: ONLY DESCRIBE THE PRISMA SCHEMA CHANGES, AS ONE ISOLATED TASK, AND STATE THAT THE ADMINISTRATOR MUST RUN THE MIGRATION BEFORE ANY OTHER TASK. SEEDS / INSERTS / BACKFILLS GO AS SQL FILES IN `scripts/` FOR THE ADMINISTRATOR TO RUN (SEE "Database Migrations")</critical>
<critical>NO LOOSE UTILITY FUNCTIONS IN THE DESIGN: EVERY RULE OR HELPER LIVES IN AN ENTITY METHOD, A VALUE OBJECT (E.G. `domain/vo/Day.ts`) OR A SERVICE CLASS (SEE "Where Domain Logic Lives")</critical>

## Role

You are a technical specification specialist focused on producing clear, implementation-ready Tech Specs based on a complete PRD. Your outputs should be concise, focused on architecture, and follow the provided template.

## Main Goals

1. Translate PRD requirements into **technical guidance and architectural decisions**
2. Perform a deep project analysis before drafting any content
3. Evaluate existing libraries vs. custom development
4. Generate a Tech Spec using the standardized template and save it in the correct location

## File Reference

- Required PRD: `tasks/prd-[feature-name]/prd.md`
- Output document: `tasks/prd-[feature-name]/techspec.md`

## Prerequisites

- Confirm that the PRD exists at `tasks/prd-[feature-name]/prd.md`

## Workflow

### 1. Analyze the PRD (Required)

- Read the full PRD **DO NOT SKIP THIS STEP**
- Identify technical content
- Extract main requirements, constraints, and success metrics

### 2. Deep Project Analysis (Required)

- Discover involved files, modules, interfaces, and integration points
- Map symbols, dependencies, and critical points
- Explore solution strategies, patterns, risks, and alternatives
- Perform a broad analysis: callers/callees, configs, middleware, persistence, concurrency, error handling, tests, infra

### 3. Technical Clarifications (Required)

Ask focused questions about:

- Domain placement
- Data flow
- External dependencies
- Main interfaces
- Test scenarios

### 4. Standards Conformance Mapping (Required)

- Highlight deviations with justification and conformant alternatives

### 5. Generate the Tech Spec (Required)

- Use the template (from the Template section) as the exact structure
- Provide: architecture overview, component design, interfaces, models, endpoints, integration points, impact analysis, testing strategy, observability
- Keep up to ~2,000 words
- **Avoid repeating functional requirements from the PRD**; focus on how to implement
- The techspec is about specification, not about **IMPLEMENTATION DETAILS**; avoid showing too much code

#### Database Migrations

Migrations are created and applied **manually by the project administrator**. When the feature changes the database:

- Describe **only the changes to `prisma/schema.prisma`**: models, columns, enums, indexes, relations. Do not plan for `prisma migrate`, generated SQL, or any task that runs a migration.
- Group all schema changes so they become **one isolated task** that does nothing but change the schema.
- **Data scripts:** seeds, `INSERT INTO`, backfills, permission rows, and any other one-off data change are also run **manually by the administrator**, never by a task or by application code.
  - Each one is a file in the `scripts/` folder at the root of the API repo, named `scripts/<feature-slug>/NN_<description>.sql`, **while the feature is in development**. At finalize they move to the top of the API PR description and are deleted from the branch (`.claude/rules/deploy-scripts.md`). If integration tests need part of a script (e.g. permission rows), the techspec says so: that part is copied to `scripts/integration-tests/`.
  - Each file starts with a header comment saying what it does, why it is needed, when to run it (after the migration, or before release), its dependencies on other scripts, and whether it can be run again safely. Scripts must be idempotent whenever possible.
  - Writing the scripts is its **own isolated task**, separate from the schema task and from code tasks. That task only writes the files and never runs them.
  - The techspec lists every script with what it is for, when to run it, and what breaks if it is skipped.
- In **Development Sequencing**, put the schema task first. List it under **Technical Dependencies** as blocking every other task, with the instruction: the administrator must apply the migration before any other task is executed. List each script with its own run moment.
- Add a clearly marked `⚠️ Migration policy` note with these points to the techspec.

#### Where Domain Logic Lives

The design never introduces loose exported functions (`assertX.ts`, `resolveX.ts`, `xAudit.ts`, `utils.ts` next to the use cases). They scatter the domain and break the project's DDD pattern. Every rule or helper the feature needs has one of three homes, and the techspec names it in **Main Interfaces**:

- **Entity method** — anything about one aggregate's own state or invariants: validation on create/update, state transitions, "who may change this record", the days or records the change affects, its audit snapshot (`toAuditItem()`, `toPersistence()`).
- **Value Object** — a concept with its own rules and no identity: dates and periods go in the existing `domain/vo/Day.ts` / `Month.ts` (new formats, ranges, comparisons become methods there), and new concepts get their own VO in `domain/vo/` (e.g. the acting user's scope, a (store, day) pair with `equals`/`unique`). Collection helpers about that concept are static methods of the VO.
- **Service class** — work that needs repositories or other use cases and is shared by several use cases (checking that referenced records exist, guarding closed periods, triggering recomputes, resolving the acting user from the session). Application services go in `application/services/<Name>Service.ts`, receive their dependencies in the constructor, are wired in the Route, and have their own `.spec.ts`.

Constants that belong to a concept are static members of its entity or VO; audit `tableName` strings stay inline in the use case, like the rest of the codebase.

### 6. Create the Feature Map (Required)

- If `tasks/prd-[feature-name]/map.md` does not exist, create it with the skeleton in `.claude/rules/feature-map.md`: header, menu and every section marked `_Pendente — preenchida pela task N._`, pointing each section to the task that will fill it.
- If it already exists (the other repo's techspec created it), keep it and only mark this repo's sections with the tasks that will fill them.
- Fill now only what the techspec already decides and will not change in code: overview, business rules and glossary, decisions and risks. Everything else is filled by `execute-task`, from real code.

### 7. Save the Tech Spec (Required)

- Save as: `tasks/prd-[feature-name]/techspec.md`
- Confirm write operation and path

## Core Principles

- The Tech Spec **focuses on HOW, not WHAT** (the PRD owns the what/why)
- Prefer simple, evolvable architecture with clear interfaces
- Provide testability and observability considerations early on

## Clarifying Questions Checklist

- **Domain**: appropriate boundaries and module ownership
- **Data Flow**: inputs/outputs, contracts, and transformations
- **Dependencies**: external services/APIs, failure modes, timeouts, idempotency
- **Core Implementation**: central logic, interfaces, and data models
- **Testing**: critical paths, unit/integration/e2e tests, contract tests
- **Reuse vs. Build**: existing libraries/components, license viability, API stability

## Quality Checklist

- [ ] PRD reviewed
- [ ] Deep repository analysis
- [ ] Main technical clarifications answered
- [ ] Tech Spec generated using the template
- [ ] Schema changes isolated in one task, with the "administrator runs the migration first" note (when the database changes)
- [ ] Every rule/helper placed in an Entity method, a Value Object or a Service class — no loose utility functions
- [ ] Checked the rules in `.claude/rules/` and skills in `.claude/skills/`
- [ ] File written at `./tasks/prd-[feature-name]/techspec.md`
- [ ] `map.md` exists with the skeleton and each section points to the task that fills it
- [ ] Final output path provided and confirmation

<critical>EXPLORE THE PROJECT FIRST BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>DO NOT GENERATE THE TECH SPEC WITHOUT FIRST ASKING CLARIFYING QUESTIONS (USE YOUR ASK USER QUESTIONS TOOL)</critical>
<critical>USE THE CONTEXT 7 MCP FOR TECHNICAL QUESTIONS AND WEB SEARCH (WITH AT LEAST 3 SEARCHES) TO LOOK UP BUSINESS RULES AND GENERAL INFORMATION BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU DEVIATE FROM THE TECHSPEC TEMPLATE STANDARD</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>

## Template

```markdown
# Technical Specification

## Executive Summary

[Provide a brief technical overview of the solution approach. Summarize the main architectural decisions and implementation strategy in 1-2 paragraphs.]

## System Architecture

### Component Overview

[Brief description of the main components and their responsibilities:

- Component names and primary functions **Be sure to list each new or modified component**
- Main relationships between components
- Data flow overview]

## Implementation Design

### Main Interfaces

[Define the main service interfaces (≤20 lines per example):

```go
// Example interface definition
type ServiceName interface {
    MethodName(ctx context.Context, input Type) (output Type, error)
}
```
]

### Data Models

[Define essential data structures:

- Main domain entities (if applicable)
- Request/response types
- Database schemas (if applicable)]

### API Endpoints

[List API endpoints if applicable:

- Method and path (e.g., `POST /api/v0/resource`)
- Brief description
- Request/response format references]

## Integration Points

[Include only if the feature requires external integrations:

- External services or APIs
- Authentication requirements
- Error handling approach]

## Testing Approach

> Test execution scope (`.claude/rules/tests.md` › Execution scope): each task runs only the tests of what it changes; the **last task** runs the full suite. Integration tests follow `.claude/rules/integration-tests.md`.

### Unit Tests

[Describe unit testing strategy:

- Main components to test
- Mocking requirements (only for external services)
- Critical test scenarios]

### Integration Tests

[If needed, describe integration tests:

- Components to test together
- Test data requirements]

### E2E Tests

[If needed, describe E2E tests:

- Test the frontend along with the backend **using Playwright**]

## Development Sequencing

### Build Order

[Define implementation sequence:

0. If the database changes: the isolated Prisma schema task (the administrator applies the migration manually before anything else)
1. First component/feature (why first)
2. Second component/feature (dependencies)
3. Subsequent components
4. Integration and testing]

### Technical Dependencies

[List any blocking dependencies:

- Schema migration applied manually by the administrator (blocks every other task, when the database changes)
- Required infrastructure
- External service availability]

## Monitoring and Observability

[Define monitoring approach using existing infrastructure:

- Metrics to expose (Prometheus format)
- Main logs and log levels
- Integration with existing Grafana dashboards]

## Technical Considerations

### Main Decisions

[Document important technical decisions:

- Approach choice and justification
- Trade-offs considered
- Rejected alternatives and why]

### Known Risks

[Identify technical risks:

- Potential challenges
- Mitigation approaches
- Areas needing research]

### Conformance with Rules

[Search `.claude/rules/` for rules that apply to this techspec and list them below — include the filename and the specific rule:]

### Conformance with Skills

[Search `.claude/skills/` for skills that apply to this techspec and list them below — these are the skills that must be invoked during implementation:]

### Relevant and Dependent Files

[List relevant and dependent files here]
```

<critical>EXPLORE THE PROJECT FIRST BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>DO NOT GENERATE THE TECH SPEC WITHOUT FIRST ASKING CLARIFYING QUESTIONS (USE YOUR ASK USER QUESTIONS TOOL)</critical>
<critical>USE THE CONTEXT 7 MCP FOR TECHNICAL QUESTIONS AND WEB SEARCH (WITH AT LEAST 3 SEARCHES) TO LOOK UP BUSINESS RULES AND GENERAL INFORMATION BEFORE ASKING CLARIFYING QUESTIONS</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU DEVIATE FROM THE TECHSPEC TEMPLATE STANDARD</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
<critical>UNDER NO CIRCUMSTANCES SHOULD YOU IMPLEMENT THE CODE; THE GOAL IS TO PRODUCE THE TECHSPEC</critical>
