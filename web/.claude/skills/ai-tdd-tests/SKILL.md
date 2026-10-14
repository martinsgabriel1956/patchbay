---
name: ai-tdd-tests
description: AI-driven test-first development for creating or changing tests and implementation with a Plan, Red, Green, Refactor, Validate loop. Use when the user asks for TDD with AI, TDAID, AI-TDD, test-first implementation, "criar testes", "skill de testes", generating failing tests before code, hardening an AI coding workflow against test cheating, or using separate tester/developer agent roles.
---

# AI TDD Tests

## Overview

Use this skill to make tests the objective contract for an AI coding loop. The workflow treats the AI as an execution engine constrained by explicit tests, not as the authority on when work is done.

This skill complements general TDD guidance with AI-specific controls: loud tests, small batches, immutable test intent, local verification, and human validation.

## Workflow

### 1. Plan

Before touching production code:

- Identify the public behavior to protect.
- Write a short implementation roadmap with explicit Red, Green, Refactor, and Validate milestones.
- Prefer one or two target behaviors for the first batch. Avoid large test files with many scenarios in one pass.
- Decide which existing test runner, fixture style, and project helpers the repository already uses.

### 2. Red

Create failing tests before production implementation.

- Write tests through public interfaces and observable behavior.
- Keep each test self-contained. Avoid hidden setup in deep `beforeEach` chains unless the repository already has a clear local convention.
- Use explicit inputs and explicit expected outputs.
- Give test names and assertion messages enough semantic detail that a failing test explains the broken business rule.
- Include edge cases that expose likely AI shortcuts, such as invalid states, precision issues, permission boundaries, or regression cases.
- Run the test command and confirm the new test fails for the expected reason.

### 3. Green

Implement only the minimum production change needed to pass the current failing test batch.

- Do not edit, weaken, skip, or delete the tests to reach green.
- Do not hardcode exact test inputs unless the behavior itself requires those literals.
- Do not add speculative features, broad rewrites, or abstractions that are not required by the current tests.
- Run the local test command and static checks that the project normally uses for the touched area.

### 4. Refactor

Refactor only after tests are green.

- Preserve public signatures and behavior unless the plan explicitly calls for a contract change.
- Extract duplication and clarify naming where the tests revealed stable concepts.
- Keep each refactor small and rerun tests after meaningful changes.
- If refactoring creates new behavior questions, return to Red with a new focused test.

### 5. Validate

Tests are necessary but not sufficient.

- Review the diff for test cheating: deleted assertions, skipped tests, loosened matchers, hardcoded inputs, or bypassed test runner failures.
- Check that the tests still express business intent rather than implementation shape.
- Confirm the implementation fits the existing architecture and naming.
- Report commands run and any remaining gaps.

## AI Role Split

When task size or risk justifies it, separate the work into two mental roles:

- Tester role: produce the failing tests from requirements only. Do not write production code.
- Developer role: receive the failing tests and implement the minimum code to pass them. Do not change test intent.

In a single-agent environment, simulate the split by completing and verifying the Red phase before editing production files.

## Guardrails

- Prefer small batches: one or two failing assertions at a time.
- If the implementation becomes bloated or confused, stop, inspect the diff, and restart the phase from the last clean state instead of layering prompts on top of bad code.
- Never claim success from reasoning alone. The test runner decides whether the loop is green.
- Keep commits or diff checkpoints between phases when practical so test tampering is easy to spot.
- For UI tests, assert accessible user-visible behavior rather than component internals.
- For backend tests, assert public API, action, service, or route behavior rather than private helper calls.

## Cycle Checklist

```
[ ] Plan lists Red, Green, Refactor, Validate milestones
[ ] New test fails for the expected reason
[ ] Test has explicit input and expected output
[ ] Test does not depend on hidden shared state
[ ] Production code is the minimum needed for this batch
[ ] Tests were not weakened, skipped, deleted, or bypassed
[ ] Full relevant test command was run after Green and Refactor
[ ] Human validation reviewed architecture, maintainability, and diff integrity
```
