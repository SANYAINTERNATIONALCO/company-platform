# COMPONENT_LIBRARY_PLAN.md

**Status: specification only.** Every code block below is illustrative — it documents the intended API and visual behavior so it can be reviewed and approved. **No file listed here has been created.** Nothing in `app/components/*` has been changed. See `MIGRATION_STRATEGY.md` for when and in what order these actually get built and adopted.

All primitives live under a proposed `app/ui/` directory (new, additive — does not touch `app/components/`, which stays exactly as the 13 business modules). All primitives:
- Consume only the semantic tokens from `DESIGN_TOKENS.md` §2 — never a raw hex or literal px.
- Are written RTL-first using logical CSS properties (`inset-inline-start/end`, `padding-inline`, `margin-inline`), so they work correctly in this app's actual (RTL Arabic) default without a separate RTL pass.
- Accept a `readOnly`/`disabled` prop where relevant but make zero decisions about *who* is read-only — that stays in `page.tsx` and each module, per `DESIGN_FOUNDATION.md` §4.6.
- Use `framer-motion` only where real exit/enter choreography is needed (`Modal`, `Dialog`, `Dropdown`, `Tooltip`, `Toast`); everything else uses plain CSS `transition` against the motion tokens.

---

## 1. Button

**Replaces:** every literal `<button style={{...}}>` across all 13 modules — by far the most duplicated element in the codebase (60+ call sites).

**Variants:** `primary` (accent fill — replaces the `#1e40af` save/submit buttons), `secondary` (neutral outline — replaces the `#e5e7eb` cancel buttons), `success` (replaces the `#16a34a` "حفظ"/save-and-archive buttons), `danger` (replaces the `#fef2f2`/`#dc2626` delete buttons — kept as a *subtle* fill matching the app's existing convention, not a solid red, since solid red-everywhere reads as alarming at this frequency), `ghost` (new — for icon-only/inline actions like the current bare-text "طباعة"/"تعديل" triggers that today have no consistent treatment).

**Sizes:** `sm` (28px tall, `--text-xs`), `md` (36px tall, `--text-sm` — default, matches the app's current de facto button size), `lg` (44px, `--text-base` — for the two or three primary CTAs per screen, e.g. "حفظ وأرشفة كشف الشهر").

**States:** default, `:hover` (background shifts one step via `--duration-fast`/`--ease-standard` — the one truly new thing this primitive adds, since **no button in the app has a hover state today**), `:focus-visible` (2px `--color-border-focus` ring, offset 2px — replaces the *absence* of any focus ring), `:active` (subtle scale/press via `--opacity-pressed-overlay`), `disabled` (`--opacity-disabled`, `cursor:not-allowed` — replaces the several buttons today that don't visibly dim when disabled), `loading` (inline spinner + disabled, replacing the current "جارٍ الحفظ..." text-swap-in-place pattern, kept optional so existing text-swap buttons aren't forced to change on migration).

```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}
```

**Accessibility:** native `<button>` always (never a styled `<div onClick>`), `aria-busy` when `loading`, icon-only usage requires `aria-label`.

---

## 2. Input

**Replaces:** the `border:'2px solid #d1d5db'` text/number/date input pattern repeated in all 13 modules.

**Anatomy:** optional leading/trailing icon slot (new — today's search inputs have no icon, just a placeholder like "🔍 بحث..." typed into the placeholder text itself), label (see accessibility note), helper/error text slot.

**States:** default, `:hover` (border shifts to `--color-border-strong` +10%), `:focus-visible` (border → `--color-border-focus` + `--shadow-focus` ring — **the single highest-value fix in this whole plan**, since the login screen today explicitly sets `outline:'none'` with no replacement), `disabled`, `error` (border/ring → `--color-danger`, paired with inline helper text — replaces today's pattern of a field turning red only via a browser-native validation popup or a generic top-of-form `alert()`).

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leadingIcon?: React.ReactNode
  size?: 'sm' | 'md'
}
```

**Accessibility:** `label` renders a real `<label htmlFor>`, not a styled `<div>` sitting visually above the input (the current pattern in every form across the app) — this alone fixes a real gap: today's "labels" are unassociated text, so a screen reader announces the input with no name at all.

---

## 3. Textarea

**Replaces:** currently nothing directly — no module uses a multi-line field today (notes/details fields are all single-line `<input>`, e.g. `Employees.tsx`'s note field, `Contracts.tsx`'s notes field). This is a **net-new** primitive for the first module that needs a real multi-line field (Tasks' description field is the closest current candidate — it's a single-line input holding what's semantically a paragraph).

**Spec:** same visual language as `Input` (border/radius/focus states identical), auto-growing up to a `maxRows`, monospace off (`--font-sans`), `--leading-loose` for comfortable long-form Arabic reading.

```tsx
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  autoGrow?: boolean
  maxRows?: number
}
```

---

## 4. Select

**Replaces:** every `<select style={{...}}>` (employee pickers, status dropdowns, month pickers, doc-type pickers) — visually consistent with `Input` today already (same border treatment), so this is mostly a matter of adding the missing focus/hover states and, optionally, a searchable variant for the longest lists (the employee picker in Attendance/Payroll/Documents/Overtime, which today is a plain native `<select>` that gets unwieldy past ~20 names).

```tsx
interface SelectProps<T extends string> {
  label?: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; disabled?: boolean }[]
  searchable?: boolean   // opt-in — native <select> stays the default for short lists
  placeholder?: string
}
```

**Accessibility:** native `<select>` under the hood for the non-searchable case (keeps full native keyboard/screen-reader support for free); the `searchable` variant is a combobox pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`) — this is the one primitive in this plan that most benefits from being modeled directly on Radix's `Select` API rather than invented fresh.

