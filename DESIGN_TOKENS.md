# DESIGN_TOKENS.md

**Status: proposal / specification only.** Nothing below has been written into `app/globals.css` or created as `app/tokens.css` / `app/lib/tokens.ts` yet. This document is the complete spec an approving reader can sign off on before any file is created. See `MIGRATION_STRATEGY.md` for how/when this actually lands in the repo.

---

## 1. Complete raw inventory (Phase 1)

Every literal design value found by reading all 17 files under `app/` (`page.tsx`, `layout.tsx`, `logActivity.ts`, `pdfPrint.ts`, `api/pdf/route.ts`, and all 13 `components/*.tsx`). This is the ground truth every token below is derived from — no value in §2 was invented without a corresponding row here.

### 1.1 Colors (every distinct hex literal found)

| Hex | Where seen | Apparent role |
|---|---|---|
| `#0f2557` | Sidebar background, login gradient start | Brand navy |
| `#1e40af` | Primary buttons, headings, sidebar active accent, PDF headers | Brand blue (primary) |
| `#1d4ed8` | Links, info-badge text, "المتبقي" positive values | Blue (accent-strong) |
| `#2563eb` | Dashboard alert dot, login gradient mid | Blue (mid) |
| `#3b82f6` | Login gradient end, secondary blue button gradient | Blue (accent) |
| `#93c5fd` | Dashed upload-button borders, range slider accents | Blue (border/tint-strong) |
| `#bfdbfe` | Badge borders, card borders | Blue (border/tint) |
| `#dbeafe` | Badge/alert backgrounds | Blue (surface tint) |
| `#eff6ff` | Alert/callout backgrounds, hover-equivalent backgrounds | Blue (surface tint, lightest) |
| `#15803d` | Success text, "نشط"/"حاضر" status text | Green (strong) |
| `#16a34a` | Primary "save"/confirm button fill | Green (button) |
| `#86efac` | Success badge/button borders | Green (border) |
| `#dcfce7` | Success badge/alert backgrounds | Green (surface tint) |
| `#dc2626` | Danger text, delete button text, absence/violation indicators | Red (strong) |
| `#fca5a5` | Danger button/badge borders | Red (border) |
| `#fee2e2` | Danger badge/alert backgrounds | Red (surface tint) |
| `#fef2f2` | Delete-button fill (outline-style) | Red (surface tint, lightest) |
| `#b45309` | Warning text, "قريب من الانتهاء" indicators | Amber (strong) |
| `#d97706` | Rare — one "unsaved changes" label | Amber (mid, underused) |
| `#fcd34d` | Warning badge/alert borders | Amber (border) |
| `#fef9c3` | Warning badge/alert backgrounds | Amber (surface tint) |
| `#7c3aed` | Purple accent (Reports chart series, rotation-shift badge, detail-report button) | Purple (strong) |
| `#c4b5fd` | Purple badge/button borders | Purple (border) |
| `#ede9fe` | Purple badge/icon-tile backgrounds | Purple (surface tint) |
| `#0891b2` | Cyan text (rotation shift indicator) | Cyan (strong) |
| `#0e7490` | Cyan text (compensatory-leave status) | Cyan (strong, alt) |
| `#cffafe` | Cyan badge backgrounds | Cyan (surface tint) |
| `#111827` | Primary body/heading text | Neutral (ink) |
| `#374151` | Secondary text, form labels, table header text | Neutral (ink-soft) |
| `#4b5563` | Rare, one label variant | Neutral (ink-soft, unused duplicate) |
| `#6b7280` | Muted text, helper copy, placeholders-adjacent | Neutral (ink-muted) |
| `#9ca3af` | Faint text, disabled-adjacent, row index numbers | Neutral (ink-faint) |
| `#d1d5db` | Input borders (2px, the dominant input border color) | Neutral (border-strong) |
| `#e5e7eb` | Card/table/divider borders (1–2px, the dominant divider) | Neutral (border) |
| `#f0f4f8` | App page background | Neutral (canvas) |
| `#f3f4f6` | Table header background, neutral chip background | Neutral (surface-2) |
| `#f9fafb` | Card header strip background, subtle zebra (print only) | Neutral (surface-1) |
| `#ffffff` | Card/page/input backgrounds | Neutral (surface-0) |

