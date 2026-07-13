# Graph Report - .  (2026-07-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 216 nodes · 229 edges · 33 communities (27 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `698346a8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- page.tsx
- compilerOptions
- dependencies
- devDependencies
- Receipts.tsx
- include
- Visa.tsx
- Attendance.tsx
- package.json
- Finance.tsx
- Tasks.tsx
- ActivityLog.tsx
- Payroll.tsx
- Reports.tsx
- ExampleInstrumentedTest.java
- layout.tsx
- ExampleUnitTest.java
- gradlew
- MainActivity.java
- capacitor.config.ts
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `logActivity()` - 11 edges
3. `include` - 8 edges
4. `scripts` - 5 edges
5. `BaseReceipt` - 4 edges
6. `lib` - 4 edges
7. `ExampleInstrumentedTest` - 3 edges
8. `Attendance()` - 3 edges
9. `Reports()` - 3 edges
10. `MainActivity` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (33 total, 6 thin omitted)

### Community 0 - "page.tsx"
Cohesion: 0.08
Nodes (21): Contract, Employee, supabase, CustodyItem, Employee, itemTypes, supabase, DocContent (+13 more)

### Community 1 - "compilerOptions"
Cohesion: 0.10
Nodes (21): ./*, dom, dom.iterable, esnext, compilerOptions, allowJs, esModuleInterop, incremental (+13 more)

### Community 2 - "dependencies"
Cohesion: 0.11
Nodes (19): @capacitor/android, @capacitor/cli, @capacitor/core, next, dependencies, @capacitor/android, @capacitor/cli, @capacitor/core (+11 more)

### Community 3 - "devDependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 4 - "Receipts.tsx"
Cohesion: 0.25
Nodes (10): BaseReceipt, DeliveryReceipt, FuelReceipt, Fund, MaintenanceReceipt, numberToArabicWords(), Receipts(), ReceiptType (+2 more)

### Community 5 - "include"
Cohesion: 0.18
Nodes (10): app/components/Finance, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+2 more)

### Community 6 - "Visa.tsx"
Cohesion: 0.20
Nodes (8): AnnualVisa, categories, nationalities, supabase, TouristVisa, VisaCycle, VisaFile, VisaStat

### Community 7 - "Attendance.tsx"
Cohesion: 0.28
Nodes (8): Attendance(), AttendanceRecord, DailyDetail, Employee, formatDate(), monthLabel(), MonthlyRow, supabase

### Community 8 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 9 - "Finance.tsx"
Cohesion: 0.25
Nodes (6): Expense, ExpenseForm, Fund, FundForm, supabase, UnifiedItem

### Community 10 - "Tasks.tsx"
Cohesion: 0.25
Nodes (6): AssignableUser, priorityInfo, roleLabel, statusInfo, supabase, Task

### Community 11 - "ActivityLog.tsx"
Cohesion: 0.33
Nodes (6): actionColor(), ActivityEntry, ActivityLog(), LoginEntry, sectionLabel, supabase

### Community 12 - "Payroll.tsx"
Cohesion: 0.33
Nodes (6): Approval, Employee, monthLabel(), Payroll(), PayrollRecord, supabase

### Community 13 - "Reports.tsx"
Cohesion: 0.38
Nodes (6): COLORS, fmt(), fmtM(), MONTHS_AR, Reports(), supabase

### Community 14 - "ExampleInstrumentedTest.java"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 15 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 17 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

## Knowledge Gaps
- **116 isolated node(s):** `supabase`, `ActivityEntry`, `LoginEntry`, `sectionLabel`, `supabase` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logActivity()` connect `page.tsx` to `Receipts.tsx`, `Visa.tsx`, `Attendance.tsx`, `Finance.tsx`, `Payroll.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `supabase`, `ActivityEntry`, `LoginEntry` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07765151515151515 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._