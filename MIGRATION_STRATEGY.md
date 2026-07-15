# MIGRATION_STRATEGY.md

**Status: proposal.** This document does not perform any migration — it is the plan to approve before one line of `app/components/*` changes. Nothing here is executed until you sign off wave by wave (see §6).

---

## 0. What the codebase's own structure tells us about risk

Before sequencing anything, it's worth stating what a Graphify pass over the codebase actually confirms about blast radius: **the 13 modules have essentially zero code coupling to each other.** Each `components/*.tsx` file is its own isolated graph community (cohesion scores of 0.25–0.38 in `graphify-out/GRAPH_REPORT.md`, no component imports another component), and the only two things that touch more than one module are `page.tsx` (which imports all 13, but only to render them conditionally — it doesn't share logic with them) and `logActivity.ts` (the one real god-node, referenced by ~10 of the 13 modules for audit logging only).

That means, structurally, **migrating one module's UI to the new primitives cannot break a different module** — there is no shared state, no shared component tree, no prop-drilling between them to worry about. The actual risks in this migration are not "will Payroll break Attendance," they're (a) whether a per-file migration breaks *that file's own* behavior, and (b) whether shared *scaffolding* (tokens, the overlay-root portal, `logActivity` itself) is solid before any module depends on it. §2–§4 are sequenced accordingly.