**34 distinct hex values, zero named tokens, zero documented pairing rule.** The pairing rule *is* discoverable (every semantic color = one strong text tone + one pale surface tone + occasionally a mid-tone border) — §2.1 formalizes exactly that pattern that was already implicitly followed by hand.

### 1.2 Font sizes (px, literal)
`10, 11, 12, 13, 14, 15, 16, 17, 20, 22, 24, 26, 28, 48` — 14 distinct values for what functionally serves ~6 typographic roles (micro-label, caption, body-small, body, heading-small, heading-large/stat).

### 1.3 Font weights
`400` (implicit/default), `500`, `600`, `700`. Applied inconsistently to the same semantic role across files (card titles vary between `600` and `700`; table headers are `700` everywhere they appear, which is actually the one weight assignment that's already fully consistent).

### 1.4 Spacing (px, literal, as padding/margin/gap)
`2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32` — 17 distinct values. Roughly clusters around a 2px base grid, but `7, 9, 11, 14, 18, 22` break a clean 4/8pt system, which is why nominally-equal gaps in different files are visibly, if subtly, uneven.

### 1.5 Border radius (px, literal)
`4, 6, 7, 8, 9, 10, 12, 14, 16, 20` — 10 distinct values with no assigned role (a card is `12` in `Employees.tsx`, `14` in `Attendance.tsx`, `16` in `Overtime.tsx`, for the identical "card" role).

### 1.6 Shadows (literal strings)
```
0 2px 8px rgba(0,0,0,0.08)   /* most common — "elevated card" */
0 1px 3px rgba(0,0,0,0.05)   /* dashboard stat tiles */
0 1px 3px rgba(0,0,0,0.1)    /* active tab pill */
0 1px 4px rgba(0,0,0,0.06)   /* sticky top bar */
```
Four values, no scale, no naming — all single-layer (real elevation systems at this quality bar use 2–3 stacked shadows; see §2.5).

### 1.7 Transitions / animation (literal, exhaustive)
```
background 0.15s, color 0.15s     /* sidebar nav item, driven by active-state class-equivalent, not :hover */
width 0.2s, min-width 0.2s        /* sidebar collapse */
transform 0.2s                    /* one chevron rotate */
```
That is the **entire** motion vocabulary of the application today. No easing curve is ever specified (all three default to CSS `ease`). No component has a real `:hover`/`:focus-visible` transition. No component has an enter/exit animation. No skeleton, spinner, or progress affordance exists anywhere except the literal text string "جارٍ التحميل..." ("Loading...").

### 1.8 Structural component patterns (already-consistent, ready to formalize)
- **Card header strip**: `background:'#f9fafb'`, `borderBottom:'2px solid #e5e7eb'`, `padding:'14–16px 20px'`, containing `<h2/h3>` + optional count + right-aligned primary action button. Appears in essentially every module.
- **Status pill**: `borderRadius:20`, `padding:'3–5px 10–14px'`, `fontSize:11–13`, `fontWeight:600–700`, background/color drawn from one semantic pair in §1.1. The single most consistently-applied pattern in the app.
- **Input**: `border:'2px solid #d1d5db'`, `borderRadius:6–10`, `padding:'6–11px 8–14px'`, `fontSize:12–14`. No focus style anywhere; explicitly disabled (`outline:'none'`) on the login screen with nothing put in its place.
- **Table**: header `background:'#f3f4f6'`, `fontWeight:700`, `borderBottom:'2px solid #e5e7eb'`; rows `borderBottom:'1px solid #e5e7eb'` only, no zebra, no hover, numbers not tabular.

---

## 2. Token architecture

Two layers, matching how every mature design system (Linear, Vercel, Stripe, Radix) actually structures tokens:

- **Primitive tokens** — raw values, no meaning attached (`--blue-600: #1e40af`). Never referenced directly by a component.
- **Semantic tokens** — meaning-carrying aliases that point at a primitive (`--color-accent: var(--blue-600)`). **Always** what a component references. This indirection is what lets dark mode, rebranding, or a future contrast fix happen by changing one alias file, not 200 call sites.

Delivery mechanism (see `DESIGN_FOUNDATION.md` §4): CSS custom properties in `app/tokens.css` (imported once by `app/globals.css`), consumed directly inside existing inline `style={{}}` objects as `style={{ color: 'var(--color-danger)' }}` — this requires zero new tooling and works in every browser this app already targets. A parallel `app/lib/tokens.ts` exports the same values as plain JS/TS for the rare spots that need numeric math (e.g. multiplying a signature-scale factor, or computing `50 * scale` px for a PDF template string, which happens today in `Attendance.tsx`/`Payroll.tsx`/`Documents.tsx`).

### 2.1 Color

**Primitives** (the 34 raw hexes from §1.1, deduplicated and given a neutral name + numeric step, dark-mode pair included from day one):

```css
:root {
  /* Neutral (cool-grey, matches the app's existing #f0f4f8 canvas undertone) */
  --grey-0:  #ffffff;
  --grey-25: #f9fafb;
  --grey-50: #f3f4f6;
  --grey-75: #eef1f6;
  --grey-100:#e5e7eb;
  --grey-200:#d1d5db;
  --grey-300:#9ca3af;
  --grey-400:#6b7280;
  --grey-500:#4b5563;
  --grey-600:#374151;
  --grey-700:#1f2430;
  --grey-800:#111827;
  --grey-900:#0b0e14;

  /* Brand blue */
  --blue-50: #eff6ff;
  --blue-100:#dbeafe;
  --blue-200:#bfdbfe;
  --blue-300:#93c5fd;
  --blue-500:#3b82f6;
  --blue-600:#2563eb;
  --blue-700:#1d4ed8;
  --blue-800:#1e40af;
  --blue-900:#0f2557;

  /* Semantic hues — each kept to the 3 steps actually used (tint / strong / border) */
  --green-50:#dcfce7;  --green-500:#16a34a; --green-600:#15803d; --green-300:#86efac;
  --red-50:  #fef2f2;  --red-100:#fee2e2;   --red-500:#dc2626;   --red-300:#fca5a5;
  --amber-50:#fef9c3;  --amber-500:#b45309; --amber-300:#fcd34d;
  --violet-50:#ede9fe; --violet-500:#7c3aed;--violet-300:#c4b5fd;
  --cyan-50: #cffafe;  --cyan-500:#0891b2;  --cyan-600:#0e7490;
}
```

**Semantic aliases** — the layer components actually use:

```css
:root {
  /* Canvas & surfaces */
  --color-canvas:        var(--grey-75);   /* app background, was ad hoc #f0f4f8 — nudged to sit on-scale */
  --color-surface:       var(--grey-0);    /* card/input background */
  --color-surface-sunken:var(--grey-25);   /* card header strips, subtle zebra */
  --color-surface-muted: var(--grey-50);   /* table header background */

  /* Text */
  --color-text:          var(--grey-800);
  --color-text-secondary:var(--grey-600);
  --color-text-muted:    var(--grey-400);
  --color-text-faint:    var(--grey-300);
  --color-text-on-accent:var(--grey-0);
  --color-text-on-dark:  rgba(255,255,255,.92);

  /* Borders */
  --color-border:        var(--grey-100);
  --color-border-strong: var(--grey-200);
  --color-border-focus:  var(--blue-500);

  /* Brand / accent */
  --color-accent:        var(--blue-800);  /* = existing #1e40af, unchanged on purpose */
  --color-accent-hover:  var(--blue-700);
  --color-accent-subtle: var(--blue-50);
  --color-accent-border: var(--blue-200);
  --color-sidebar-bg:    var(--blue-900);  /* = existing #0f2557, unchanged on purpose */

  /* Semantic states — each a {text, surface, border} trio, replacing the ad hoc pairs in §1.1 */
  --color-success:        var(--green-600);
  --color-success-surface:var(--green-50);
  --color-success-border: var(--green-300);
  --color-success-solid:  var(--green-500); /* button fills */

  --color-danger:        var(--red-500);
  --color-danger-surface:var(--red-100);
  --color-danger-surface-subtle: var(--red-50);
  --color-danger-border: var(--red-300);

  --color-warning:        var(--amber-500);
  --color-warning-surface:var(--amber-50);
  --color-warning-border: var(--amber-300);

  --color-info:           var(--violet-500);
  --color-info-surface:   var(--violet-50);
  --color-info-border:    var(--violet-300);

  --color-tertiary:         var(--cyan-600); /* rotation-shift / compensatory-leave accents */
  --color-tertiary-surface: var(--cyan-50);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-canvas:  #0d1117;
    --color-surface: #151b23;
    --color-surface-sunken: #1b222c;
    --color-surface-muted:  #1f2733;
    --color-text:           #e6e9ef;
    --color-text-secondary: #aab2c0;
    --color-text-muted:     #7b8494;
    --color-text-faint:     #565f70;
    --color-border:         #232a37;
    --color-border-strong:  #313a4a;
    --color-accent:         #6f95e8;
    --color-accent-hover:   #86a6ee;
    --color-accent-subtle:  #17233f;
    --color-accent-border:  #2c3f6e;
    /* semantic states get the same treatment: lift lightness, drop saturation on the surface, keep hue */
    --color-success: #6fd08c; --color-success-surface:#132a1c; --color-success-border:#204a30; --color-success-solid:#2f9c53;
    --color-danger:  #ef6a5f; --color-danger-surface:#33191a;  --color-danger-surface-subtle:#241214; --color-danger-border:#5a2a29;
    --color-warning: #e0a94f; --color-warning-surface:#2e2313; --color-warning-border:#4d3a1c;
    --color-info:    #a98af0; --color-info-surface:#241c3a;    --color-info-border:#3a2d5c;
    --color-tertiary:#59c2d0; --color-tertiary-surface:#12262a;
  }
}
:root[data-theme="dark"]  { /* same block as above, for an explicit toggle once one exists */ }
:root[data-theme="light"] { /* re-declares the light block, to win over OS preference */ }
```

**Rule going forward:** a component may only reference a `--color-*` semantic token, never a `--grey-*`/`--blue-*`/etc. primitive directly, and never a raw hex. This single rule is what stops the next developer (human or agent) from adding hex value #35 to the pile.

### 2.2 Typography

```css
:root {
  --font-sans: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; /* unchanged — already correct for Arabic + Latin mixed content */
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Consolas", monospace; /* new — for amounts/IDs/receipt numbers, see §2.2 rule below */

  /* Type scale — a real modular scale (~1.125 ratio) replacing the 14 ad hoc sizes in §1.2 */
  --text-2xs:   11px;  /* micro-labels, table meta */
  --text-xs:    12px;  /* captions, helper text, badges */
  --text-sm:    13px;  /* secondary body, table cells */
  --text-base:  14px;  /* default body — matches the app's current de facto default */
  --text-md:    15px;  /* card titles, section labels */
  --text-lg:    17px;  /* screen titles */
  --text-xl:    20px;  /* dashboard section headers */
  --text-2xl:   24px;  /* rare emphasis (login title) */
  --text-3xl:   32px;  /* dashboard hero stat numbers — replaces the ad hoc 48px, intentionally reined in */

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  --leading-tight:  1.2;  /* headings */
  --leading-normal: 1.5;  /* body */
  --leading-loose:  1.75; /* long-form Arabic paragraphs — Documents/Contracts notes */

  --tracking-normal: 0;
  --tracking-wide:   .02em; /* uppercase micro-labels only */
}
```

**Rule:** every numeric font-size in a migrated component becomes one of the 9 tokens above — no new literal px value is introduced. **New rule this system adds:** any column of monetary or count figures (Payroll, Finance, Reports tables) gets `font-variant-numeric: tabular-nums` plus `--font-mono` for amounts specifically — the one typographic technique this app has zero instances of today, and the single highest-leverage fix for Stripe-grade table legibility.

### 2.3 Spacing

A strict 4px base grid, replacing the 17 ad hoc values in §1.4:

```css
:root {
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```
Off-grid values like the app's current `9px`/`11px`/`18px`/`22px` round to their nearest neighbor (`8`/`12`/`16`/`20`) during migration — a deliberate, tiny, near-invisible tightening that is exactly what makes a screen start to feel "considered" rather than "close enough."

### 2.4 Radius

```css
:root {
  --radius-xs: 4px;   /* checkboxes, small chips */
  --radius-sm: 6px;   /* inputs, buttons */
  --radius-md: 8px;   /* default — buttons, inputs, small cards */
  --radius-lg: 12px;  /* cards, modals */
  --radius-xl: 16px;  /* large panels, the login card */
  --radius-full: 999px; /* pills/badges/avatars */
}
```
Five steps, replacing the 10 ad hoc values in §1.5. `--radius-md` becomes the default for anything currently `8/9/10`; `--radius-lg` absorbs `12/14`; `--radius-xl` absorbs `16`.

### 2.5 Shadow (elevation scale)

Real design systems layer 2–3 shadows (a tight, dark, low-blur one for definition + a soft, diffuse one for lift) rather than one flat value — this is the single biggest reason Linear/Vercel cards look "expensive" next to a single-`box-shadow` card that is otherwise identical:

```css
:root {
  --shadow-none: none;
  --shadow-xs: 0 1px 2px rgba(15,23,42,.04);
  --shadow-sm: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06);   /* replaces the 4 ad hoc "card" shadows */
  --shadow-md: 0 2px 4px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.08); /* dropdown, popover */
  --shadow-lg: 0 8px 16px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.06);/* modal */
  --shadow-focus: 0 0 0 3px var(--color-accent-subtle); /* focus ring, see §2.7 */
}
@media (prefers-color-scheme: dark) {
  :root {
    --shadow-xs: 0 1px 2px rgba(0,0,0,.3);
    --shadow-sm: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.4);
    --shadow-md: 0 2px 4px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.45);
    --shadow-lg: 0 8px 16px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.4);
  }
}
```

### 2.6 Opacity

```css
:root {
  --opacity-disabled: .5;   /* new — no component today dims disabled state */
  --opacity-hover-overlay: .06;
  --opacity-pressed-overlay: .1;
  --opacity-backdrop: .4;   /* modal/dialog backdrop — new pattern */
}
```

### 2.7 Borders

```css
:root {
  --border-width-thin: 1px;
  --border-width-default: 1.5px; /* replaces the inconsistent 1px-vs-2px split in §1.8 with one default */
  --border-width-thick: 2px;     /* reserved for emphasis states (active tab underline, selected row) */
}
```
Rule: inputs get `--border-width-default` + `--color-border-strong`; cards/dividers get `--border-width-thin` + `--color-border`. This directly resolves the 1px-vs-2px inconsistency documented in §1.8.

### 2.8 Motion — duration & easing

```css
:root {
  --duration-instant: 100ms; /* micro feedback: checkbox check, badge pop */
  --duration-fast:    150ms; /* hover/focus color changes — this is the value the sidebar already uses; keep it */
  --duration-base:    200ms; /* dropdown/tooltip open, tab switch */
  --duration-slow:    320ms; /* modal/dialog enter, toast enter */
  --duration-slower:  450ms; /* full-panel or page-level transitions, used sparingly */

  --ease-standard: cubic-bezier(.2,0,0,1);   /* Linear/Radix-style "decelerate" — the default for anything appearing */
  --ease-out:      cubic-bezier(0,0,.2,1);   /* entrances */
  --ease-in:       cubic-bezier(.4,0,1,1);   /* exits */
  --ease-spring:   cubic-bezier(.16,1,.3,1); /* Emil-Kowalski-style toast/dialog "settle" — used only via framer-motion's `type:'spring'`, not raw CSS */
}
```
`framer-motion` is the implementation vehicle **only** for the primitives that need real spring physics or exit-animation coordination (`Modal`, `Toast`, `Dropdown`, `Tooltip` — see `COMPONENT_LIBRARY_PLAN.md`). Plain CSS `transition` with the tokens above is correct for everything else (hover/focus color shifts, tab-underline slide) — this keeps the bundle-size cost of the animation library scoped to where it earns its weight, matching the "no code-splitting yet" constraint already flagged in `PROJECT_ARCHITECTURE_REPORT.md` (don't make that problem worse by using a JS animation library for a CSS-only job).

### 2.9 Breakpoints

The app has no responsive strategy today beyond `overflow-x:auto` on wide tables. Tokens are defined now so future responsive work has a fixed vocabulary rather than another set of ad hoc `900px`/`768px` literals:

```css
:root {
  --bp-sm: 640px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1280px;
}
```
(CSS custom properties can't be used inside `@media` query conditions directly — these are documented as the canonical numbers to hand-type into `@media (min-width: 768px)` etc., and mirrored as plain numbers in `tokens.ts` for any JS-side `matchMedia` use.)

### 2.10 Z-index

No z-index scale exists today; dropdown menus use ad hoc `zIndex:20` values with the sticky top bar at `zIndex:10` — already a near-collision. Fixed scale:

```css
:root {
  --z-base: 0;
  --z-sticky: 10;      /* sticky sidebar, top bar — matches existing usage */
  --z-dropdown: 20;    /* matches existing usage */
  --z-overlay: 30;      /* modal/dialog backdrop */
  --z-modal: 40;
  --z-toast: 50;
  --z-tooltip: 60;
}
```

---

## 3. `tokens.ts` mirror (for JS-side math only)

```ts
// app/lib/tokens.ts — proposed, not yet created
export const tokens = {
  color: {
    accent: 'var(--color-accent)',
    danger: 'var(--color-danger)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    // ...mirrors every semantic alias in §2.1; components should prefer the CSS var string
    // directly in style={{}} and only import this object when a *number* is needed.
  },
  space: { 0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 },
  radius: { xs:4, sm:6, md:8, lg:12, xl:16, full:999 },
  duration: { instant:100, fast:150, base:200, slow:320, slower:450 },
  breakpoint: { sm:640, md:768, lg:1024, xl:1280 },
  zIndex: { base:0, sticky:10, dropdown:20, overlay:30, modal:40, toast:50, tooltip:60 },
} as const
```

## 4. Migration mapping (old value → token)

A quick-reference table for whoever migrates the first component (see `MIGRATION_STRATEGY.md`) — every old literal maps to exactly one new token, so no judgment call is needed mid-migration:

| Old literal | New token |
|---|---|
| `#1e40af` | `var(--color-accent)` |
| `#f0f4f8` | `var(--color-canvas)` |
| `#e5e7eb` (1–2px border) | `var(--color-border)` |
| `#d1d5db` (input border) | `var(--color-border-strong)` |
| `#dc2626` / `#fee2e2` / `#fca5a5` | `var(--color-danger)` / `var(--color-danger-surface)` / `var(--color-danger-border)` |
| `#15803d` / `#dcfce7` / `#86efac` | `var(--color-success)` / `var(--color-success-surface)` / `var(--color-success-border)` |
| `#b45309` / `#fef9c3` / `#fcd34d` | `var(--color-warning)` / `var(--color-warning-surface)` / `var(--color-warning-border)` |
| `borderRadius: 8/9/10` | `var(--radius-md)` |
| `borderRadius: 12/14` | `var(--radius-lg)` |
| `borderRadius: 16` | `var(--radius-xl)` |
| `borderRadius: 20` (pills) | `var(--radius-full)` |
| `0 2px 8px rgba(0,0,0,0.08)` and the other 3 card shadows | `var(--shadow-sm)` |
| `fontSize: 11/12` | `var(--text-xs)` |
| `fontSize: 13` | `var(--text-sm)` |
| `fontSize: 14` | `var(--text-base)` |
| `fontSize: 15` | `var(--text-md)` |
| `fontSize: 17` | `var(--text-lg)` |
| `fontSize: 20/22` | `var(--text-xl)` |
| `fontSize: 24/26/28/48` | `var(--text-2xl)` or `var(--text-3xl)` (case-by-case — this is the one row that needs a human/agent judgment call, since the app's current large sizes are inconsistent enough to not collapse cleanly) |
