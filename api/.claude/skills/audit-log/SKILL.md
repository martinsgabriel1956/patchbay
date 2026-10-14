---
name: audit-log
description: Add or review audit logging in a Use Case. Use when the user needs to add audit log calls, review if a use case is correctly auditing mutations, or understand which fields go in changes/previous.
argument-hint: "Which use case or operation needs audit logging?"
---

# Audit Log

Read `docs/ai-rules/audit-log.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Confirm the operation type

Ask (or infer from context) whether the operation is **CREATE**, **UPDATE**, **DELETE**, or a **point action** (upload, toggle, activate, etc.). The type determines how to fill `changes` and `previous`.

---

## Step 2 — Choose the right method

- Use `saveOrganizationAndSystemAuditLog` for any operation that has an `organizationId` in scope.
- Use `saveSystemAuditLog` only when there is genuinely no organization context.

---

## Step 3 — Fill the fields

| Field | Rule |
|---|---|
| `entity` | Class name as string literal: `"Auction"`, `"OrganizationMember"` |
| `entityId` | `.toString()` of the entity's id. Never skip when the id is known. |
| `entityLabel` | Human-readable name. Never an internal ID. Mask emails with `maskEmail(...)`. |
| `organizationId` | ID of the organization that owns the operation. |
| `context` | The `context` object received by `execute`. |
| `action` | A constant from `AUDIT_LOG_ACTION` — never a string literal. Add the constant to `src/shared/constants/audit-log.ts` if it doesn't exist yet. |
| `changes` / `previous` | See below. |

**CREATE** — full initial state in `changes`, omit `previous`:
```ts
changes: { title: entity.title, status: entity.status, /* all relevant fields */ }
```

**UPDATE** — only changed fields, use `extractChanges`:
```ts
const { changes, previous } = extractChanges(currentState, data);
```

**DELETE** — full state before deletion in `previous`, omit `changes`:
```ts
previous: { title: entity.title, status: entity.status, /* all relevant fields */ }
```

**Point action** — capture previous value before the mutation:
```ts
const previousUrl = entity.imageUrl;
// ... operation ...
changes: { imageUrl: newUrl }, previous: { imageUrl: previousUrl }
```

---

## Step 4 — Handle sensitive data

- Never write passwords, hashes, or salts.
- Mask emails with `typeof` guard:
```ts
if (typeof changes.email === "string") changes.email = maskEmail(changes.email);
if (typeof previous.email === "string") previous.email = maskEmail(previous.email);
```

---

## Step 5 — Position in the use case

The audit log call is **always the last side effect** — after persistence, session revocation, and event bus publishes:

```ts
await this.repository.update(entity);          // 1. persist
await this.eventBus.publish({ ... });           // 2. side effects
await this.auditLogger.saveOrganizationAndSystemAuditLog({ ... }); // 3. audit — last
```

---

## Step 6 — Verify checklist

- [ ] Uses `AuditLogger`, never `auditLogRepository.save()` directly
- [ ] `AuditLogger` is injected in the constructor, not passed to `execute`
- [ ] `entityLabel` is human-readable (not an ID)
- [ ] `action` is a `AUDIT_LOG_ACTION` constant
- [ ] Sensitive fields are masked
- [ ] Call is the last statement in `execute`