---

## 5. Card

**Replaces:** the single most-repeated structural block in the app — "white surface + radius + shadow + optional `#f9fafb` header strip with title/count/action" — present in nearly every module (`Employees`, `Attendance`, `Payroll`, `Overtime`, `Custody`, `Contracts`, `Documents`, `Finance`, `Receipts`, `Tasks`, `ActivityLog`, `Reports`).

**Anatomy:** `Card`, `Card.Header` (title, optional count badge, optional trailing action — formalizes the exact header-strip pattern from `DESIGN_TOKENS.md` §1.8), `Card.Body`, `Card.Footer` (new — today's "totals row" at the bottom of a table sits inside the table itself; as a distinct footer slot it becomes reusable for non-table summaries too).

```tsx
<Card>
  <Card.Header title="سجلات الموظفين" count={employees.length} action={<Button size="sm">+ إضافة موظف</Button>} />
  <Card.Body>{/* table or form */}</Card.Body>
</Card>
```

**Elevation:** `--shadow-sm` default; a `flat` prop drops to `--shadow-none` + `--color-border` outline only, for cards nested inside other cards (avoids the "shadow inside shadow" muddiness that shows up today when e.g. a form panel sits inside a list card).

---

## 6. Modal

**Replaces:** nothing directly today — but it is the structural primitive `Dialog` (below), `Toast` positioning, and any future full-screen editor panel are built on. Kept as its own primitive (rather than folded into `Dialog`) because Linear/Vercel/Radix all separate "the portal + backdrop + focus-trap machinery" from "the specific dialog *content* convention" — this app currently has zero of either, so it's worth building the layers separately even though `Dialog` will be the only consumer at first.

**Behavior:** rendered via `createPortal` into a dedicated root (`<div id="overlay-root">` added once to `layout.tsx`), backdrop at `--opacity-backdrop`, closes on `Escape` and backdrop click, traps focus while open, restores focus to the triggering element on close, locks body scroll while open.

**Motion (framer-motion):** confirmed pattern from Motion's own docs — wrap in `AnimatePresence`, give the modal a stable `key`, animate backdrop opacity and content `{opacity, y: 8→0, scale: .98→1}` over `--duration-slow` with `--ease-out` on enter and `--ease-in` on exit:

```tsx
<AnimatePresence>
  {open && (
    <Modal key="modal">
      <motion.div
        initial={{ opacity: 0, y: 8, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: .98 }}
        transition={{ duration: .32, ease: [.2,0,0,1] }}
      >
        {children}
      </motion.div>
    </Modal>
  )}
</AnimatePresence>
```

---

## 7. Dialog

**Replaces:** every `window.confirm('...')` and `window.alert('...')` call in the codebase (roughly 60+ call sites across all 13 modules — the app's *entire* current confirmation/error-messaging system). This is the highest-impact single item in this whole plan for "premium enterprise feel," because native browser `confirm()`/`alert()` dialogs are the most immediately recognizable "this isn't a real app" signal in software UI — Linear, Vercel, Stripe, and Notion never use them.

**Anatomy:** built on `Modal`. `Dialog.Title`, `Dialog.Description`, `Dialog.Actions` (right-aligned in LTR, start-aligned in this app's RTL context — i.e. visually on the *left* per Arabic reading order, matching where the app's existing save/cancel button pairs already sit).

**Variants:** `confirm` (replaces `window.confirm`, e.g. *"حذف سلفة"* → title "حذف السلفة؟", description naming the specific fund code and source exactly as today's message already does, Cancel + Danger-styled Confirm), `alert` (replaces error `window.alert`), `form` (a dialog whose body is a small form — net-new, useful for e.g. a future "quick add employee" flow without leaving the current screen).

```tsx
interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  tone?: 'neutral' | 'danger'
  actions: { label: string; onClick: () => void; variant?: ButtonProps['variant'] }[]
}
```

**Accessibility:** `role="alertdialog"` for `confirm`/`alert` variants (interrupts and demands a response, matching what `window.confirm` does today but with a real accessible name/description instead of a generic browser chrome string), `role="dialog"` for `form`.

---

## 8. Badge

**Replaces:** the status-pill pattern (`borderRadius:20`, semantic bg/color pair) — already the most internally consistent pattern in the app (see `DESIGN_TOKENS.md` §1.8), so this primitive mostly just formalizes an existing convention rather than fixing a divergence.

```tsx
interface BadgeProps {
  tone: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'tertiary'
  children: React.ReactNode
  size?: 'sm' | 'md'
}
```

Maps 1:1 onto the six semantic color trios in `DESIGN_TOKENS.md` §2.1 — every existing badge usage (status labels in Attendance/Contracts/Visa/Tasks, count badges in the sidebar/Tasks tabs) becomes a direct, mechanical swap with no visual-judgment call needed.

---

## 9. Alert

**Replaces:** the inline `background:'#fef9c3'`/`'#fee2e2'`/`'#dbeafe'` banner blocks used today for the Dashboard's task/visa alert banners, Finance's low-fund warning, Contracts' expiry warning, and Visa's violation/warning strips — each currently hand-built per screen with slightly different padding/icon/border choices.

```tsx
interface AlertProps {
  tone: 'neutral' | 'success' | 'danger' | 'warning' | 'info'
  title?: string
  children: React.ReactNode
  action?: React.ReactNode  // e.g. the existing "go to Tasks" / "go to Visa" click-through buttons
  dismissible?: boolean     // new — none of today's banners can be dismissed
}
```

Visually: left-accent-bar (`--border-width-thick`, `--color-{tone}`) + tinted surface + icon — the Linear/Vercel convention for inline (non-toast) alerts, and a small but real upgrade from the current flat-tint-block-with-no-accent-edge style.

---

## 10. Table / Table Row / Table Header

**Replaces:** the hand-built `<table>` in all 13 modules — the highest-density, highest-stakes UI in this app (Payroll's table alone has 12 columns of financial data) and, per `DESIGN_FOUNDATION.md` §2, the area with the clearest reference point (Stripe Dashboard).

**`Table`** — wrapper providing the horizontal-scroll container (already present today via `overflowX:'auto'`, kept), sticky header on scroll (new), and a consistent `min-width` so columns don't collapse unreadably.

**`Table.Header`** — `background: var(--color-surface-muted)`, `font-weight: var(--weight-bold)`, `border-bottom: var(--border-width-thick) solid var(--color-border)` — this is already what the app does today; formalizing it changes nothing visually, only removes the duplication.

**`Table.Row`** — adds the two things missing from every on-screen table today: a subtle `:hover` background (`--color-surface-sunken`) so a 12-column row is trackable with the eye across its full width, and an optional zebra mode (alternating `--color-surface`/`--color-surface-sunken`) for the very densest tables (Payroll, the monthly Attendance summary).

**Numeric columns:** every cell rendering a monetary amount, day count, or ID gets `font-variant-numeric: tabular-nums` and right-alignment (in RTL, this is `text-align: end`, which — because the page is RTL — puts numbers on the *left* edge of their column, matching normal Arabic-numeral reading convention and Stripe's own RTL-dashboard behavior) — this single change is what will make Payroll's totals row and Attendance's day-counts genuinely scannable instead of merely present.

```tsx
<Table>
  <Table.Header columns={['#', 'الاسم', 'المنصب', ...]} />
  <Table.Body>
    {rows.map(r => (
      <Table.Row key={r.id} onClick={() => openDetail(r)}>
        <Table.Cell numeric>{r.amount}</Table.Cell>
        ...
      </Table.Row>
    ))}
  </Table.Body>
  <Table.Footer>{/* totals row, e.g. Payroll's existing tfoot */}</Table.Footer>
</Table>
```

---

## 11. Tabs

**Replaces:** the hand-built "pill switcher" pattern (`background:'#e5e7eb'`, `padding:4`, active tab `background:'#fff'` + `boxShadow`) used identically across `Finance` (expenses/receipts), `Documents` (create/archive), `Visa` (4 tabs), `Contracts` (active/archive), `Custody` (active/returned), `Receipts` (type picker), `Tasks` (mine/created/all), and `Attendance` (daily/monthly) — nine independent copies of the same component.

```tsx
interface TabsProps {
  value: string
  onChange: (value: string) => void
  items: { value: string; label: string; badge?: number }[]
}
```

**Motion:** the active-tab background/shadow already animates implicitly via React re-render today (a hard swap); this primitive adds a sliding indicator (`layoutId` in framer-motion, a well-known Motion pattern for exactly this "pill slides to the selected tab" effect) driven by `--duration-base`/`--ease-standard` — a small, purposeful motion touch matching `DESIGN_FOUNDATION.md` §4.3's "motion communicates state" rule (it visually answers "which tab was I on, and which did I just move to").

---

## 12. Dropdown

**Replaces:** the three independently hand-built "click outside to close" menus (`Attendance.tsx`'s month picker and employee picker, `Receipts.tsx`'s receipt-type picker), each with its own `useRef` + `mousedown` listener and its own absolute-positioned panel styling.

```tsx
interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode  // Dropdown.Item, Dropdown.CheckboxItem (for the existing multi-select month/employee pickers), Dropdown.Separator
  align?: 'start' | 'end'
}
```

**Behavior:** one shared open/close + outside-click + `Escape`-to-close + keyboard-arrow-navigation implementation replacing three near-identical ones. **Motion:** `--duration-base` fade+8px-slide via framer-motion `AnimatePresence`, `--shadow-md`, `--z-dropdown` (matching the existing `zIndex:20` the app already uses).

---

## 13. Tooltip

**Replaces:** nothing directly — today the only "tooltip-like" affordance is the native `title=""` attribute on the sidebar's collapsed icons (`title={sidebarCollapsed ? item.label : undefined}`), which is functional but has no visual design at all (whatever the OS/browser renders). **Net-new** primitive, first real use: labeling the collapsed sidebar icons properly, and adding hover-explanations to compact/ambiguous UI (e.g. the Overtime balance badges, the Payroll installment counters).

```tsx
interface TooltipProps {
  content: React.ReactNode
  side?: 'top' | 'bottom' | 'start' | 'end'
  children: React.ReactElement
}
```

**Motion:** `--duration-instant` fade, small side-aware slide, via the same `AnimatePresence` + `forceMount` pattern Motion's own docs show for Radix-style tooltips (see research note below) — deliberately the fastest animation in the whole system, since a sluggish tooltip reads as laggy rather than considered.

> Research note: Context7/Motion's official docs (`/websites/motion_dev`) confirm the `AnimatePresence` + stable `key` pattern is the correct, currently-recommended approach for both dialog-style and tooltip-style exit animations in React — this plan's `Modal`/`Dialog`/`Dropdown`/`Tooltip` motion specs all follow that confirmed pattern rather than an invented one.

---

## 14. Empty State

**Replaces:** the literal repeated string pattern `<div style={{textAlign:'center',padding:'3rem',color:'#9ca3af',fontSize:14}}>لا توجد بيانات...</div>` — present, with slightly different wording, in essentially every list across every module (empty employee list, empty task list, empty contracts archive, "لا توجد عقود نشطة — أضف أول عقد" in Contracts being the one instance today that goes slightly further and suggests an action).

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```

**Principle (Notion/Linear convention):** every empty state should, where a create action exists, surface it directly in the empty state itself (matching Contracts' one already-good instance) rather than leaving the user to notice a small "+" button elsewhere on the screen — this is a copy/UX upgrade as much as a visual one.

---

## 15. Loading Skeleton

**Replaces:** the single literal string `"جارٍ التحميل..."` ("Loading...") centered in a padded block — the app's *only* loading affordance, used identically in every one of the 13 modules for every data fetch, including ones that visibly reflow the whole layout when the real content pops in.

**Spec:** shape-matched skeletons (a table skeleton mimics row/column geometry, a card skeleton mimics the card's header+body geometry) rather than a generic spinner — this is specifically the Linear/Vercel/Notion convention (content-shaped skeletons, not a centered spinner) because it lets the user's eye pre-orient to where information will appear, and it eliminates the layout jump the current text-swap causes.

```tsx
<Skeleton.Table rows={6} columns={7} />
<Skeleton.Card />
<Skeleton.Text width="60%" />
```

**Motion:** a slow (`--duration-slower`-scale, looping) shimmer gradient sweep, respecting `prefers-reduced-motion` (falls back to a static pulse-free tint when reduced motion is requested — a real accessibility requirement this app currently has no motion at all to even need to respect, but must be honored the moment any is added).

---

## 16. Toast

**Replaces:** every success-path `alert('تم ...')` (e.g. Attendance's `"تم حفظ " + count + " سجل بنجاح"`, Payroll's archive-success message, Overtime's implicit silent success) — today, success feedback is either a blocking native `alert()` or nothing at all (many `save*` functions just close a form with no confirmation message whatsoever).

```tsx
toast.success('تم حفظ 4 سجلات بنجاح')
toast.error('خطأ: ' + error.message)  // also replaces the failure-path alert()s, non-blocking this time
```

**Anatomy:** stacked bottom-start (RTL-correct position — visually bottom-left in this app), auto-dismiss after ~4s with a pause-on-hover, manual dismiss ×, optional action link (e.g. a delete-undo, which this app has never had but which is a very cheap, very premium-feeling addition once Toast exists at all).

**Motion:** this is the primitive most directly modeled on Emil Kowalski's Sonner — enter via slide+fade from the stack edge, exit via `AnimatePresence` `layout` reflow so remaining toasts smoothly reposition rather than jump, `--duration-slow`/`--ease-spring`.

**Why this matters more than it sounds like it should:** replacing `alert()`/`confirm()` with `Dialog` + `Toast` is, on its own, most of the perceptible gap between "an internal tool" and "a product that feels built by a team that cares" — every reference system named in this plan (Linear, Vercel, Stripe, Notion) uses exactly this pairing, and none of them ever block the main thread with a native browser dialog for a routine save confirmation.

---

## 17. Sidebar Item

**Replaces:** the inline nav-button block inside `page.tsx`'s `navGroups.map(...)` render — currently a single ~30-line inline JSX block repeated (via `.map`) rather than duplicated across files, but still worth extracting because `page.tsx` is the one file every future navigation change touches, and today that logic is entangled with the icon-switch statement and badge-count rendering in the same block.

```tsx
interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  collapsed?: boolean
  badge?: number
  onClick: () => void
}
```

Visual spec matches the existing sidebar exactly (navy `--color-sidebar-bg`, active state `rgba(255,255,255,.14)`-equivalent token, red badge) — this extraction is close to a pure refactor with almost no visual change, which is exactly why it's a good low-risk pilot candidate (see `MIGRATION_STRATEGY.md`).

---

## 18. Dashboard Card (stat tile)

**Replaces:** the Dashboard's four stat-tile buttons (`employees`, `pending tasks`, `low funds`, `visa violators`) — currently four near-identical inline blocks (`icon in a colored circle` + `big number` + `label`), each independently coded in `page.tsx`.

```tsx
interface DashboardCardProps {
  icon: React.ReactNode
  iconTone: 'accent' | 'success' | 'warning' | 'danger'
  value: string | number
  label: string
  onClick?: () => void
  trend?: { direction: 'up' | 'down'; value: string } // new — no stat tile shows trend today
}
```

**Upgrade opportunity (Vercel/Stripe convention):** today's tiles show a single static number with no sense of trajectory. Where the underlying data already supports it cheaply (e.g. active-employee count vs. last month, low-fund count vs. last week), an optional trend indicator and a tiny inline sparkline are the specific Stripe/Vercel-dashboard technique for making a stat tile feel alive rather than a static label — flagged here as an *optional* enhancement, not required for the primitive to ship, since it needs a data source this app doesn't currently query.

---

## 19. (Bonus, implied by the brief) Icon system

Not in the explicit list but required by nearly every primitive above: today's icons are one large hand-drawn inline-SVG switch statement in `page.tsx` (`iconSvg()`). This plan does not propose replacing it — the existing icon set is bespoke, on-brand, and already RTL-safe. It proposes only extracting it into `app/ui/Icon.tsx` as its own primitive (same SVGs, same props) so `Sidebar Item`, `Button`'s `icon` slot, `Alert`, `EmptyState`, and `Tooltip` triggers can all consume the same icon components instead of each screen importing its own copy of the switch statement.
