# Company Platform — UI/UX Design Audit

**Overall score: 3.9/10** — functional and reasonably disciplined where it matters most (RTL alignment, semantic status colors, the sidebar), but built entirely with hand-typed inline styles and no shared design tokens. Every finding below traces back to the same root cause, repeated across nine independently-built sections.

Method: full source read of `app/page.tsx` and every file in `app/components/`, no code changed. Posture: pre-approval — nothing in this document has been applied to the codebase.

## Score by category

| Category | Score |
|---|---|
| Visual hierarchy | 5/10 |
| Typography | 3/10 |
| Whitespace | 4/10 |
| Alignment | 6/10 |
| Colors | 4/10 |
| Shadows | 4/10 |
| Border radius | 3/10 |
| Tables | 4/10 |
| Forms | 3/10 |
| Dashboard | 5/10 |
| Navigation | 6/10 |
| Information density | 4/10 |
| User flow | 4/10 |
| Motion opportunities | 2/10 |
| Accessibility | 3/10 |
| Consistency | 3/10 |

---

## Visual language
*Colors · Shadows · Border radius*

The semantic layer — red means danger, green means active, amber means pending — is solid and held everywhere. The structural layer — what blue is "the" brand color, what radius makes something a card vs. a button vs. a badge — was never decided once, so it got decided nine times.

### Five different blues are all "primary" — Colors
```
page.tsx:313   login gradient: #0f2557 → #1e40af → #2563eb
page.tsx:334   login button: #1e40af → #3b82f6
page.tsx:453   dashboard heading: #0f2557 (used as a background everywhere else)
Employees/Visa/Tasks/Custody.tsx   primary buttons: #1e40af
Employees.tsx:290, Finance.tsx:707   link text: #1d4ed8
```
A new screen has no way to know which blue to reach for, because there's no single one — there are five, each chosen locally by whoever built that screen that day. The tell is the dashboard heading: it reuses the sidebar's navy (`#0f2557`) as text color, a value that means "background" everywhere else in the app.

**How Linear does it:** one accent, referenced by name (`--color-accent`), never a fourth or fifth hand-picked blue. Every "primary" surface — button, link, focus ring, active tab — draws from the same token, so recoloring the brand is a one-line change, not a grep-and-hope.

### Nine border-radius values with no assigned meaning — Border radius
4, 6, 8, 9, 10, 12, 14, 16, and 20px all appear as "the" radius for cards, buttons, or panels — sometimes for the identical element type on the very next screen.
```
Cards app-wide: 12px (Employees, Visa, Tasks, Finance, Custody, Receipts, Reports)
Dashboard stat-card buttons: 14px — Dashboard alert panels: 16px
Login card: 20px — the exact value used elsewhere only for pill badges
```
Radius is one of the fastest signals a user reads for "what kind of thing is this." When the login page's main container borrows the pill-badge radius, it reads — even subliminally — as a chip, not a destination.

**How Stripe does it:** a radius scale, not a value — 4 for inline controls, 8 for cards, 12 for modals/overlays, and a dedicated 999px for pills. Three sizes cover the entire product.

### Two competing "card shadow" values, no elevation system — Shadows
Seven of eight sections use `0 2px 8px rgba(0,0,0,0.08)` for the standard white card; Reports.tsx uses the same shadow at `0.06` alpha for a visually identical card. Everything else — the login card's heavy 60px-blur shadow, the button's own colored glow, the sidebar's sideways shadow — is a one-off, not a step in a scale.

**How Notion does it:** two shadow tiers, period — resting (barely-there, for cards on the page) and raised (for anything that floats: menus, dialogs).

---

## Type & layout
*Typography · Whitespace · Alignment · Visual hierarchy*

RTL is handled correctly and consistently — real, non-trivial work that shows. But there's no defined type scale underneath it, so the same sentence in two different tables can be 13px in one and 14px in the other for no nameable reason.

### Fifteen font sizes, no scale — Typography
10, 11, 12, 13, 14, 15, 16, 17, 20, 22, 24, 26, 28, 40, 48 all appear as hard-coded numbers. Table body text is 13px in Employees.tsx and 14px in Tasks.tsx for the same role. Dashboard stat numbers are 24px; Visa's near-identical stat numbers are 26 or 28px; Reports' are 22px — four sizes doing one job.

**How Vercel does it:** a named scale — caption / body / label / heading-sm / heading-lg — each bundling a fixed size, weight, and line-height. Nobody picks a raw number; they pick a role, and the number follows.

### Spacing has no unit — Whitespace
Padding values include 5, 7, 9, 14, 18px alongside clean multiples of 4 — an off-grid number every few lines. The one thing held consistently is the 24px outer card margin, undermined by everything inside that card following no grid at all.

**How Linear does it:** a strict 4px base unit. Every padding, gap, and margin is a multiple of it — costs nothing to follow, buys a rhythm the eye picks up on immediately.

### Stat numbers don't form a hierarchy of importance — Visual hierarchy
Visa.tsx's "total foreigners" hero number is 48px — the single largest text in the app — but sits in the same visual weight class as half a dozen lesser stat numbers nearby at 26–28px, none meaningfully less important to a reader scanning the page.

**How Stripe does it:** exactly one hero metric per screen gets the largest size; everything else steps down at least one full scale.

---

## Data & input patterns
*Tables · Forms*

