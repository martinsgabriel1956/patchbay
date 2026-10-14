---
name: notification
description: Add a new notification event to the existing notification system (user, auctioneer, or organization). Use when implementing any new in-app or email notification triggered by a domain event.
argument-hint: "Which entity receives the notification (user / auctioneer / organization) and what is the event?"
---

# Notification System

This skill teaches you how to add a new notification event to the existing pipeline. Read every section before touching any file.

---

## Architecture Overview

The full pipeline for a notification:

```
Use Case / Job Handler
  └── eventBus.publish({ name: DomainEventName.XxxNotification, payload: { event, recipientId, payload } })
        └── XxxNotificationEventQueue (IEventHandler)
              └── notificationQueue.add("notification.xxx", payload)   ← BullMQ
                    └── XxxNotificationJob (IJobHandler)
                          └── XxxNotificationService.notify(event, recipientId, payload)
                                ├── registry lookup
                                ├── preference check (user only)
                                ├── Repository.create(notification)
                                ├── socketGateway.emit(room, "notification:new", {...})
                                └── emailFn?.catch()  (fire-and-forget)
```

There are **three independent stacks** — one per recipient entity. Each has its own events file, registry, service, job handler, and event queue handler. They share only `Channel`, `NotificationRefs`, and `NotificationRegistryEntry`.

---

## Three Entities, Three Stacks

| Entity | DomainEventName | Job name | Recipient field |
|---|---|---|---|
| User | `DomainEventName.UserNotification` | `"notification.user"` | `userId` |
| Auctioneer | `DomainEventName.AuctioneerNotification` | `"notification.auctioneer"` | `auctioneerId` |
| Organization | `DomainEventName.OrganizationNotification` | `"notification.organization"` | `organizationId` |

---

## Key Files per Entity

### User

```
src/modules/notification/services/user/
  user-notification.events.ts        ← event keys + UserNotificationPayloadMap
  user-notification.registry.ts      ← registry + preferenceFieldByType
  user-notification.service.ts       ← UserNotificationService.notify()
  user-notification.service.interface.ts

src/modules/workers/jobs/notification/handlers/
  user-notification.job.ts           ← IJobHandler for "notification.user"

src/modules/workers/events/queues/notification/handlers/
  UserNotification.queue.ts          ← IEventHandler → enqueues job

src/config/@types/domain-events/schemas/
  user-notification-domain-payload.schema.ts  ← Zod schema + TS type
```

### Auctioneer

```
src/modules/notification/services/auctioneer/
  auctioneer-notification.events.ts
  auctioneer-notification.registry.ts
  auctioneer-notification.service.ts
  auctioneer-notification.service.interface.ts

src/modules/workers/jobs/notification/handlers/
  auctioneer-notification.job.ts

src/modules/workers/events/queues/notification/handlers/
  AuctioneerNotification.queue.ts

src/config/@types/domain-events/schemas/
  auctioneer-notification-domain-payload.schema.ts
```

### Organization

```
src/modules/notification/services/organization/
  organization-notification.events.ts
  organization-notification.registry.ts
  organization-notification.service.ts
  organization-notification.service.interface.ts

src/modules/workers/jobs/notification/handlers/
  organization-notification.job.ts

src/modules/workers/events/queues/notification/handlers/
  OrganizationNotification.queue.ts

src/config/@types/domain-events/schemas/
  organization-notification-domain-payload.schema.ts
```

---

## Step-by-Step: Adding a New Event

### Step 1 — Define the event key and payload in `*.events.ts`

The events file contains two exports: the event constants object and the `PayloadMap`.

**Naming rule:** event keys follow `"namespace.action"` dot-notation (e.g., `"bid.outbid"`, `"auction.live.started"`).

**Example (user):**
```typescript
// user-notification.events.ts
import type { NotificationType } from "../../entities/notification.entity";

export const userNotificationEvents = {
    Bid: { Outbid: "bid.outbid" },
    Lot: { Won: "lot.won" },  // ← new event added here
} as const satisfies { [NS in Capitalize<Lowercase<NotificationType>>]?: Record<string, string> };

export type UserNotificationPayloadMap = {
    [userNotificationEvents.Bid.Outbid]: {
        itemId: string;
        itemTitle: string;
        lotNumber: number;
        auctionId: number;
    };
    [userNotificationEvents.Lot.Won]: {  // ← new payload added here
        itemId: string;
        itemTitle: string;
        lotNumber: number;
        auctionId: number;
    };
};
```