The one real cross-cutting hazard: **Attendance, Payroll, and Documents each build raw HTML strings for Puppeteer** (`generatePdf()` / `app/api/pdf/route.ts`) using their own `styleCss` template strings, separate from their on-screen React styling. Token migration must touch **only** the on-screen `style={{}}` objects in these three files — the `reportStyleCss`/print `styleCss` template literals are a different, already-carefully-tuned system (see `CLAUDE.md` rule #7 on the signature-placement bug) and are explicitly **out of scope** for every wave below.

---

## 1. Sequencing principle

Four waves, each one a hard gate on the next — nothing in Wave *n+1* starts until Wave *n* is both built **and** approved:

1. **Foundation** — infrastructure only, zero visual change, zero user-facing risk.
2. **Inert primitives** — visual-only components (no new interaction model), piloted on one real screen.
3. **Interactive primitives** — components with real state/behavior (Dropdown, Tabs, Select), still piloted narrowly.
4. **New-capability primitives** — Dialog/Toast/Tooltip/Skeleton, which *change the shape* of existing functions (see §3's `confirm()` risk) and therefore get the most scrutiny.

Screen-by-screen full adoption (§4) only begins once Waves 1–3's primitives have each survived contact with at least one real screen.

---

## 2. Wave 0 — Foundation (infrastructure, no visual change)

| Item | What happens | Risk | Effort |
|---|---|---|---|
| Create `app/tokens.css` (all of `DESIGN_TOKENS.md` §2) | New file, imported once from `app/globals.css` via `@import` | **None** — a token file that nothing yet references changes nothing on screen | 0.5 day |
| Create `app/lib/tokens.ts` mirror | New file, unused until a primitive imports it | **None** | 0.5 day |
| Mount `<div id="overlay-root">` in `app/layout.tsx` | One-line addition to the existing root layout | **Very low** — additive DOM node, `layout.tsx` currently has no logic to disturb (it's already close to default boilerplate) | 0.25 day |
| `framer-motion` dependency | **Already installed** (approved and completed in this session) | — | Done |
| Build `app/ui/` primitives from `COMPONENT_LIBRARY_PLAN.md`, unreferenced by any screen yet | New files only | **None** — code that nothing imports cannot regress anything | 4–6 days (all 19, built once, reused everywhere after) |

**Dependency:** everything in every later wave depends on Wave 0 landing first. **Nothing here requires touching a single existing `components/*.tsx` file.**

---

## 3. Wave 1 & 2 — Primitive pilots (one screen each, chosen for lowest stakes)

Rather than adopt a primitive everywhere at once, each new primitive gets exactly **one** real pilot screen before being declared safe to spread. Proposed pilot assignments, chosen specifically for *low traffic and low data sensitivity* so a mistake here is cheap to notice and cheap to revert:

| Primitive(s) | Pilot screen | Why this screen | Risk if wrong |
|---|---|---|---|
| `Badge` | **Custody** (`Custody.tsx`) | Smallest module (306 lines), simplest badge usage (item-type chips, active/returned status), no financial data | Cosmetic only — a wrong badge color is visible instantly, reversible in minutes |
| `Card`, `Table`/`Table.Row` | **Contracts** (`Contracts.tsx`) | Second-smallest module, already has the cleanest existing card-header pattern to model against, low daily traffic (contracts change rarely) | Cosmetic + minor layout; no write-path logic touched |
| `Button`, `Input`, `Select` | **Custody + Contracts** (same two pilots) | Forms in these two modules are simple (no dependent-field logic, no dynamic validation beyond required-field checks) | Low — if a button's `onClick` wiring is preserved 1:1, behavior can't change |
| `Tabs` | **Custody** (active/returned) or **Documents** (create/archive) | Two-tab, stateless switch, no data refetch complexity beyond what's already there | Low |
| `Dropdown` | **Receipts** (receipt-type picker) | Single-select, no multi-checkbox state (unlike Attendance's month/employee pickers, saved for later) | Low-medium — must preserve exact click-outside-to-close behavior |
| `Sidebar Item` | `page.tsx` nav rendering | Not screen-scoped — this is the one Wave-1/2 item that *does* touch the shared shell, but it's a close-to-1:1 visual extraction (see `COMPONENT_LIBRARY_PLAN.md` §17) | Low — sidebar has no business logic, only navigation state |
| `Dashboard Card` | Dashboard section of `page.tsx` | Same reasoning as Sidebar Item — shell-level, visual-only | Low |

**Gate to pass before Wave 3:** each pilot screen has been clicked through in a real browser session (per `DEVELOPMENT_RULES.md`'s Playwright workflow) in both its `readOnly` and editable states, with no console errors and no behavior change versus the pre-migration version.

---

## 4. Wave 3 — New-capability primitives: the real risk in this plan

This is the wave that matters most for "premium feel" (Dialog/Toast replace every `alert()`/`confirm()`) and also the one that needs the most care, for one specific, concrete reason:

> **`window.confirm()` is synchronous and blocks the calling function's control flow.** Every delete/archive/un-archive function in this app is written as:
> ```js
> async function deleteX() {
>   if (!confirm('...')) return   // <- execution literally pauses here for a native, blocking dialog
>   await supabase.from(...).delete()...
> }
> ```
> A `Dialog` component is **asynchronous** — it opens, and the function that opened it returns immediately; the actual delete call has to happen in the dialog's `onConfirm` callback, not the next line of the original function. **This is not a drop-in replacement — every single call site that uses `confirm()` needs its function restructured**, not just its UI swapped. This is the one item in this entire plan that touches control flow, however slightly, in files that also contain real business logic (advance-balance reversal in Payroll, overtime-balance refunds in Attendance/Overtime, visa-cycle state transitions) — which is exactly the kind of change `DEVELOPMENT_RULES.md` and this brief say to be careful never to alter unintentionally.

Because of that, Wave 3 is split further:

| Sub-step | Scope | Risk | Effort |
|---|---|---|---|
| 3a. `Toast` | Replace success/error `alert()` calls **only** (these are pure notifications, not blocking confirmations — no control-flow change, just swap `alert(msg)` → `toast.success(msg)`/`toast.error(msg)`) | **Low** — mechanical, no logic restructuring | 2–3 days across all modules, but each individual swap is a one-line change |
| 3b. `Dialog` (confirm variant) — **pilot only** | Rewrite `confirm()` → `Dialog` on exactly **one** low-stakes delete flow first (proposal: Custody's `deleteItem`, which has no balance/counter side effects to get wrong) | **Medium** — first real test of the async-restructure pattern | 1 day for the pilot, including a full Playwright pass of the delete flow |
| 3c. `Dialog` — roll out to the rest | Once 3b's pattern is proven, apply the same restructure to every other `confirm()` site, **in ascending order of side-effect complexity**: simple deletes (Contracts, Documents, Tasks) → files-with-storage-cleanup (Employees' file/note delete) → balance-affecting deletes (Overtime, Attendance's compensatory-leave delete, Payroll's `deleteArchive`) last, since those are exactly the functions where an accidental reordering of "confirm → mutate → refund balance" steps would be a real financial-data bug, not a cosmetic one | **Medium-high** on the last group specifically — flagged for extra review/testing, not to be batched with the rest | 3–5 days total |
| 3d. `Tooltip`, `EmptyState`, `Skeleton` | Additive-only — no existing function's control flow involves these (a tooltip has no analogue today; skeletons replace a loading *string*, not a decision point; empty states replace a *terminal render*, not a mutation) | **Low** | 3–4 days across all modules |

---

## 5. Wave 4 — Full screen migrations, in priority order

Once Waves 0–3's primitives have each survived their pilots, full per-screen adoption (replacing *every* remaining ad hoc style in a file, not just the pieces already piloted) proceeds in this order — ordered by ascending risk (smallest, least-trafficked, least-financial screens first; the four highest-stakes, highest-traffic, PDF-entangled screens last and each given extra scrutiny):

1. **Custody** — already partially migrated in Waves 1–3; finish the remainder.
2. **Contracts** — same.
3. **Employees** — larger (472 lines), but conceptually simple CRUD + file cabinet; no financial math, no PDF entanglement.
4. **Overtime** — small, but *does* touch `employees.overtime_leave_balance` — first screen in Wave 4 with a real balance side effect, good next-step-up in complexity after Custody/Contracts/Employees.
5. **Documents** — PDF-entangled (letterhead/signature management + Puppeteer generation), but the on-screen CRUD portion (create/archive tabs, document list) is separable from the PDF-string-building code path — migrate the former, explicitly leave `printDocument()`'s HTML/CSS strings untouched.
6. **Visa** — largest single component (1,395 lines, 4 sub-tabs); migrate sub-tab by sub-tab (stats → tourist → annual → cycles) rather than as one PR, since it's by far the biggest surface area in this wave.
7. **Tasks**, **ActivityLog** — no financial data, no PDF, but do have the role-hierarchy logic (`assignableUsers` in Tasks) — migrate UI only, leave that logic untouched and test it explicitly post-migration.
8. **Finance**, **Receipts** — financial ledgers; both use `window.print()` (not the Puppeteer pipeline) for reports — migrate on-screen UI, leave the `window.print()` HTML-string report templates untouched exactly as Documents' PDF strings are left untouched in step 5.
9. **Attendance**, **Payroll** — saved for last on purpose: these are the highest-traffic screens (used daily/monthly by HR), the most complex (Attendance is ~1,027 lines with two view modes, dynamic column visibility, and dual sign-off; Payroll has archive/un-archive balance-reversal logic), and both are PDF-entangled with the most carefully-tuned generation logic in the whole app (`CLAUDE.md`'s documented "don't put decorative text near the signature box" rule lives here). Migrate only after every other screen has proven the primitives are solid in production use.

---

## 6. Approval checkpoints

Per the brief's explicit instruction, **no wave begins without a separate go-ahead**:
- ✅ Wave 0 can start as soon as this document is approved (it's pure, inert infrastructure).
- ⏸ Wave 1/2 pilots require approval of the specific pilot-screen list in §3.
- ⏸ Wave 3a (Toast) can likely be approved quickly given its low risk; **Wave 3b/3c (Dialog replacing `confirm()`) should get its own explicit approval separately**, given the control-flow risk called out in §4 — this is the one item in the whole plan worth a dedicated conversation before starting, not a rubber-stamp alongside everything else.
- ⏸ Each Wave 4 screen migration is proposed as its **own** reviewable change (not one giant PR for all 13 modules), following `DEVELOPMENT_RULES.md`'s existing git conventions, with a Playwright pass (both `readOnly` and editable states) before it's considered done.

---

## 7. What stays frozen, explicitly, through all four waves

Restating the brief's constraints as a concrete checklist, so every wave can be checked against it:
- ❌ No business-rule logic changes (leave balances, payroll math, visa cycle stages, overtime day=day conversion — untouched).
- ❌ No database schema, RLS, or Supabase query changes.
- ❌ No change to who can see/edit what — `readOnly`/`userRole` props keep meaning exactly what they mean today.
- ❌ No change to the Puppeteer/`window.print()` HTML-string generation paths in Attendance, Payroll, Documents, Finance, Receipts.
- ❌ No new dependency beyond `framer-motion` (already installed) without a separate ask.
- ✅ Only: shared visual tokens, shared UI primitives, and — strictly in Wave 3b/3c — the *mechanical* restructuring of `confirm()` call sites into async dialogs, with the underlying mutation logic (what gets deleted, what balance gets adjusted, in what order) preserved exactly as it is today.

---

## 8. Rough total effort

| Wave | Effort |
|---|---|
| 0 — Foundation + all 19 primitives built | ~5–7 days |
| 1/2 — Pilots on Custody/Contracts/shell | ~3–4 days |
| 3 — Toast (all modules) + Dialog (pilot + full rollout) + Tooltip/EmptyState/Skeleton | ~9–12 days |
| 4 — Full screen migration, all 13 modules, in the priority order above | ~15–20 days (Attendance and Payroll alone are ~4–5 days each given their size and PDF entanglement) |
| **Total** | **~32–43 days of focused work**, safely spreadable over many smaller, independently-reviewable sessions given §0's finding that modules don't depend on each other |

This is a plan to execute incrementally over weeks/months alongside normal feature work, not a project to block the roadmap on — every wave after Wave 0 is additive and can pause indefinitely between screens without leaving anything half-broken, because each screen migration is self-contained per §0.
