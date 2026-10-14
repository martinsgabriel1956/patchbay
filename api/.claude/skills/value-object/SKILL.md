---
name: value-object
description: Create a new Value Object (VO). Use when a validation rule appears in more than one place, carries a domain name (email, password, phone, name), or is complex enough to deserve its own test suite.
argument-hint: "Which concept are we modeling as a Value Object?"
---

# Value Object

A Value Object encapsulates validation and normalization of a single domain concept. It guarantees that any instance it produces is already valid — callers never receive a raw, unvalidated value.


Invoke the `/entities` and `/use-case` skill for the broader entity/use-case/VO reference. Apply the rules below exactly.

---

## Step 0 — Decide: VO or inline validation?

**Create a VO when any of these are true:**
- The same rule appears in two or more places (entities, use cases, schemas)
- The concept has a domain name: email, password, phone number, name, CPF, CNPJ, etc.
- The validation is complex enough to deserve its own test suite (regex, multiple rules)
- The VO can export constants (e.g. a regex) that Zod schemas also need

**Use inline validation (inside the entity or use case) when:**
- The rule is specific to one entity and won't be reused (e.g. `title.trim().length < 3`)
- It's a simple range or length check with no domain concept attached
- Extracting it would create a class for a single three-line if-block

**If unsure:** check first if the VO may already exist.

---

## Step 1 — Check for existing VOs

Before creating anything, scan the directory:

```
src/shared/validations/
├── Email.validator.ts
├── Name.validator.ts
├── Password.validator.ts
├── Phone.validator.ts
├── Temporary-Password.validator.ts
└── OrganizationSettings.validator.ts
```

If an existing VO covers the concept, use it. Do not create duplicates.

---

## Step 2 — Create the file

**Location:** `src/shared/validations/[ConceptName].validator.ts`  
**Spec:** `src/shared/validations/[ConceptName].validator.spec.ts`

Naming rules:
- File name: `PascalCase.validator.ts`
- Class name: matches the domain concept exactly (`Email`, `Name`, `CpfNumber`)

---

## Step 3 — Implement the canonical pattern

### Simple VO (scalar value — string, number)

```ts
import { BadRequestError } from "../errors/BadRequestError";

export class Email {
  private constructor(private readonly email: string) {}

  static validate(value: string): Email {
    if (!value) throw new BadRequestError("Email is required.");

    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) throw new BadRequestError("Email is invalid.");

    return new Email(value.toLowerCase().trim());
  }

  get value(): string {
    return this.email;
  }
}
```

Rules:
- `private constructor` — prevents external instantiation, forces use of `validate()`
- `static validate()` — the only public entry point; validates, normalizes, returns the instance
- `get value()` — the only way to extract the raw value
- Always throw `BadRequestError`, never `new Error(...)`
- Normalize inside `validate()` (trim, lowercase) so consumers always get a clean value

### Sync vs async

Use **sync** by default — all scalar validation (regex, length, format) is pure and needs no I/O:

```ts
static validate(value: string): ConceptName { ... }
```

Use **async** only when `validate()` itself must perform I/O (e.g. a uniqueness check against the DB). Do not make a method async just for consistency — it adds unnecessary `.value` `await` chains at every call site:

```ts
// wrong — no I/O happens, async is noise
static async validate(value: string): Promise<Email> { ... }

// correct for pure validation
static validate(value: string): Email { ... }
```

### Complex VO (wraps a structured object)

For concepts that wrap a multi-field object (e.g. settings, address, configuration):

```ts
import { BadRequestError } from "../errors/BadRequestError";

type Settings = {
  currency: string;
  primaryColor: string;
  // ...
};

export class OrganizationSettings {
  private readonly settings: Settings;

  constructor(settings: Settings) {
    if (!settings) throw new BadRequestError("Settings is required.");
    // add field-level assertions here if needed
    this.settings = settings;
  }

  toPersistence(): Settings {
    return { ...this.settings };
  }
}
```

Use `toPersistence()` (not `get value()`) when the VO wraps a structured type that the Repository must write directly.

---

## Step 4 — Export constants when Zod schemas need them

If the validation regex is also used in a Zod schema (for consistent client/server error messages), export it as a named constant:

```ts
export const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

export class CpfNumber {
  private constructor(private readonly cpf: string) {}

  static validate(value: string): CpfNumber {
    if (!value) throw new BadRequestError("CPF is required.");
    if (!CPF_REGEX.test(value)) throw new BadRequestError("CPF is invalid.");
    return new CpfNumber(value);
  }

  get value(): string {
    return this.cpf;
  }
}
```

Zod schema usage:
```ts
import { CPF_REGEX } from "@/shared/validations/CpfNumber.validator";

z.string().regex(CPF_REGEX, "CPF is invalid.")
```

---

## Step 5 — Consume in the right layer

### In an Entity `static create()` or mutation method

VOs are called inside the entity when the concept belongs to the entity's own fields:

```ts
import { Name } from "@/shared/validations/Name.validator";
import { Password } from "@/shared/validations/Password.validator";

export class OrganizationMember {
  static async create(name: string, password: string): Promise<OrganizationMember> {
    const validName = Name.validate(name).value;
    const validPassword = (await Password.validate(password)).value;
    // ...
  }
}
```

### In a Use Case

VOs are called in the Use Case when the validated value is used directly by the use case logic (e.g. a lookup field, not stored in an entity):

```ts
import { Email } from "@/shared/validations/Email.validator";

async execute(data: RequestPasswordResetRequest): Promise<void> {
  const email = Email.validate(data.email).value;
  const user = await this.userRepository.findByEmail(email);
  // ...
}
```

**Never call VOs in:**
- Controllers (no business logic)
- Repositories (no domain logic)
- Routes (Zod handles HTTP-level format validation)

---

## Step 6 — Write the spec

Cover at minimum: one valid case (happy path), one empty/missing case, and the boundary cases specific to this VO.

```ts
import { describe, expect, it } from "vitest";
import { BadRequestError } from "../errors/BadRequestError";
import { CpfNumber } from "./CpfNumber.validator";

describe("CpfNumber Validator", () => {
  it.each(["123.456.789-09", "987.654.321-00"])(
    "should accept a valid CPF: %s",
    (cpf) => {
      const result = CpfNumber.validate(cpf);
      expect(result.value).toBe(cpf);
    },
  );

  it.each(["", "123", "abc.def.ghi-jk", "000.000.000-00"])(
    "should throw for an invalid CPF: %s",
    (cpf) => {
      expect(() => CpfNumber.validate(cpf)).toThrow(BadRequestError);
    },
  );
});
```

Use `it.each` for multiple valid inputs and `it.each` for multiple invalid inputs — avoids repetition and makes boundary coverage obvious.

---

## Step 7 — Verify checklist

- [ ] File is in `src/shared/validations/` and follows `PascalCase.validator.ts` naming
- [ ] Constructor is `private` (or package-private for complex VOs)
- [ ] `static validate()` is the only entry point — no public constructor calls
- [ ] `validate()` is sync (unless actual I/O is required)
- [ ] Every invalid path throws `BadRequestError`, never `new Error(...)`
- [ ] Normalization (trim, lowercase) happens inside `validate()`, not at the call site
- [ ] Spec covers: valid input, empty input, all invalid boundary cases
- [ ] No Prisma, Fastify, or repository imports
- [ ] Regex constants exported if used in Zod schemas elsewhere