**The `satisfies` constraint** ensures namespace keys are `Capitalize<Lowercase<NotificationType>>`. Valid: `"Bid"`, `"Lot"`, `"Auction"`. Invalid: `"bid"`, `"BID"`.

**NotificationType values:** `"BID" | "LOT" | "AUCTION" | "FAVORITE" | "PAYMENT" | "SYSTEM"`

---

### Step 2 — Add the registry entry in `*.registry.ts`

The registry maps each event key to its `NotificationRegistryEntry<TPayload>`.

```typescript
// NotificationRegistryEntry shape (from notification-registry.types.ts):
type NotificationRegistryEntry<TPayload> = {
    type: NotificationType;          // "BID" | "LOT" | "AUCTION" | ...
    channels: Channel[];             // [Channel.AlertInApp] and/or [Channel.Email]
    titleFn: (payload: TPayload) => string;
    messageFn: (payload: TPayload) => string;
    emailFn?: (mailer: IMailerService, to: UserParams, payload: TPayload) => Promise<void>;
}
```

**Example (user registry):**
```typescript
// user-notification.registry.ts
export const userNotificationRegistry: UserNotificationRegistryMap = {
    [userNotificationEvents.Bid.Outbid]: {
        type: "BID",
        channels: [Channel.AlertInApp],
        titleFn: () => "Seu lance foi superado",
        messageFn: payload => `Um lance maior foi dado no lote ${payload.lotNumber} — ${payload.itemTitle}`
    },
    [userNotificationEvents.Lot.Won]: {  // ← new entry
        type: "LOT",
        channels: [Channel.AlertInApp, Channel.Email],
        titleFn: () => "Você venceu um lote!",
        messageFn: payload => `Parabéns! Você venceu o lote ${payload.lotNumber} — ${payload.itemTitle}`,
        emailFn: async (mailer, to, payload) => {
            await mailer.sendLotWon(to, { itemTitle: payload.itemTitle, auctionId: payload.auctionId });
        }
    }
};
```

**Channels:**
- `Channel.AlertInApp` — persists to DB + emits socket event `notification:new`
- `Channel.Email` — calls `emailFn` fire-and-forget (requires `emailFn` in the entry)

**User-specific:** `preferenceFieldByType` maps `NotificationType` to the preference key. Types `AUCTION` and `SYSTEM` are absent → always delivered.

```typescript
export const preferenceFieldByType: Partial<
    Record<NotificationType, keyof Pick<NotificationPreferences, "bids" | "lots" | "payments" | "favorites">>
> = {
    BID: "bids",
    LOT: "lots",
    PAYMENT: "payments",
    FAVORITE: "favorites",
    // AUCTION and SYSTEM are omitted → always sent
};
```

---

### Step 3 — Trigger the notification via `eventBus.publish`

From any Use Case or Job Handler that needs to fire a notification:

**User notification:**
```typescript
await this.eventBus.publish({
    name: DomainEventName.UserNotification,
    payload: {
        event: userNotificationEvents.Lot.Won,
        userId: winnerUserId,
        payload: {
            itemId: item.id,
            itemTitle: item.title,
            lotNumber: item.lotNumber,
            auctionId
        }
    }
});
```

**Auctioneer notification:**
```typescript
await this.eventBus.publish({
    name: DomainEventName.AuctioneerNotification,
    payload: {
        event: auctioneerNotificationEvents.Auction.Assigned,
        auctioneerId: auctioneer.id,
        payload: {
            auctionId: auction.id,
            auctionTitle: auction.title
        }
    }
});
```

**Organization notification:**
```typescript
await this.eventBus.publish({
    name: DomainEventName.OrganizationNotification,
    payload: {
        event: organizationNotificationEvents.Auction.LiveStarted,
        organizationId: organization.id,
        payload: {
            auctionId: auction.id,
            auctionTitle: auction.title
        }
    }
});
```

The `eventBus.publish` call goes through `DomainEventName.XxxNotification` → `XxxNotificationEventQueue` → `notificationQueue.add("notification.xxx", payload)` → `XxxNotificationJob` → `XxxNotificationService.notify()`. No additional wiring is needed for new events — only the events file and registry need updating.

