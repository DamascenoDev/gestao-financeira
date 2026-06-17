# Phase 7: Identidade visual e polimento - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 19 (4 modified, 15 new)
**Analogs found:** 16 / 19

> Re-skin-only phase. Every mapping is grounded in a file that exists today. The grammar (tokens in `globals.css`, `var(--token)` everywhere, `formatCents` for money, `data-slot` hooks, base-ui `render={}` composition, lucide icons, pt-BR copy) is already established by Phases 2-6 — new files COPY it, they do not invent.

## File Classification

| File (new/modified) | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/app/globals.css` (MOD) | config (CSS tokens) | transform (CSS var substrate) | itself (rewrite `:root`/`.dark`/`@theme inline`) | exact (self) |
| `src/app/layout.tsx` (MOD) | layout/provider | request-response (RSC) | itself + UI-SPEC §Dark Mode | exact (self) |
| `src/components/theme-provider.tsx` (NEW) | provider | event-driven (theme) | `src/components/ui/sonner.tsx` (next-themes consumer) | role-match |
| `src/components/theme-toggle.tsx` (NEW) | component (client) | event-driven | `src/components/user-menu.tsx` (dropdown + lucide) | role-match |
| `src/components/brand-mark.tsx` (NEW) | component (inline SVG) | static/transform | `src/components/category-badge.tsx` (token-driven SVG/dot) | partial |
| `src/components/bottom-nav.tsx` (NEW) | component (nav) | event-driven (routing) | `src/components/app-sidebar.tsx` (NAV_ITEMS + active) | role-match |
| `src/components/auth-shell.tsx` (NEW) | layout (composite) | request-response | `src/app/(auth)/layout.tsx` + `src/components/auth-form.tsx` | role-match |
| `src/components/receita-gasto-chart.tsx` (NEW) | component (chart, client) | transform (viz) | RESEARCH Pattern 1 (no analog in repo) | no analog |
| `src/components/category-distribution-chart.tsx` (NEW) | component (chart, client) | transform (viz) | RESEARCH Pattern 1 (no analog in repo) | no analog |
| `src/components/ui/chart.tsx` (NEW, vendored) | ui primitive | transform | vendored by `shadcn add chart` | no analog (vendored) |
| `src/components/table-skeleton.tsx` (NEW) | component | static | `src/components/ui/skeleton.tsx` + `extrato-table.tsx` (column shape) | role-match |
| `src/components/card-skeleton.tsx` (NEW) | component | static | `src/components/ui/skeleton.tsx` | role-match |
| `src/components/chart-skeleton.tsx` (NEW) | component | static | `src/components/ui/skeleton.tsx` | role-match |
| `src/components/extrato-table.tsx` (MOD) | component (table, client) | CRUD/transform | itself (add `<md` card branch) | exact (self) |
| `src/components/nf-table.tsx` (MOD) | component (table, client) | CRUD | itself + `extrato-table.tsx` | exact (self) |
| `src/components/import-review-table.tsx` (MOD) | component (table, client) | CRUD | itself + `extrato-table.tsx` | exact (self) |
| `src/components/reserva-ledger-table.tsx` (MOD) | component (table) | CRUD | itself + `nf-table.tsx` | exact (self) |
| `src/components/limite-gauge.tsx` (MOD) | component | transform | itself (token re-skin only) | exact (self) |
| `src/components/adherence-bar.tsx` (MOD) | component | transform | itself (token re-skin only) | exact (self) |

---

## Pattern Assignments

### `src/app/globals.css` (config, tokens) — STEP 1, BLOCKING SUBSTRATE

**Analog:** itself — rewrite `:root` (lines 57-97), `.dark` (lines 99-138), and mirror new/renamed tokens in `@theme inline` (lines 7-55).

**Existing structure to preserve** (do NOT touch lines 1-5, 140-176):
- `@import "tailwindcss"` / `tw-animate-css` / `shadcn/tailwind.css` (lines 1-3)
- `@custom-variant dark (&:is(.dark *));` (line 5) — already correct, dark-mode mechanism depends on it
- `@layer base` `html { @apply font-sans }` (line 148) and the print stylesheet (lines 160-176) — keep verbatim; print forces white regardless of theme

**Critical fix (RESEARCH Pitfall 3) — the `--font-sans` self-reference, lines 10-12:**
```css
/* CURRENT (broken — self-referential no-op; root layout defines --font-geist-sans) */
--font-sans: var(--font-sans);
--font-mono: var(--font-geist-mono);
--font-heading: var(--font-sans);
/* FIX → */
--font-sans: var(--font-geist-sans);
--font-mono: var(--font-geist-mono);
--font-heading: var(--font-inter-tight); /* or var(--font-geist-sans) fallback */
```

**Token rewrite pattern** (replace teal/grayscale with navy+gold; token NAMES stay so every `var(--token)` consumer keeps working — see UI-SPEC §Color System for exact OKLCH values):
```css
/* CURRENT :root line 64-65 (teal) → navy+gold per UI-SPEC */
--primary: oklch(0.55 0.07 195);   /* → oklch(0.76 0.13 88)  gold */
--chart-1: oklch(0.87 0 0);        /* → oklch(0.76 0.13 88)  gold (grayscale → ramp) */
```

**`@theme inline` mirror rule (lines 42-47):** any token added/renamed (e.g. `--color-destructive-foreground`, all `--color-chart-*`) MUST be mirrored here or the Tailwind utility (`bg-chart-1`, `text-allocation`) will not resolve. The existing semantic block (lines 42-47) is the template:
```css
--color-income: var(--income);
--color-expense: var(--expense);
--color-allocation: var(--allocation);
--color-consumption: var(--consumption);
```

---

### `src/app/layout.tsx` (provider) — STEP 2

**Analog:** itself. Current font registration at lines 6-14 (Geist + Geist_Mono); `<html>` at lines 27-30; `<Toaster />` already mounted at line 33.

**Add the heading font next to the existing fonts** (lines 6-14 pattern):
```tsx
import { Geist, Geist_Mono } from "next/font/google"
// add (UI-SPEC Typography — at most ONE added font):
import { Inter_Tight } from "next/font/google"
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["600"] })
```

**Wrap with ThemeProvider + `suppressHydrationWarning`** (RESEARCH Pattern 2). Current `<html>` (lines 27-30) gains `suppressHydrationWarning` and the `interTight.variable`; body wraps children + Toaster in `<ThemeProvider>`:
```tsx
<html lang="pt-BR" suppressHydrationWarning
  className={`${geistSans.variable} ${geistMono.variable} ${interTight.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster />
    </ThemeProvider>
  </body>
</html>
```

---

### `src/components/theme-provider.tsx` (NEW, provider)

**Analog:** `src/components/ui/sonner.tsx` (lines 1-4) — the only existing `next-themes` consumer; copy its `"use client"` + `next-themes` import convention.
```tsx
"use client"
import { ThemeProvider as NextThemesProvider } from "next-themes"
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

---

### `src/components/theme-toggle.tsx` (NEW, client component) — STEP 2

**Analog:** `src/components/user-menu.tsx` — copy the dropdown composition (lines 26-34: `DropdownMenu` + `DropdownMenuTrigger render={<Button variant="ghost" size="icon">}`) and the lucide-icon + `aria-label` convention. This toggle drops into `UserMenu` and is mirrored in the mobile drawer.

**Mount-guard** (RESEARCH Pattern 2, Pitfall 2) — net-new, no analog; `useTheme` from next-themes, `sun`/`moon`/`monitor` from lucide:
```tsx
"use client"
const [mounted, setMounted] = useState(false)
const { theme, setTheme } = useTheme()
useEffect(() => setMounted(true), [])
if (!mounted) return null  // avoid hydration mismatch
// render 3-way Claro / Escuro / Sistema (UI-SPEC copy table)
```

---

### `src/components/brand-mark.tsx` (NEW, inline SVG)

**Analog:** `src/components/category-badge.tsx` `CategoryDot` (lines 28-50) — copy the token-driven, `aria-hidden`/`role` SVG-dot convention (colors come from CSS vars / OKLCH, never PNG). Full SVG body is in RESEARCH §Code Examples (navy tile `fill="var(--primary)"` + gold ascending bar-trio). Confirm tile/glyph fill roles against UI-SPEC §Brand so light+dark both read.

---

### `src/components/bottom-nav.tsx` (NEW, mobile nav) — STEP 6

**Analog:** `src/components/app-sidebar.tsx` — copy directly:
- `'use client'` + `usePathname()` active detection (lines 1-5, 36)
- The `NAV_ITEMS` array shape `{ href, label, icon }` (lines 18-27) — reuse the SAME primary destinations subset (Dashboard, Extrato, Importar, MEI, Reservas)
- Active-state pattern (lines 51-52): `pathname === item.href || pathname.startsWith(`${item.href}/`)` → active = gold (UI-SPEC: `text-primary`)

**Gate with `useIsMobile`** from `src/hooks/use-mobile.ts` (768px breakpoint) — render only `<md`.

---

### `src/components/auth-shell.tsx` (NEW, layout composite) — STEP 7

**Analog:** `src/app/(auth)/layout.tsx` (the bare passthrough at line 18 `return children`) is what AuthShell wraps; `src/components/auth-form.tsx` (lines 68-111, `Card`-based form) is the right-panel content that stays unchanged. AuthShell adds the left navy brand panel (`BrandMark` + wordmark, gold "Financeira" allowed here per UI-SPEC §Screen Contracts) around the existing form — behavior frozen.

---

### `src/components/receita-gasto-chart.tsx` + `category-distribution-chart.tsx` (NEW, charts) — STEP 5

**No repo analog** — first charts in the codebase. Copy RESEARCH §Architecture Pattern 1 (shadcn `ChartContainer` + `ChartConfig` reading `--income`/`--consumption` semantic vars for receita-vs-gasto, `--chart-1..5` ramp for distribution). Reuse `formatCents` from `src/lib/money.ts` in every tooltip/axis formatter (same money discipline as `amount-cell.tsx` line 2). `'use client'`. Empty-state copy in UI-SPEC §Copywriting. Consumes existing RSC view data from `dashboard/page.tsx` / `mei/page.tsx` — NO new query.

**Prereq:** `npx shadcn add chart` vendors `src/components/ui/chart.tsx` + installs `recharts`; add `"overrides": { "react-is": "19.2.4" }` to `package.json` then `npm install` (RESEARCH Pitfall 1).

---

### Skeletons: `table-skeleton.tsx` / `card-skeleton.tsx` / `chart-skeleton.tsx` (NEW) — STEP 4/8

**Analog:** `src/components/ui/skeleton.tsx` (the full file, lines 3-11) — wrap the `<Skeleton>` primitive (`animate-pulse rounded-md bg-muted`). For `TableSkeleton`, mirror the column count/widths of `extrato-table.tsx` header (lines 374-407, e.g. `w-10` select / `w-16` Data). UI-SPEC mandates skeletons, never spinners.

---

### Dense tables → mobile card collapse (MODIFY, NET-NEW work) — STEP 6

**Files:** `extrato-table.tsx`, `import-review-table.tsx`, `nf-table.tsx`, `reserva-ledger-table.tsx`.

**Critical (RESEARCH Pitfall 5):** there is NO existing card-collapse pattern — all four are desktop-only `<table>` markup. This is net-new per table; props stay frozen.

**Analog for the card content:** the row cells already define the card fields. From `extrato-table.tsx` columns (lines 289-342) and `nf-table.tsx` body (lines 200-223), a mobile card per row = Descrição/Tomador + `CategoryBadge`/`AtividadeBadge` on the top line, `ddMM(...)` Data + `AmountCell` (mono Valor) on the second. Reuse the SAME cell components (`AmountCell`, `CategoryBadge`, `ddMM` helper, `TruncCell`) — only the wrapping layout changes.

**Switch mechanism:** prefer Tailwind responsive classes (`hidden md:table` / `md:hidden` card list) OR `useIsMobile` from `src/hooks/use-mobile.ts`. `SelectionActionBar` (already imported in `extrato-table.tsx` line 19) floats bottom on mobile — behavior unchanged.

---

### `src/components/limite-gauge.tsx` + `adherence-bar.tsx` (MODIFY, token re-skin only) — STEP 5

**Analog:** themselves. Both ALREADY read tokens (`bg-muted` track, fill from `meiStatusTokens`/`adherenceTokens`, `bg-foreground/40` ticks) and ship `role="progressbar"` + `aria-valuetext` (limite-gauge lines 47-77; adherence-bar lines 53-81). The re-skin is purely the OKLCH token re-tune in `globals.css` + optional radial/arc treatment on the gauge — DO NOT touch the fill-token logic, the clamp math, or the aria. Behavior tests must stay green.

---

## Shared Patterns

### CSS-variable theming (the load-bearing rule)
**Source:** `src/app/globals.css` `@theme inline` (lines 7-55) + every component reading `var(--token)` / Tailwind `bg-*`/`text-*` utilities.
**Apply to:** ALL new + modified components.
**Rule:** zero hardcoded hex/oklch in components (the one sanctioned exception is the fixed swatch palette in `category-badge.tsx` lines 16-25). Charts, brand mark, bottom-nav active state all read `var(--primary)`/`var(--chart-N)` so the `.dark` flip re-themes with no JS. Verify by grep: no literal `195` (old teal hue) or `#`/`oklch(` survives in `src/components` after re-skin (RESEARCH Assumption A3).

### Money formatting
**Source:** `src/lib/money.ts` `formatCents`; usage in `amount-cell.tsx` (line 2, 35) and `extrato-table.tsx` (lines 430-440).
**Apply to:** both new charts (tooltip/axis formatters), any skeleton placeholder for a value. Mono `tabular-nums`; never raw numbers; never `NaN%`.

### Component composition (base-ui `render={}`)
**Source:** `user-menu.tsx` (lines 27-33), `app-sidebar.tsx` (lines 55-64) — base-ui primitives take `render={<Link/Button>}` instead of `asChild`.
**Apply to:** `theme-toggle.tsx`, `bottom-nav.tsx`, `auth-shell.tsx`.

### Empty-state grammar
**Source:** `src/components/ui/empty.tsx` + its canonical usage in `dashboard/page.tsx` (lines 6-12, 271-280): `Empty > EmptyHeader > EmptyTitle + EmptyDescription` + `EmptyContent` with one gold CTA. Note `EmptyTitle` already uses `font-heading` (empty.tsx line 64) — depends on the font-bug fix landing.
**Apply to:** chart empty states (UI-SPEC copy), polish sweep across ~20 routes (existing usage in reservas/mei/receitas/categorias/extrato/importar pages — re-skin, keep copy).

### Theme-aware toasts (already wired)
**Source:** `src/components/ui/sonner.tsx` (lines 7-9 `useTheme()`; lines 31-37 CSS-var styling). Once `ThemeProvider` exists, toasts follow theme automatically — no change needed to sonner.

### Mobile breakpoint detection
**Source:** `src/hooks/use-mobile.ts` (768px). **Apply to:** `bottom-nav.tsx` + the 4 table→card branches.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/receita-gasto-chart.tsx` | chart | transform | No Recharts/chart component exists yet — use RESEARCH Pattern 1 + shadcn docs |
| `src/components/category-distribution-chart.tsx` | chart | transform | Same — first donut/bar in the codebase |
| `src/components/ui/chart.tsx` | ui primitive | transform | Vendored verbatim by `shadcn add chart`; do not hand-write |

---

## Metadata

**Analog search scope:** `src/app/` (root + `(app)` + `(auth)` layouts, dashboard/mei pages), `src/components/` (all + `ui/*`), `src/hooks/`, `src/lib/money.ts`.
**Files scanned:** ~22 read in full or targeted.
**Pattern extraction date:** 2026-06-17