This is where the lack of a shared component library costs the most. Every table and every input is retyped from scratch in every file — in effect, eight tables and five text-input styles all trying to be the same thing.

### No shared table component — and no hover state, anywhere — Tables
The header-row background (`#f3f4f6`) is consistent but copy-pasted verbatim into every file rather than shared. Cell padding drifts across three values (`12px 16px` / `10px 14px` / `9px 12px`) for the same row type. No table row anywhere responds to the cursor — row tint only ever comes from data state (a violated visa, a missing amount), never from the user pointing at a row they're about to act on.

**How Linear does it:** every list row highlights on hover before you commit to a click — a near-zero-cost signal that says "this is what you're about to select."

### No focus state exists anywhere in the product — Forms
The login screen's email and password fields set `outline: none` and supply no replacement — a keyboard user tabbing to the password field gets no visible indication they're there. This isn't unique to login; it's app-wide. No input, select, or button has a focus ring, a hover shift, or a pressed state. Disabled buttons carry the `disabled` attribute but no visual change.

**Why it matters beyond aesthetics:** this is a real accessibility gap, not just a polish gap — a keyboard-only user currently cannot tell where they are on the login screen.

**How Raycast does it:** a single consistent focus ring color, used identically on every interactive element, never removed without a replacement.

### Five hand-typed copies of "the text input" — Forms
Employees, Visa, Tasks, and Custody each independently define an identical `inputStyle` constant. Finance and Receipts define a fifth variant, 1–2px off in padding and font size for no functional reason — just drift from being retyped instead of shared.

**How Notion does it:** one input primitive, used everywhere, so a change to border color or radius is a single edit every form inherits automatically.

---

## Product structure
*Dashboard · Navigation · Information density*

The sidebar is the best-built surface in the app — the only place with intentional motion and a genuinely coherent interaction model. The dashboard, by contrast, undersells the data it has access to.

### The dashboard shows counts, never trends — Dashboard, Information density
Four stat cards, each a single raw number (headcount, open tasks, fund balance, active visas) with no delta, no sparkline, no "up from last month." For a tool an HR manager opens daily, the dashboard currently answers "what is the number" but never "should I care about it today."

**How Stripe does it:** every dashboard number carries a same-period comparison and a tiny inline sparkline.

### Dashboard radius and shadow quietly diverge from the rest of the app — Dashboard
The one screen every user sees first uses 14px card radius and a 0.05-alpha shadow — both unique to that screen — while every other section has settled on 12px and 0.08.

### Native browser dialogs break the product's visual world at the highest-stakes moments — User flow
Every delete action — removing an employee record, a payroll archive, a signed document — routes through the browser's own `confirm()` dialog: unstyled, not RTL-aware, and visually unrelated to the Arabic interface it interrupts.

**How Linear and Notion do it:** an in-product confirmation surface, styled and RTL-correct like everything else, that names the specific thing being deleted rather than a generic "Are you sure?"

---

## Interaction quality
*Motion · Accessibility · Consistency*

Across the entire product, four transitions exist, and three of them are on the sidebar. Nothing else moves, loads progressively, or confirms an action beyond swapping a button's label text.

### "Loading" and "empty" are always plain centered text — Motion, Accessibility
Every one of the eight reviewed sections shows "جارٍ التحميل..." (loading) or "لا توجد بيانات" (no data) as static gray text — never a skeleton, spinner, or shimmer. Because the product has no CSS file at all, it currently has no way to author a spinner even if one were wanted.

**How Linear does it:** skeleton rows shaped like the table about to appear, so the layout doesn't jump when data lands.

### The recurring diagnosis: nothing is wrong, nothing was decided once — Consistency
Every finding above is a variation on one root cause: there is no shared file of colors, spacing, radius, shadow, or type that any component imports from. Each section was built correctly in isolation, by copying the nearest existing pattern and adjusting it slightly — exactly how five blues, nine radii, and fifteen font sizes accumulate without anyone ever making a wrong individual decision.

---

## Roadmap

Ordered so each tier makes the next one cheaper. P0 is entirely a documentation-and-constants exercise — no visual risk, and it's what every later fix will reference.

### P0 — Foundation (low risk, unlocks everything below)
1. **One token file** — collapse the five blues, nine radii, and fifteen font sizes into a single named set every component references.
2. **Visible focus state everywhere** — restore what login's `outline:none` removed, app-wide. Accessibility fix, not a design opinion.
3. **One input, one table style** — extract the shared input and table-header patterns that already exist in five near-identical copies.

### P1 — High-impact (visible, moderate effort)
4. **Row hover states** — every table gains a hover tint. The single highest-leverage "feels premium" change available.
5. **Replace `confirm()`/`alert()`** — an in-product, RTL-correct confirmation surface for deletes and archives.
6. **Skeleton loading states** — replace "جارٍ التحميل..." with shapes matching the table or card about to render.

### P2 — Polish (differentiating, do last)
7. **Dashboard trend deltas** — pair every stat card with a comparison or sparkline, not just a raw count.
8. **Micro-interactions** — button press, card lift, tab-switch, 120–150ms, matching the sidebar's existing transitions.
9. **Align the dashboard to the token file** — bring its one-off 14/16px radii and 0.05 shadow back into the P0 scale.

---

*Nothing in this document has been applied to the codebase. This is the review only.*