---

### Step 4 — Verify the domain payload schema stays in sync

The payload schemas at `src/config/@types/domain-events/schemas/` use `z.record(z.string(), z.unknown())` for the nested `payload` field. **These schemas do NOT need to change when adding a new event** — they are intentionally loose. The type safety lives in `XxxNotificationPayloadMap`.

The `XxxNotificationDomainPayload` type, however, is derived from the `PayloadMap` and will automatically include any new event added in Step 1:

```typescript
// user-notification-domain-payload.schema.ts (no change needed for new events)
export type UserNotificationDomainPayload = {
    [K in keyof UserNotificationPayloadMap]: {
        event: K;
        userId: string;
        payload: UserNotificationPayloadMap[K];
    };
}[keyof UserNotificationPayloadMap];
```

---

## Full Checklist for a New Event

- [ ] Added event key to the `xxxNotificationEvents` object in `*.events.ts`
- [ ] Added payload type to `XxxNotificationPayloadMap` in `*.events.ts`
- [ ] Added registry entry (with `type`, `channels`, `titleFn`, `messageFn`, optional `emailFn`) in `*.registry.ts`
- [ ] If `Channel.Email` is used: `emailFn` is present and the method exists in `IMailerService`
- [ ] Caller uses `eventBus.publish` with the correct `DomainEventName` and passes the exact payload shape from the `PayloadMap`
- [ ] No new files created — only `*.events.ts` and `*.registry.ts` need editing for new events

---

## What NOT to Touch

- `XxxNotificationEventQueue` — already routes all events for that entity; no change needed
- `XxxNotificationJob` — already dispatches all events to the service; no change needed
- `XxxNotificationService` — no change needed; it reads from the registry dynamically
- `notification-queue.ts` — no change needed
- `NotificationWorker.ts` — no change needed
- Domain payload schemas (`*.schema.ts`) — no change needed for new events

---

## Common Mistakes

**Wrong:** Adding a new event key as a plain string not declared in the events object.
```typescript
// BAD — not type-safe, bypasses PayloadMap
await this.userNotificationService.notify("lot.won", userId, payload);
```
```typescript
// GOOD — always reference through the events object
await this.eventBus.publish({
    name: DomainEventName.UserNotification,
    payload: { event: userNotificationEvents.Lot.Won, userId, payload }
});
```

**Wrong:** Calling `userNotificationService.notify()` directly from a Use Case.
Use Cases must publish via `eventBus` — the notification is processed durably by BullMQ, not inline.

**Wrong:** Adding `Channel.Email` without an `emailFn` in the registry entry.
The service calls `emailFn` only if it exists; forgetting it silently skips email even though the channel is declared.

**Wrong:** Adding `emailFn` that throws — email delivery must be fire-and-forget. The service wraps it in `.catch()`, but if the `emailFn` itself is not async-safe the notification will propagate the error.

**Wrong:** Setting `type` in the registry entry to a value not in `NotificationType`.
Valid values: `"BID" | "LOT" | "AUCTION" | "FAVORITE" | "PAYMENT" | "SYSTEM"`.

---

## Socket Delivery

`Channel.AlertInApp` emits to the recipient's room immediately after persistence:

| Entity | Room | Socket event |
|---|---|---|
| User | `user:{userId}` | `notification:new` |
| Auctioneer | `auctioneer:{auctioneerId}` | `notification:new` |
| Organization | `organization:{organizationId}` | `notification:new` |

Payload shape sent to the frontend:
```typescript
{
    id: string;        // notification UUID
    title: string;
    message: string;
    type: string;      // NotificationType
    read: boolean;     // always false on creation
    createdAt: number; // Unix ms (notification.createdAt.getTime())
}
```

---

## Preference Gating (User only)

`UserNotificationService` checks `NotificationPreferences` before delivering. If the user has disabled the preference category, no persistence, no socket, no email occurs.

Mapping:
- `BID` → `preferences.bids`
- `LOT` → `preferences.lots`
- `PAYMENT` → `preferences.payments`
- `FAVORITE` → `preferences.favorites`
- `AUCTION` / `SYSTEM` → always delivered (not in `preferenceFieldByType`)

Auctioneer and Organization services have **no preference check** — all notifications are always delivered.
