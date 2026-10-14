---
name: brand
description: "Use when the user wants to change the visual identity of the project (rebrand) or restructurally redesign an interface (redesign). `/brand rebrand` — new palette, typography, and design tokens propagated through the codebase. `/brand redesign` — structural layout overhaul, new hierarchy, component reorganization. NOT for polish, micro-interactions, or UX copy improvements — use /impeccable for those."
argument-hint: "<rebrand|redesign> [target-path]"
user-invocable: true
---

Applies identity changes and structural redesigns to production interfaces. Interactive, token-aware, always confirms before writing.

## Routing rules

1. **No argument**: show the command menu below. Ask which to use.
2. **`rebrand`**: load [reference/rebrand.md](reference/rebrand.md) and follow its flow.
3. **`redesign [path]`**: load [reference/redesign.md](reference/redesign.md) and follow its flow with `path` as the scope.
4. **Unrecognized first word**: show the command menu and ask for clarification.

## When to use `/brand` vs `/impeccable`

| Signal | Use |
|---|---|
| New brand palette, typography, or token system | `/brand rebrand` |
| Restructured layout, new information architecture | `/brand redesign` |
| Polish, spacing, micro-interactions, UX copy | `/impeccable` |
| Accessibility audit or performance check | `/impeccable audit` |
| Both rebrand + redesign at once | Run `/brand rebrand` first, then `/brand redesign` |

## Commands

| Command | Description | Reference |
|---|---|---|
| `rebrand` | Replace design tokens (palette, typography, radius, spacing, shadows) across the codebase | [reference/rebrand.md](reference/rebrand.md) |
| `redesign [path]` | Map existing interface and guide structural redesign by dimension | [reference/redesign.md](reference/redesign.md) |

## Design invariants

These apply to all output from both subcommands.

### Color space
Always use OKLCH. Accept any color format from the user (hex, hsl, rgb, oklch) — convert to oklch before applying. Never use raw `#000` or `#fff`; tint every neutral toward the brand hue (chroma 0.005–0.01 minimum).

### Typography
- Body line length: 65–75ch max.
- Hierarchy via scale + weight contrast (≥1.25 ratio between steps).

### Confirmation
Never apply changes silently. Always show a grouped summary and wait for explicit user confirmation before writing any file.
