# DEVELOPMENT_RULES.md — Instructions for AI Agents

This document is written **for AI coding agents** (Claude Code or otherwise) working on this repository. It complements `CLAUDE.md`, which is the source of truth for *domain and business rules* (Arabic status literals, payroll math, visa cycle stages, PDF signature-placement gotcha, deployment steps). Read `CLAUDE.md` first. This document is about **how to write code and use tools here**, derived from the patterns already established across the 17 files under `app/` and the live Supabase schema — not a wishlist, a description of the conventions this codebase actually follows, plus where to be careful about repeating its known, tracked problems.

If you haven't already, also read `PROJECT_ARCHITECTURE_REPORT.md` — it documents the current architecture and a ranked list of 26 known issues. Several rules below exist specifically to stop those issues from getting worse.

---

## Coding Conventions

- TypeScript, `'use client'` function components with hooks only — no class components, no server components for the app's UI (the only server code is `app/api/pdf/route.ts`).
- Return type `React.ReactElement`, **never** `JSX.Element` — the build fails with `JSX.Element` in this TS config. This is non-negotiable per `CLAUDE.md`.
- `npm run build` must succeed locally before any `git push` — Vercel deploys automatically on push to the tracked branch, so a broken build ships.
- Named `async function` handlers (`async function loadEmployees() {...}`), not anonymous arrow functions assigned to `const`, for anything beyond a one-line callback — matches the style of every existing component.
- Style with inline `style={{...}}` objects, not Tailwind utility classes, even though Tailwind is installed. It is intentionally unused; don't introduce a second styling system in a feature PR.
- `any` is used at Supabase row-mapping boundaries throughout this codebase (`(data as Employee[]) || []`, `.forEach((r: any) => ...)`). Matching that at the query boundary is fine; don't let `any` leak into business logic beyond that boundary.
- This codebase deliberately favors direct, slightly repetitive code over abstraction. Don't introduce generic frameworks, HOCs, render props, or a shared "engine" for something only one or two components do — see Component Design below.

## Naming Conventions

- Components: PascalCase, one per file, filename matches the default export (`Employees.tsx` → `Employees`).
- Functions: camelCase, verb-first (`loadEmployees`, `saveAll`, `handleSignatureUpload`, `deleteArchive`).
- Booleans: prefixed `is`/`has`/`should`/`can` (`isReadOnly`, `isArchivedMonth`, `canManageThis`, `canCreateTasks`).
- Database identifiers: snake_case, matching Postgres convention already in use. Never introduce a camelCase column or table.
- **Arabic literal values stored in the database are data, not copy** — attendance status strings, visa cycle `status`, task `priority`/`status`, receipt-type codes, and the 5-value `user_roles.role` list must match `CLAUDE.md`'s canonical spelling exactly, character for character, everywhere they're compared or inserted. Never "clean up," retranslate, or rename a stored Arabic literal — it's a `CHECK` constraint value, a view column name, or both.
- React state: plain `useState` pairs (`[value, setValue]`) — no external state library exists in this project; don't add one for a single feature.

## Architecture Principles

- The app is architecturally a single-page app on purpose: one real route (`/`), one API route (`/api/pdf`). Section switching in `page.tsx` is a `useState` string, not Next.js routing. **Do not add a new App Router page/route for a feature** — a move toward multi-route architecture is a deliberate, larger decision the user needs to make explicitly, not something to introduce as a side effect of adding one module.
- A new functional module follows the existing shape: one self-contained `app/components/X.tsx` that owns its own Supabase queries, local state, and render logic, and receives `readOnly` (and `userRole` if it needs role-specific behavior) as props from `page.tsx`. It is then wired into `page.tsx`'s `navGroups` array and `activeSection` conditional block.
- Server code (`app/api/*/route.ts`) is minimal by design — only add a new route when something genuinely can't run client-side (needs Puppeteer, a server-only npm package, or a secret that must never reach the browser). Default to direct Supabase client calls, matching every existing module.
- Prefer batched Supabase operations (`upsert([...])`, `Promise.all([...])`) over sequential per-row loops for any multi-row write. This is a fix for a real, already-identified problem (see Performance below) — don't add a new instance of the sequential-loop pattern.

## UI Principles

