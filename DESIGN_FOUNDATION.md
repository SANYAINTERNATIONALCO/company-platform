# DESIGN_FOUNDATION.md

**Status: proposal — no application code has been changed to produce this document. `framer-motion` was added as a dependency (approved separately) so the motion system in Phase 2/3 can be specified against a real, installed library rather than a hypothetical one; it is not yet imported anywhere.**

This is the foundation document for a **Design Token System + Component Primitive Library** for the Sanya International company platform. It does not redesign any screen and does not touch business logic, database logic, or permissions. It exists so that every screen built from this point forward — and, eventually, every screen migrated — draws from one coherent, premium visual system instead of the ad hoc inline styles the app has today.

Read alongside `CLAUDE.md` (business rules), `PROJECT_ARCHITECTURE_REPORT.md` (architecture + known issues), and `DEVELOPMENT_RULES.md` (agent working conventions). This document supersedes none of them — where `DEVELOPMENT_RULES.md` currently says "match the existing inline style," that guidance stands until this foundation is approved and a component has actually been migrated (see `MIGRATION_STRATEGY.md`).

---

## 1. Why this exists

The platform works and is in daily production use, but its visual layer was built the only way that's fast when you're moving alone and fast: one inline `style={{...}}` object per element, per file, repeated everywhere it's needed again. That approach has no ceiling on drift — thirteen components have, by now, each independently reinvented the same button, the same input, the same status pill, the same card header, with values that are close but never quite identical (see the inventory in §3). None of that is a moral failing of the codebase; it's what happens to any hand-styled app past a certain size. The fix is not a rewrite — it's a **shared vocabulary** components can opt into over time.

## 2. What "premium enterprise SaaS" means here, concretely

The brief names five reference points. Rather than cite them as vibes, here is exactly what each contributes to this system and why:

