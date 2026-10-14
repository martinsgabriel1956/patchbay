---
name: create-module
description: Scaffold a complete module (Entity → Repository → Use Case → Controller → Route → Factory). Use when the user wants to build a new feature end-to-end or says "create module", "new feature", "scaffold", or names an entity they want to implement.
argument-hint: "Module name and operation (e.g. 'CreateAuction', 'UpdateItem')"
---

You are orchestrating the creation of a complete module. Work through each layer in order, invoking the matching skill for each. Stop and show the user what was built after every layer before continuing to the next.

## Step 1 — Gather requirements

If the user did not provide arguments, ask:

1. **Module name and operation** — e.g. `CreateAuction`, `UpdateOrganizationMember`
2. **Does this operation require audit logging?** (yes / no)

Do not ask anything else. Derive all other details from the codebase and the answers above.

---

## Step 2 — Confirm the build plan

Present this checklist to the user and wait for approval before writing any file:

```
Module: [name]
Operation: [action]
Audit log: [yes / no]

Build order:
[ ] 1. Entity         → /entity
[ ] 2. Repository     → /repository  (interface + Prisma + InMemory)
[ ] 3. Use Case       → /use-case
[ ] 4. Controller     → /controller
[ ] 5. Route          → /route
[ ] 6. Factory        → /factory
[ ] 7. Audit log      → /audit-log   (only if selected above)
```

---

## Step 3 — Execute layer by layer

For each layer:
1. Invoke the corresponding skill
2. Write the file(s) following that skill's checklist
3. Show the user which files were created/modified
4. Mark the layer ✅ before moving to the next

**Build order is fixed — never skip or reorder layers.** Each layer depends on the one before it.

### Layer dependencies
- **Entity** has no dependencies — build first
- **Repository** depends on the Entity (interface, Prisma impl, InMemory)
- **Use Case** depends on the Repository interface and Entity
- **Controller** depends on the Use Case and the module's schema type
- **Route** depends on the Controller; wires all dependencies
- **Factory** depends on the Route being complete (extracts composition from it)
- **Audit log** (if selected) — audit call goes inside the Use Case, after persistence

---

## Step 4 — Audit log (conditional)

Only execute this step if the user selected audit logging in Step 1.

Invoke `/audit-log` scoped to the Use Case created in Layer 3. Follow all rules from that skill: correct method, changes/previous for the operation type, AUDIT_LOG_ACTION constant, audit call as the last statement.

---

## Step 5 — Final verification

After all layers are complete, run this checklist:

- [ ] Entity: `static create()` validates, `toPersistence()` excludes managed fields
- [ ] Repository: interface returns `Entity | null`, InMemory array is public
- [ ] Use Case: execute order correct, no Prisma/HTTP imports, correct domain errors
- [ ] Controller: no business logic, schema type on `FastifyRequest`, no try/catch
- [ ] Route: dependencies → middlewares → endpoint, `.bind(controller)`, all response codes declared
- [ ] Factory: returns `{ useCase, controller }`, only real implementations
- [ ] Audit log (if applicable): last statement in execute, AUDIT_LOG_ACTION constant, entityLabel is human-readable

Report: files created, any deviations from the standard pattern, and what the user should test first.