- Full RTL Arabic (`direction:'rtl'`) is the default everywhere. Build new UI RTL-first — don't build LTR and flip it.
- Match the existing visual language exactly rather than inventing a new one: white rounded cards (8–14px radius) on a `#f0f4f8` page background, primary blue `#1e40af`/`#3b82f6`, and the established status-pill bg/color pairs — green `#dcfce7`/`#15803d` (success/present), red `#fee2e2`/`#dc2626` (danger/absent), amber `#fef9c3`/`#b45309` (warning), blue `#dbeafe`/`#1d4ed8` (info). Reuse these exact hex values for a new status meaning that maps onto one of these four categories; don't invent a fifth ad hoc palette for a one-off badge.
- Every new list/table screen needs a loading state, an empty state, and — if the data is mutable — a `readOnly`-gated write UI, matching every existing module.
- Destructive actions (delete, un-archive, remove signature, delete archive) always go through `confirm()` with a specific message naming what will be deleted, in Arabic, matching the tone of existing confirm strings — never a silent or generic "Are you sure?" delete.
- If you find yourself duplicating an `inputStyle` object into a new file, that matches current convention (it happens in ~10 of 13 components already) — don't "fix" this by refactoring unrelated files while implementing an unrelated feature; that's a separate, explicit refactor (see `PROJECT_ARCHITECTURE_REPORT.md` → Recommended Refactoring) to propose to the user first.

## Database Rules

- Read `docs/database.md` before writing any query against a table you haven't touched before — it's the accurate, hand-maintained schema reference and must stay in sync with any migration you make.
- Never alter the literal Arabic values in `attendance_records.status`, `visa_cycles.status`, `tasks.priority`/`status`, receipt-type prefixes, or the `user_roles.role` CHECK list — this fixed vocabulary is depended on by the frontend, the Postgres views, the PDF generator, and the Excel exporter simultaneously.
- `monthly_attendance_summary` and `funds_summary` are views whose Arabic column names are used directly as TypeScript object keys (e.g. `row['المتبقي']`). If you must alter one, `DROP` + recreate it with **exactly** the same column names in the same order the frontend expects — there is no compiler check across a Postgres view boundary, so a mismatch fails silently at runtime.
- Any new table referencing `employees.id`, `funds.fund_code`, or another frequently-joined column must get an index on that foreign key at creation time. Don't repeat the current gap (13 missing FK indexes already flagged by Supabase's advisor).
- Prefer a Postgres `GENERATED` column or a view over a client-computed derived value whenever that value needs to be queried, filtered, sorted, or reused by more than one component — this is why `tourist_visas.expiry_date`/`annual_visas.expiry_date` are `GENERATED`; follow that pattern for new derived date/amount fields instead of recomputing them per component.
- Every new sensitive write (delete, financial adjustment, signature upload/removal, archive/un-archive, document issuance/deletion, login) must call `logActivity(action, section, details)`, matching the convention already present in almost every component.

## Supabase Rules

- Use the Supabase MCP tools (`list_tables`, `get_advisors`, `execute_sql`, etc.) to inspect the **live** schema before writing a migration or a query against an unfamiliar table — don't rely purely on memory or a possibly-stale `docs/database.md`.
- Run `get_advisors` for both `security` and `performance` after any DDL change (new table, index, policy, function) and report what it flags. This project has a set of currently-accepted advisor warnings (documented in `PROJECT_ARCHITECTURE_REPORT.md`) — don't silently add more without saying so.
- **Do not add another `"Allow all"` (`USING (true)`) RLS policy on a new table just because that's the existing pattern.** That pattern is a tracked, known security gap, not a template. If the user wants a new table properly locked down, write a policy scoped to `user_roles`; if they explicitly want to match the existing open pattern for consistency, do it but say clearly in your response that this repeats a known, already-flagged issue.
- The Supabase URL and anon key are intentionally hardcoded literal strings in every client file, per explicit instruction in `CLAUDE.md` — don't move them to `.env`, don't rotate/change the key, and don't treat this as license to hardcode further secrets. This is **not** precedent for adding a service-role key or any other privileged credential to client code — a service-role key bypasses RLS entirely and must never ship to the browser.
- New Storage uploads should follow the existing filename convention (`${id}_${type}_${Date.now()}_${file.name}` style) so deletion logic that derives the storage path from the public URL keeps working.
- Never call `execute_sql`/`apply_migration` in a way that inserts, updates, or deletes real rows without explicit user confirmation first — this project has one Supabase instance and it is production, holding real employee, payroll, and visa data.

## Graphify Workflow

- When `graphify-out/graph.json` exists, run `graphify query "<question>"` before grepping or reading files blind for any non-trivial "where is X used" / "what calls Y" / "how do these relate" question — it returns a smaller, more precise scoped subgraph.
- Use `graphify path "<A>" "<B>"` when the task is specifically about the relationship between two named things (e.g. a component and a table, or two components sharing a helper).
- Use `graphify explain "<concept>"` for a focused explanation of a single concept without pulling in the whole report.
- Fall back to reading `graphify-out/GRAPH_REPORT.md` in full only for broad architecture questions the scoped queries don't answer.
- **After making code changes, run `graphify update .`** (AST-only, no API cost) so the graph doesn't go stale for whichever agent or session picks up next.
- Before trusting a report-level answer, sanity-check freshness: compare `git rev-parse HEAD` against the "Built from commit" line in `GRAPH_REPORT.md`; prefer a fresh `graphify query` over a possibly-stale full report.