| Reference | What we take from it |
|---|---|
| **Linear** | Restraint. A tight, purposeful color palette where almost everything is neutral and color is spent only on state (success/warning/danger) and one accent. Keyboard-first interaction affordances, instant perceived response, and a type scale that never needs more than 5–6 sizes on screen at once. |
| **Vercel** | Monochrome-first UI with sharp, confident contrast; a systemized dark-mode-native palette; small, consistent radii; borders doing more work than shadows. |
| **Stripe Dashboard** | How to make **dense financial tables** legible — tabular figures, right-aligned numerics, quiet zebra/hover states, and calm color-coding for status that never competes with the data itself. Directly relevant here: this app's Payroll, Finance, and Attendance tables are exactly this kind of dense financial table today, rendered with none of these disciplines. |
| **Notion** | Calm information density for long-form, list-heavy, and document-like screens (this app's Documents, Tasks, ActivityLog are this shape) — generous line-height, clear but quiet section dividers, unobtrusive icons. |
| **Emil Kowalski** (Vaul, Sonner, cn.new) | The **motion and feedback layer** — toasts that feel considered rather than decorative, dialogs that animate with physical honesty (spring, not linear ease), and the belief that an interface's perceived quality lives disproportionately in these small transition details. This is also where this app currently has the largest gap: it has *zero* toasts, *zero* animated dialogs, and *zero* hover transitions anywhere (confirmed by reading every component — see §3.7). |

None of these are aesthetics to imitate wholesale; they're five different disciplines (restraint, contrast, data density, calm density, motion honesty) that this specific app needs in different places. The tokens and primitives below are built to serve all five without importing any single one's specific "look."

## 3. Current-state inventory (Phase 1 summary)

Full raw inventory (every literal value found, file by file) lives in `DESIGN_TOKENS.md` §1. Summary of what the read of all 17 files under `app/` turned up:

### 3.1 Colors
No palette file exists. Colors are literal hex strings repeated across files. Distinct values found in active use:
- **Neutrals:** `#111827`, `#374151`, `#4b5563`(rare), `#6b7280`, `#9ca3af`, `#d1d5db`, `#e5e7eb`, `#f0f4f8`, `#f3f4f6`, `#f9fafb`, `#ffffff`
- **Brand blue:** `#0f2557` (sidebar), `#1e40af`, `#1d4ed8`, `#2563eb`, `#3b82f6`, `#93c5fd`, `#bfdbfe`, `#dbeafe`, `#eff6ff`
- **Semantic green:** `#15803d`, `#16a34a`, `#86efac`, `#dcfce7`
- **Semantic red:** `#b91c1c`(rare), `#dc2626`, `#fca5a5`, `#fee2e2`, `#fef2f2`
- **Semantic amber:** `#b45309`, `#d97706`(rare), `#fcd34d`, `#fef9c3`
- **Semantic purple:** `#7c3aed`, `#c4b5fd`, `#ede9fe`, `#f5f3ff`(rare)
- **Semantic cyan:** `#0891b2`, `#0e7490`, `#cffafe`

30+ distinct values, no naming, no documented pairing rule — but a consistent *pattern* is visible (each semantic color always appears as a saturated text/icon tone + a pale background tint + occasionally a mid-tone border), which is exactly what §2 of `DESIGN_TOKENS.md` formalizes.

### 3.2 Typography
No type scale. Font sizes found as literal pixel values across components: `10, 11, 12, 13, 14, 15, 16, 17, 20, 22, 24, 26, 28, 48`. Font weights used: `400` (implicit), `500`, `600`, `700` — assigned inconsistently (the same semantic role, e.g. "table header label," is `700` in `Attendance.tsx` and `700` in `Employees.tsx` but a card title is `700` in one file and `600` in another for what reads as the same visual weight of emphasis). Font family is `system-ui` everywhere on screen; `layout.tsx` imports Geist/Geist Mono via `next/font` but nothing in the app actually uses them. No `line-height` scale — left to browser defaults except where a value was hand-picked for one string (e.g. `1.6`, `2.1`, `1.3` scattered ad hoc).

### 3.3 Spacing
No spacing scale. Padding/margin/gap literals found: `2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32`. Several of these (`9, 11, 14, 18, 22`) don't sit on any clean base grid, which is why two visually "same" gaps in different components are off by a pixel or two and it's invisible until you diff the actual numbers.

### 3.4 Radius
Values found: `4, 6, 7, 8, 9, 10, 12, 14, 16, 20` (plus `20`/large values used specifically to fake a pill shape on badges). No scale — a card in one file is `12`, in another `14`, in another `16`, with no discernible rule for which gets which.

### 3.5 Shadows
Four distinct ad hoc shadow strings found, each used in different components for what is functionally the same "elevated card" role:
`0 2px 8px rgba(0,0,0,0.08)`, `0 1px 3px rgba(0,0,0,0.05)`, `0 1px 3px rgba(0,0,0,0.1)`, `0 1px 4px rgba(0,0,0,0.06)`. No elevation scale (nothing distinguishes "resting card" from "open dropdown" from "modal" — because there is no modal or dropdown-with-real-elevation today; dropdowns use one of these same four values arbitrarily).

### 3.6 Transitions / Animation
This is the smallest and most important finding: across all 13 components, exactly **three** transition declarations exist in the entire codebase:
- `background 0.15s, color 0.15s` (sidebar nav item hover-equivalent, but driven by `isActive` state, not an actual `:hover`)
- `width 0.2s, min-width 0.2s` (sidebar collapse/expand)
- `transform 0.2s` (one chevron icon rotation)

**No component has a real `:hover` state.** Inline `style={{}}` cannot express `:hover` without a synthetic `onMouseEnter`/`onMouseLeave` handler, and none exist anywhere in the 13 components read for this audit. Buttons, table rows, and clickable cards all rely on `cursor: pointer` alone — there is no visual acknowledgment that an element is interactive until the click itself fires. This was confirmed live: a Playwright pass of the login screen (the one screen reachable without credentials) showed zero hover/focus feedback on the inputs, and the browser console logged `GoTrueClient ... Multiple GoTrueClient instances detected` — direct runtime confirmation of the 15-duplicated-Supabase-client issue tracked in the architecture report.

### 3.7 Buttons, Inputs, Cards, Tables, Badges
- **Buttons**: no shared component. Every button is a literal `<button style={{...}}>`, with 4 recurring *implicit* variants (primary blue fill, success green fill, danger red on pale-red, neutral gray) but no `disabled`-state visual treatment beyond the native `disabled` attribute (several buttons don't even dim when disabled).
- **Inputs**: `border: 2px solid #d1d5db` is the near-universal convention; radius/padding vary slightly per file. **No focus-visible style is defined anywhere**, and the login screen's inputs explicitly set `outline: 'none'` with nothing put in its place — a real, live accessibility regression, not a hypothetical one.
- **Cards**: a "white surface, radius 10–16, one of the four shadows above, `1–2px solid #e5e7eb` border, `#f9fafb` header strip with a `title + count + primary action button` row" pattern repeats in nearly every module — this is the single most copy-pasted structural pattern in the app and the highest-value target for a `<Card>` primitive.
- **Tables**: header `background:'#f3f4f6'`, `font-weight:700`, `border-bottom:'2px solid #e5e7eb'`; body rows `border-bottom:'1px solid #e5e7eb'` only — **no zebra striping and no row-hover** in any on-screen (non-print) table, despite tables routinely running 7–12 columns wide (Payroll has 12). Numbers are not set with `font-variant-numeric: tabular-nums` anywhere, so columns of amounts don't align on their digits.
- **Badges/pills**: `border-radius:20`, `padding:'3-5px 10-14px'`, `font-weight:600-700` — the most *consistent* pattern in the whole app (because the six semantic color pairs in §3.1 were clearly copy-pasted forward from wherever they were first written), and therefore the lowest-risk, fastest primitive to formalize first.

## 4. Design principles for this foundation

1. **Tokens are additive, not a rewrite.** They live as CSS custom properties (a new `app/tokens.css`, imported once from `globals.css`) plus a mirrored `app/lib/tokens.ts` for the rare case a numeric value is needed in JS math (e.g. a signature-scale multiplier). Existing inline `style={{}}` objects keep working exactly as they are; a token is only "used" when a component is touched and its literal value is replaced with `var(--color-...)` or `tokens.color....`. Nothing breaks by tokens merely *existing*.
2. **RTL is not an afterthought.** Every primitive is specified using logical CSS properties (`inset-inline-start`, `padding-inline`, `margin-inline-end`) instead of `left`/`right`, exactly because this app is 100% RTL Arabic and a left/right mistake is invisible in an LTR preview and instantly wrong in the shipped app.
3. **Motion communicates state, it doesn't decorate.** Every animated transition specified in Phase 2/3 exists to answer a real question the user has ("did my click register," "where did this panel come from," "is this still loading") — never a flourish with no informational job. `framer-motion` (installed) is the implementation vehicle for the handful of primitives that need real physics (`Modal`, `Toast`, `Dropdown`, `Tooltip`); everything else (color/background transitions on hover/focus) stays as plain CSS `transition`, because pulling a JS animation library into a static color change is the wrong tool.
4. **No parallel styling system.** Tailwind stays uninstalled-in-practice (it's already a dependency but unused, per `PROJECT_ARCHITECTURE_REPORT.md`) — this foundation does not introduce Tailwind, CSS Modules, or styled-components. It formalizes the pattern the app already uses (inline styles) by giving it a shared value source, which is the smallest possible structural change that still fixes the drift problem.
5. **Every primitive must earn its place by replacing a real, counted, repeated pattern** — or by filling a real, counted gap (Modal, Toast, Tooltip, Skeleton, Empty State do not exist today in any form; `window.alert()`/`window.confirm()` currently stand in for all of them). Nothing is speculative; §3 and `DESIGN_TOKENS.md` §1 are the receipts for every primitive proposed in `COMPONENT_LIBRARY_PLAN.md`.
6. **Business logic, data access, and permissions are out of scope, permanently — not just for this pass.** A primitive may accept a `readOnly` prop and render differently; it must never itself decide *what* is read-only. That decision stays exactly where it is today, in `page.tsx` and each module's own role checks.

## 5. What this foundation is not

- Not a dark-mode launch. Tokens are specified with dark-mode values from day one (cheap to do, expensive to retrofit later) but shipping a theme toggle is an explicit future phase, not part of this work.
- Not a component-library package/build step. Nothing here requires a monorepo, a separate build target, or Storybook (`DEVELOPMENT_RULES.md` already says not to add tooling infra without the user asking — that stands).
- Not a rewrite of any of the 13 modules. See `MIGRATION_STRATEGY.md` for how adoption actually happens, screen by screen, on the user's own timeline.