## Context7 Workflow

- For any question about a library, framework, SDK, API, or CLI used here (Next.js, `@supabase/supabase-js`, Puppeteer/puppeteer-core, `@sparticuz/chromium`, `pdf-lib`, `image-size`, `recharts`, `xlsx`, Capacitor, Tailwind) — including syntax, configuration, version-specific behavior, migration, or debugging a library-specific error — use Context7 MCP instead of answering from training-data memory or general web search.
- Steps: call `resolve-library-id` with the library name plus the actual question (unless the user already gave an exact `/org/project` ID); pick the best match by name relevance, description, snippet count, and source reputation; then call `query-docs` with the **full question text**, scoped to a single concept. If a question spans multiple distinct concepts (e.g. "set up middleware and also fix this Puppeteer timeout"), split it into separate `query-docs` calls rather than one combined query.
- Don't reach for Context7 for refactoring calls, business-logic debugging, or general programming judgment — those aren't documentation lookups, they're ordinary engineering decisions.

## Playwright Testing Workflow

- For any UI/frontend change, drive it in an actual browser before reporting the work as done — type-checking and a successful build do not verify feature correctness, especially given how much of this app's behavior is client-only (role-gated rendering, derived leave/overtime balances, PDF-trigger flows).
- Practical flow for this repo:
  1. Start the dev server in the background: `npm run dev`.
  2. `mcp__playwright__browser_navigate` to `http://localhost:3000`.
  3. Log in with a real account for the role you need to exercise — **there is no mock-auth mode**; this hits live Supabase Auth against the production project, so be deliberate about which account you use and what you do while logged in.
  4. Prefer `mcp__playwright__browser_snapshot` over screenshots to verify structure/text, then exercise the actual golden path for the change (add a record, toggle a status, trigger a PDF download) plus at least one edge case — commonly the `readOnly` variant of the same screen under a restricted role, or the relevant empty state.
  5. Check `mcp__playwright__browser_console_messages` for errors/warnings a visual pass wouldn't surface.
  6. For anything that generates a PDF, confirm the `POST /api/pdf` call actually returned 200 via `mcp__playwright__browser_network_requests` — a download dialog appearing is not proof the PDF is correct; this project has a documented history of layout bugs (unwanted blank trailing pages) that are easy to miss just by seeing a file download.
- **Never run destructive flows** (delete, archive, un-archive, remove signature) against real data during testing without first confirming with the user — there is no separate staging database; everything reachable from the running app is production data.

## Error Handling

- Match the existing pattern for user-facing errors: on a failing Supabase call, `alert('خطأ: ' + error.message)` immediately at the call site — this app has no global error boundary and doesn't swallow errors silently on the write path.
- `logActivity()` is deliberately fire-and-forget with an empty `catch` so an audit-logging failure can never block the real user action. Preserve that "logging must never break the feature" principle for any new instrumentation.
- Validate required fields client-side with a specific `alert()` naming the missing field(s) *before* issuing the Supabase call (see every `add*`/`save*` function in every module) — don't rely on a Postgres `CHECK`/`NOT NULL` violation to surface as the user-facing error, since a raw Postgres error message is not acceptable UX here.
- When an operation has a monetary or balance side effect (advance deduction, overtime-leave balance, receipt numbering), keep failure paths **symmetric**: if a later step can fail after an earlier step already wrote something, either wrap the sequence in an RPC/transaction or explicitly reason through what state a partial failure leaves behind — follow `Payroll.tsx`'s `saveMonthPayroll`/`deleteArchive` pair as the model of deliberate, exact reversal logic rather than writing a "best effort" cleanup.

## Logging

- Every sensitive or destructive action must call `logActivity(action, section, details)`. `action` and `details` should be short, human-readable Arabic strings describing what happened and to what/whom (e.g. `'حذف سلفة'`, `` `حذف السلفة: ${fund_code} — ${source}` ``) — not technical identifiers, stack traces, or raw payloads.
- `section` must be one of the keys `ActivityLog.tsx`'s `sectionLabel` map already recognizes (`employees`, `attendance`, `finance`, `receipts`, `visa`, `payroll`, `tasks`, `auth`, `documents`, `overtime`, `custody`, `contracts`). If you add a genuinely new section, also add its Arabic label to that map, or it will render as a raw, untranslated key in the audit-log UI.
- Do not log routine reads (page views, list loads) — `activity_log` is reserved for mutations and login events, matching current usage. Logging reads would both bloat the table and dilute the audit trail's purpose.
- Never write secrets, full signature images, or raw file contents into `activity_log.details` — a short description is sufficient, matching every existing call site.

## Security

- Do not treat `readOnly`/role props as a real security boundary when reasoning about a new feature — in this codebase today they are UI convenience only, because every table's RLS policy is currently `USING (true)`. If a new feature is genuinely sensitive, say so explicitly to the user rather than assuming the existing pattern already protects it.
- Never hardcode a new secret (API key, webhook secret, or especially a **service-role** key) into client-shipped code. The existing hardcoded anon key is a specific, already-accepted exception documented in `CLAUDE.md` — it is not a precedent for adding more secrets, and a service-role key in particular bypasses RLS entirely and must never appear in browser code.
- Any new Storage upload must go into one of the existing public buckets using the existing naming convention. Don't create a new bucket without also setting an intentional access policy — avoid quietly recreating the "public bucket allows listing" gap already flagged on the current four buckets.
- If you add a new Postgres function, don't mark it `SECURITY DEFINER` unless the user explicitly needs privilege elevation, and always set an explicit `search_path` on it. The current gaps on `get_next_receipt_number()` and `rls_auto_enable()` are known, tracked issues — not conventions to extend.
- Never commit `.env` files, service-role keys, or personal credentials. This repo intentionally has no secret files beyond the documented, already-public anon key.

## Performance

- Prefer one batched call over a loop of per-row calls for any multi-row write — `.upsert([...rows])` instead of `for (const row of rows) { await supabase.from(...).upsert(row) }`. This is a known, tracked issue in `Attendance.tsx`'s `saveAll()` and `Payroll.tsx`'s `saveMonthPayroll()`/`deleteArchive()`; don't add a new instance of the same pattern, and prefer fixing it opportunistically if you're already editing one of those functions.
- Batch independent reads with `Promise.all([...])` instead of sequential `await`s inside a loop — `getLastRotationStatus()`'s per-employee loop in `Attendance.tsx` is the anti-pattern to avoid, not to copy.
- Avoid new "sweep and write on read" logic — code that mutates rows purely as a side effect of loading/displaying them (see the Visa tourist/annual "violated" status sweep as the anti-pattern). Compute derived/expired state at query time or render time instead of writing it back on every page view.
- If a new feature needs year-scale or multi-table aggregation (like Reports), prefer a Postgres view or RPC over pulling raw rows into the browser and reducing them client-side — follow the `monthly_attendance_summary`/`funds_summary` pattern rather than `Reports.tsx`'s current client-side aggregation.
- Consider `next/dynamic` for any new heavy, section-specific dependency (charting, spreadsheet, or similar) rather than a static top-level import in `page.tsx` — everything imported there currently ships in the single initial bundle for every user, regardless of which section they actually open.

## Component Design

- One component per file in `app/components/`, PascalCase filename matching the default export, `'use client'` at the top, no nested subfolders — match the existing flat structure exactly.
- A new module component should accept `readOnly?: boolean` (and `userRole?: string` only if it needs role-specific behavior beyond simple read/write gating, as in Attendance/Payroll) as props passed down from `page.tsx` — it should not read auth state itself.
- Keep a component's Supabase queries, local state, and render logic together in one file. This codebase deliberately does not split "container" vs. "presentational" components or extract per-module custom hooks. Don't introduce that split for a single new module in isolation; if shared data-fetching (e.g. a `useEmployees()` hook) is genuinely worth doing, propose it as its own cross-cutting change first, since it touches multiple existing files.
- Reuse the nearest existing implementation of a UI pattern (status pill, master/detail list, dropdown, table with actions column) rather than inventing a new visual treatment for the same kind of information.
- List-with-detail modules (Employees, Custody, Contracts, etc.) follow a consistent master/detail pattern via local state (select an item → show its detail view in the same component) — don't introduce a routed detail page for a new module; match this pattern instead.

## Folder Organization Rules

- Don't speculatively create `lib/`, `hooks/`, `types/`, or `utils/` directories — none currently exist, and the project keeps everything inline per file by convention. If a genuine decision is made to start extracting shared code (see `PROJECT_ARCHITECTURE_REPORT.md` → Recommended Refactoring), that's a deliberate structural change to confirm with the user explicitly, not something to introduce silently while doing an unrelated feature.
- New module components go directly in `app/components/`, flat, no subfolders.
- New API routes go in `app/api/<name>/route.ts`, and only when genuinely needed server-side (see Architecture Principles).
- Documentation belongs in `docs/` (schema reference: `docs/database.md`) or the project root (`CLAUDE.md`, `PROJECT_ARCHITECTURE_REPORT.md`, this file) — don't scatter README files inside `app/`.
- Don't add new tooling/scaffolding directories (`.storybook/`, `tests/`, `cypress/`, etc.) without the user explicitly asking for that infrastructure. This project currently has zero test tooling beyond ESLint, and that is a standing decision to respect, not an oversight to silently correct.
