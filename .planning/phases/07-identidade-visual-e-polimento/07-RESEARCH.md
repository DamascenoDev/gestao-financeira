# Phase 7: Identidade visual e polimento - Research

**Researched:** 2026-06-17
**Domain:** Frontend design system — Tailwind v4 OKLCH theming, next-themes dark mode (SSR), shadcn/Recharts data-viz, mobile-first responsive, polish primitives
**Confidence:** HIGH

## Summary

This is a **re-skin-only** phase: it touches the presentation layer exclusively and must keep all 559 behavior tests green (they do not assert on color). The phase has an unusually complete design contract already — `07-UI-SPEC.md` resolves nearly every decision (full OKLCH navy+gold token tables for light + dark, dark-mode mechanism = `next-themes`, charts = shadcn `chart`/Recharts, component inventory, sequencing). The research role here is therefore **verification + grounding against the real codebase**, not exploration. Almost every "Claude's Discretion" item in CONTEXT.md is already locked in the UI-SPEC.

The codebase inspection surfaced the concrete substrate and **three latent bugs/gaps the planner must address**: (1) `globals.css` has a self-referential `--font-sans: var(--font-sans)` while root layout defines `--font-geist-sans` — the prose font is effectively unset (falls through to system sans); the token-rewrite task should fix this and wire `--font-heading`. (2) `next-themes` is installed and `ui/sonner.tsx` already calls `useTheme()`, but **no `ThemeProvider` wraps the app** and `<html>` lacks `suppressHydrationWarning` — toasts can't follow the theme yet and dark mode is non-functional. (3) The dense tables (`extrato-table`, `import-review-table`, `nf-table`, `reserva-ledger-table`) are **desktop-only `<table>` markup with no mobile card collapse** — STATE.md references a "Phase-2/3 card pattern" that does not actually exist in code; the table→card work is net-new, not a re-skin of existing responsive code.

**Primary recommendation:** Execute strictly in the UI-SPEC's locked sequence — **tokens-first** (rewrite `globals.css` `:root`/`.dark` + `@theme inline`, fix the font bug, run the full suite + `next build` as a color-only regression gate), then theme infra (`next-themes` provider + `ThemeToggle`), then brand/shell, component re-skin pass, charts (with the `react-is` override + recharts install behind a checkpoint), mobile (BottomNav + table→card), auth shell, polish sweep. Add exactly **one** new runtime dependency: `recharts` (vendored via `npx shadcn add chart`), plus the `react-is` `overrides` entry.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OKLCH token system (navy+gold, light+dark) | Browser / Client (CSS) | — | Pure CSS variables in `globals.css`; no server logic. Tailwind v4 `@theme inline` exposes utilities. |
| Dark-mode persistence + flip | Browser / Client | Frontend Server (SSR) | `next-themes` writes `localStorage` + injects a pre-paint script in the document; SSR must add `suppressHydrationWarning` and not read theme on the server. |
| Data-viz charts | Browser / Client | API (existing views) | Charts are client components (`'use client'` Recharts) reading data already provided by the RSC pages from existing `security_invoker` views — **no new queries, no view changes**. |
| Brand mark / favicon | Browser / Client (inline SVG) | — | Token-driven inline SVG; auto-themes via CSS vars; no asset pipeline. |
| Responsive nav (sidebar→drawer+bottom-nav) | Browser / Client | — | Existing `sheet` + `useIsMobile` hook + new `BottomNav`; presentation only. |
| Table→card collapse | Browser / Client | — | CSS/responsive rendering of existing row data; props frozen. |
| Empty/loading/error/micro-interactions | Browser / Client | — | shadcn `empty`/`skeleton` + Tailwind transitions; no behavior change. |

**Why this matters:** every capability in this phase lives in the client/presentation tier. The hard constraint is that **nothing touches the API/DB/RLS tiers** — the charts consume existing RSC-fetched view data, and no Server Action, migration, or query is added. The planner should reject any task that proposes a new query, view, or server mutation.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Vibe:** sofisticado/bancário (BTG, Mercury, Linear) — limpo, confiável, premium, denso.
- **Paleta:** azul marinho profundo (navy) base/brand + **dourado** accent (substitui o teal atual); números mono tabulares continuam protagonistas. Referência: BTG Pactual.
- **Identidade (UI-01/02/03):** tokens OKLCH navy+gold para light E dark; tipografia com mais personalidade; marca/logo simples; tela de login/landing com cara de produto. Dark mode alternável + persistente (next-themes ou equivalente) sem quebrar a semântica de dinheiro nem teto/alvo de metas.
- **Data-viz (UI-04/05/06):** gráficos no dashboard (evolução mensal receita vs gasto, distribuição por categoria); aderência + gauge MEI mais ricos. shadcn chart/Recharts é o caminho oficial (avaliar peso/react-is override) ou manter custom para barras simples.
- **Polimento + mobile (UI-07/08):** empty/loading/error states consistentes, micro-interações/transições, hierarquia/espaçamento elevados; tabelas densas (extrato, NF, ledger) viram cards no mobile; nav adapta (sidebar → bottom-nav/drawer).
- **Preservar (não tocar):** toda lógica de Server Actions, RLS, ownership/IDOR, money bigint centavos, views `security_invoker`, testes (559 verdes) — o re-skin não pode quebrar nenhum teste de comportamento. Semântica de cor (teto vermelho-acima, alvo verde-atingido, alocação, income/expense) deve sobreviver à nova paleta com contraste correto em light E dark.

### Claude's Discretion
- Tons exatos OKLCH do navy+gold (light+dark) — derivar uma escala coesa e acessível (WCAG AA). **→ Already resolved in UI-SPEC with full token tables.**
- Lib de charts e quais gráficos exatos. **→ Resolved in UI-SPEC: shadcn `chart`/Recharts; receita-vs-gasto + category-distribution; gauge/adherence stay custom.**
- Forma do logo/marca. **→ Resolved in UI-SPEC: inline-SVG navy tile + gold ascending bar-trio.**
- Estratégia de dark mode (next-themes vs CSS) e de mobile (cards vs scroll). **→ Resolved in UI-SPEC: next-themes `class` strategy; tables→cards.**
- Ordem do re-skin (tokens globais primeiro → componentes → telas). **→ Resolved in UI-SPEC §Implementation Sequencing (8 steps).**

### Deferred Ideas (OUT OF SCOPE)
- Ilustrações custom / motion design avançado → além do polimento básico.
- Conta compartilhada (MUL-01) → v2.
- Deploy remoto (01-04) → quando o usuário tiver credenciais.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Design system navy+gold aplicado globalmente (tokens OKLCH light+dark, tipografia, marca), semântica de dinheiro/status preservada | UI-SPEC §Color System has the full token tables + collision audit; rewrite `globals.css` `:root`/`.dark`/`@theme inline`. Fix the `--font-sans` self-reference bug + wire `--font-heading`. |
| UI-02 | Dark mode completo, alternável, persistente, sem quebra de contraste/semântica | `next-themes` (installed, unwired); ThemeProvider in root layout + `suppressHydrationWarning`; mounted-guarded ThemeToggle; `@custom-variant dark` already in globals.css. |
| UI-03 | Logo/marca + login/landing com identidade de produto | `BrandMark` inline SVG; `AuthShell` two-panel layout replacing the bare `(auth)/layout.tsx` passthrough + bare `auth-form`. |
| UI-04 | Gráfico evolução mensal receita vs gasto (dashboard) | shadcn `chart` (Recharts) bar/line; receita=`--income`, gasto=`--consumption`; `formatCents` tooltips; reads existing RSC data. |
| UI-05 | Gráfico distribuição de gastos por categoria (mês) | shadcn `chart` donut/bar; `--chart-1..5` ramp; center total via `formatCents`. |
| UI-06 | Visual rico de aderência + gauge MEI elevado | Re-skin existing `AdherenceBar`/`LimiteGauge` (stay custom div-bars) with new direction-aware tokens; optional radial/arc gauge treatment. |
| UI-07 | Refinamento mobile-first (tabelas densas → cards, nav adapta) | NEW work — no existing card-collapse pattern. `BottomNav` + `<md` card rendering for 4 dense tables; `useIsMobile` hook + `sheet` drawer exist. |
| UI-08 | Empty/loading/error states + micro-interações consistentes | shadcn `empty`/`skeleton` vendored; build `TableSkeleton`/`CardSkeleton`/`ChartSkeleton`; 150ms `transition-colors`; `tw-animate-css` shimmer; respect `prefers-reduced-motion`. |

## Standard Stack

### Core (all already installed — versions verified against `package.json`)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `next` | 16.2.9 | App Router framework | Locked. `[VERIFIED: package.json]` |
| `react` / `react-dom` | 19.2.4 | UI runtime | Locked — drives the `react-is` override need. `[VERIFIED: node_modules/react/package.json]` |
| `tailwindcss` | ^4 | CSS-first styling (`@theme`, `@custom-variant`) | Locked. `globals.css` already uses `@theme inline` + `@custom-variant dark`. `[VERIFIED: package.json]` |
| `shadcn` (CLI) | ^4.11.0 | Component vendoring | `components.json` present, `base-nova`, `registries: {}`. `[VERIFIED: components.json]` |
| `@base-ui/react` | ^1.5.0 | Radix-equivalent primitives | shadcn `base-nova` uses base-ui. `[VERIFIED: package.json]` |
| `next-themes` | ^0.4.6 | Dark-mode provider | **Installed but UNWIRED.** `[VERIFIED: package.json + grep — no ThemeProvider in any layout]` |
| `lucide-react` | ^1.20.0 | Icons | Locked (`sun`/`moon`/`monitor` for ThemeToggle). `[VERIFIED: package.json]` |
| `sonner` | ^2.0.7 | Toasts (theme-aware) | `ui/sonner.tsx` already wired to `useTheme()`. `[VERIFIED: src/components/ui/sonner.tsx]` |
| `tw-animate-css` | ^1.4.0 | Shimmer/animations | Imported in `globals.css` line 2. `[VERIFIED: globals.css]` |

### Supporting — the ONE new dependency
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `recharts` | 3.8.1 (latest, pub 2026-03-25) | Chart engine behind shadcn `chart` | Added via `npx shadcn add chart`. Used ONLY by `ReceitaGastoChart` + `CategoryDistributionChart`. `[VERIFIED: npm registry — 52.8M weekly downloads, repo github.com/recharts/recharts, no postinstall]` |
| `react-is` | 19.x (override) | Recharts 3 ↔ React 19 reconciliation | **Required `overrides` entry.** Transitive `react-is` resolves to **16.13.1** while React is 19.2.4 — mismatch confirmed locally. `[VERIFIED: node_modules/react-is/package.json + official shadcn react-19 doc]` |

### Alternatives Considered (all already decided in UI-SPEC — do NOT re-explore)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn `chart`/Recharts | Custom div/SVG bars | UI-SPEC keeps `AdherenceBar`/`LimiteGauge` custom (a div-bar reads faster for "X% vs Y%"); Recharts ONLY for the 2 genuinely-graphical dashboard charts. Decision locked. |
| `next-themes` | Hand-rolled `.dark` toggle | next-themes is already a dep, injects the pre-paint anti-FOUC script, handles `system` + persistence for free. Locked. |
| Added `--font-heading` (Inter Tight 600) | Keep Geist 600 for headings | UI-SPEC locks Inter Tight 600 for headings/brand with a Geist-600 fallback if it risks layout/perf. At most ONE font added. |

**Installation:**
```bash
# Adds components/ui/chart.tsx AND installs recharts as a dependency
npx shadcn@latest add chart
# Optional wayfinding primitive (UI-SPEC marks optional)
npx shadcn@latest add breadcrumb
# After install, add to package.json then re-install:
#   "overrides": { "react-is": "19.2.4" }   (match the installed React version)
npm install
```

**Version verification (run before pinning):**
```bash
npm view recharts version      # confirm 3.8.x at build time
cat node_modules/react/package.json | grep version   # match react-is override to this
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `recharts` | npm | ~11 yrs (created 2015-08-07) | 52.8M/wk | github.com/recharts/recharts | **OK** | Approved (seam verdict OK; no postinstall) |
| `react-is` (override) | npm | mature (React core pkg) | n/a (transitive) | github.com/facebook/react | **OK** | Approved — override only, no new install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All other libraries in this phase are already installed and proven across Phases 1–6. The only true new runtime dependency is `recharts`, which passed the legitimacy seam (`verdict: OK`, no postinstall script). No `checkpoint:human-verify` is strictly required for `recharts`, but the planner should still gate the install task with a `next build` + full-suite verify (the `react-is` override is the real risk, not legitimacy).

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │  globals.css  (CSS-VARIABLE SUBSTRATE)        │
                          │  :root  → navy+gold light tokens              │
                          │  .dark  → navy+gold dark tokens               │
   theme choice           │  @theme inline → bg-income, bg-chart-1, …     │
   (localStorage)         │  @custom-variant dark (&:is(.dark *))         │
        │                 └───────────────┬─────────────────────────────┘
        ▼                                 │ every component reads var(--token)
┌──────────────────┐    sets .dark class  │
│  next-themes     │──────────────────────┤
│  ThemeProvider   │   (pre-paint script  │
│  (root layout)   │    injected → no FOUC)│
└──────────────────┘                      │
        ▲                                  ▼
   ThemeToggle              ┌──────────────────────────────────────────┐
   (UserMenu +              │  (app) shell: AppSidebar + top bar +      │
    mobile drawer)          │  BottomNav(<md) + AuthShell((auth))       │
                            └───────────────┬──────────────────────────┘
                                            │ RSC pages pass existing view data
                                            ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │  RSC pages (UNCHANGED queries)                                    │
       │  /dashboard → v_adherence_month/_ytd, v_income_month              │
       │  /mei       → v_mei_year_summary                                  │
       └───────────────┬──────────────────────────────────┬──────────────┘
                       │ data (cents, bp)                  │
                       ▼                                   ▼
        ┌────────────────────────────┐      ┌─────────────────────────────┐
        │ 'use client' Recharts       │      │ custom div-bars (re-skinned) │
        │ ChartContainer{config}      │      │ AdherenceBar / LimiteGauge   │
        │  → reads --chart-1..5,      │      │  → reads --income/--destruc- │
        │    --color-{key}            │      │    tive/meiStatusTokens      │
        │  ReceitaGastoChart          │      │  formatCents on every value  │
        │  CategoryDistributionChart  │      └─────────────────────────────┘
        └────────────────────────────┘
```

Trace: user picks theme → next-themes toggles `.dark` on `<html>` → every CSS var flips → all components (chrome, charts, bars) re-render with new colors, instantly (`disableTransitionOnChange`). Charts get their data from RSC pages that query the SAME unchanged views.

### Recommended Project Structure (additions only — everything else re-skinned in place)
```
src/
├── app/
│   ├── layout.tsx              # + ThemeProvider, suppressHydrationWarning, --font-heading
│   ├── globals.css             # REWRITE :root/.dark/@theme inline (navy+gold); fix --font-sans bug
│   ├── (auth)/layout.tsx       # → wrap children in AuthShell
│   └── icon.svg / favicon      # navy tile + gold bar-trio
├── components/
│   ├── theme-provider.tsx      # NEW — next-themes wrapper
│   ├── theme-toggle.tsx        # NEW — 3-way Claro/Escuro/Sistema, mounted-guarded
│   ├── brand-mark.tsx          # NEW — inline SVG, token-driven
│   ├── bottom-nav.tsx          # NEW — <md primary destinations
│   ├── auth-shell.tsx          # NEW — two-panel identity layout
│   ├── receita-gasto-chart.tsx # NEW — Recharts
│   ├── category-distribution-chart.tsx  # NEW — Recharts
│   ├── table-skeleton.tsx / card-skeleton.tsx / chart-skeleton.tsx  # NEW
│   └── ui/
│       └── chart.tsx           # NEW — vendored by `shadcn add chart`
```

### Pattern 1: shadcn ChartContainer reading CSS variables (auto-themed)
**What:** ChartContainer takes a `config` object mapping each series key to `{ label, color }`, where `color` points at a `--chart-N` CSS var. ChartContainer injects per-key `--color-{key}` vars, which Recharts components reference via `fill="var(--color-{key})"`. Because the colors are CSS vars, `.dark` overriding `--chart-N` re-themes the chart with no JS.
**When to use:** the two new dashboard charts (UI-04, UI-05).
**Example:**
```tsx
// Source: https://ui.shadcn.com/docs/components/chart  [CITED]
"use client"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  receita: { label: "Receita", color: "var(--income)" },       // semantic override
  gasto:   { label: "Gasto",   color: "var(--consumption)" },  // semantic override
} satisfies ChartConfig

export function ReceitaGastoChart({ data }: { data: { mes: string; receita: number; gasto: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} /> {/* format cents in the tooltip formatter */}
        <Bar dataKey="receita" fill="var(--color-receita)" radius={4} />
        <Bar dataKey="gasto"   fill="var(--color-gasto)"   radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
```
For the category-distribution donut, use `--chart-1..5` (the categorical ramp), NOT the money tokens, so a slice never reads as "income". `[CITED: ui.shadcn.com/docs/components/chart]`

### Pattern 2: next-themes provider + mounted-guarded toggle (App Router, no FOUC)
**What:** ThemeProvider wraps children in the root layout; `<html>` gets `suppressHydrationWarning`; next-themes injects a pre-paint script so the correct `.dark` class is applied before first paint. The ThemeToggle is mounted-guarded to avoid hydration mismatch.
**When to use:** UI-02 theme infra (step 2 in the sequence).
**Example:**
```tsx
// Source: https://github.com/pacocoursey/next-themes  [CITED]
// app/layout.tsx
<html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${interTight.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster />
    </ThemeProvider>
  </body>
</html>

// theme-toggle.tsx  ('use client')
const [mounted, setMounted] = useState(false)
const { theme, setTheme } = useTheme()
useEffect(() => setMounted(true), [])
if (!mounted) return null  // avoid hydration mismatch
// render 3-way Claro / Escuro / Sistema (sun/moon/monitor)
```
`[CITED: github.com/pacocoursey/next-themes]`

### Pattern 3: Tailwind v4 token rewrite (CSS-first)
**What:** Rewrite the `:root` and `.dark` blocks in `globals.css` with the UI-SPEC OKLCH values; mirror every new/renamed token in `@theme inline` so `bg-income`, `text-allocation`, `bg-chart-1`, etc. resolve. The `@custom-variant dark (&:is(.dark *))` is already present and correct.
**When to use:** UI-01 tokens-first (the BLOCKING substrate, step 1).
**Critical fix:** line 10 `--font-sans: var(--font-sans);` is self-referential. Root layout defines `--font-geist-sans`. Set `@theme inline` `--font-sans: var(--font-geist-sans)` and `--font-heading: var(--font-inter-tight)` (or keep Geist), and add the matching `next/font` in root layout.

### Anti-Patterns to Avoid
- **Hardcoding a hex/oklch in a component:** every color must be a CSS var so the `.dark` flip works. The UI-SPEC's "flip integrity" rule depends on zero hardcoded colors.
- **Using gold for income or a category:** gold (`--primary`, H≈88) is brand/action only. Income is green (H≈152). The collision audit in the UI-SPEC is load-bearing.
- **Reading `theme` on the server or in an unmounted client component:** causes hydration mismatch. Always mount-guard.
- **Adding a new query/view for charts:** charts consume existing RSC data only. A new query is out of scope and risks the "re-skin only" boundary.
- **Re-skinning that changes a test selector's behavior:** if a token rename breaks a test, fix the test selector — never the security/behavior logic (UI-SPEC rule: "the test wins").
- **Spinners for content loading:** UI-SPEC mandates skeletons, never spinners.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark-mode persistence + anti-FOUC | Custom `localStorage` + inline script | `next-themes` (installed) | Pre-paint script injection, `system` support, SSR-safe — hand-rolling reintroduces the flash bug. |
| Chart axes/tooltips/legends/responsive container | Custom SVG charting | shadcn `chart` + Recharts | Accessibility layer, responsive container, tooltip/legend wiring, CSS-var theming all solved. |
| Theme-aware toasts | Manual toast theming | `sonner` (already `useTheme()`-wired) | Once ThemeProvider exists, toasts follow theme automatically. |
| Responsive breakpoint detection | New matchMedia code | `useIsMobile` hook (exists, 768px) | Already vendored; reuse for BottomNav / table-card switch. |
| Empty/skeleton primitives | Custom divs | shadcn `empty` + `skeleton` (vendored) | Wrap them in `TableSkeleton`/`CardSkeleton`/`ChartSkeleton` for consistency. |

**Key insight:** This phase's risk is **not** missing libraries — almost everything is already installed. The risk is (a) the `react-is` override, (b) the FOUC/hydration discipline around next-themes, and (c) contrast integrity of the new OKLCH tokens across the light↔dark flip. Spend planning effort there, not on tooling choices.

## Runtime State Inventory

> This is a re-skin (token rename + visual change), so the inventory applies. Nothing here is data migration; all changes are code/CSS edits.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — no DB column, key, or value stores a color/theme token. Theme choice persists in browser `localStorage` (managed by next-themes), not the DB. | None |
| Live service config | **None** — no external service references the palette. | None |
| OS-registered state | **None.** | None |
| Secrets/env vars | **None** — no env var names change; the phase adds no secrets. | None |
| Build artifacts | `recharts` added to `node_modules` + `package-lock.json`; `react-is` override changes the resolved tree — requires `npm install` after editing `package.json`. The favicon/`icon.svg` is a new static asset. `next build` must be re-run after the chart install to confirm the bundle. | `npm install` after override + verify `next build` |

**Token rename note:** Tokens are *re-tuned* (OKLCH values change) but the token *names* (`--income`, `--primary`, `--chart-1`, `--font-heading`, sidebar tokens) are mostly preserved — so components reading `var(--income)` keep working. New token utilities that don't exist yet (`--color-destructive-foreground` if added, any new chart key) must be mirrored in `@theme inline` or the Tailwind utility won't resolve. **Verify by grep** that no component hardcodes the old teal (`195` hue) or grayscale chart values.

## Common Pitfalls

### Pitfall 1: react-is version mismatch breaks Recharts under React 19
**What goes wrong:** Recharts 3 internally uses `react-is`; the transitive resolution lands on `react-is@16.13.1` (confirmed in this repo) while React is 19.2.4. This causes runtime/type errors or silent chart-render failures.
**Why it happens:** Recharts' peerDeps allow React 19 but its dependency tree pulls an old `react-is`.
**How to avoid:** Add `"overrides": { "react-is": "19.2.4" }` (match the installed React version exactly) to `package.json`, then `npm install`. The `overrides` key does NOT currently exist — the planner must create it.
**Warning signs:** Charts don't render, or `next build` throws a react-is/`isFragment` type error after `shadcn add chart`. `[VERIFIED: node_modules/react-is@16.13.1 vs react@19.2.4]`

### Pitfall 2: FOUC / hydration mismatch from next-themes done wrong
**What goes wrong:** Theme flashes light-then-dark on load, or React throws a hydration mismatch warning.
**Why it happens:** Missing `suppressHydrationWarning` on `<html>` (next-themes mutates the class server↔client), or a ThemeToggle that reads `theme` before mount.
**How to avoid:** `suppressHydrationWarning` on `<html>`; mount-guard the toggle (`return null` until `mounted`); `disableTransitionOnChange` so the flip is instant.
**Warning signs:** Console hydration warning; a visible flash on first paint. `[CITED: github.com/pacocoursey/next-themes]`

### Pitfall 3: the `--font-sans` self-reference (existing bug)
**What goes wrong:** `globals.css` line 10 sets `--font-sans: var(--font-sans)` — a no-op — while root layout defines `--font-geist-sans`. Prose currently falls back to system sans, and `--font-heading` aliases the broken `--font-sans`.
**Why it happens:** The mapping name and the `next/font` variable name diverged.
**How to avoid:** In `@theme inline`, set `--font-sans: var(--font-geist-sans)` and `--font-heading: var(--font-inter-tight)` (or Geist), and register the heading font in root layout. Fix this in the tokens-first task.
**Warning signs:** Headings render in the wrong font; adding Inter Tight has no visible effect. `[VERIFIED: globals.css line 10-12 + src/app/layout.tsx]`

### Pitfall 4: contrast regression on the light↔dark flip
**What goes wrong:** A semantic token (income green, teto red, gold-on-navy) drops below 4.5:1 in one mode after re-tuning.
**Why it happens:** OKLCH lightness that reads fine on light chrome can fail on the deep-navy dark surface (and vice versa).
**How to avoid:** Each token has BOTH a `:root` and `.dark` value in the UI-SPEC; verify each text token ≥4.5:1 and non-text indicator ≥3:1 in both modes. Gold-on-navy CTA and navy-on-gold text both ≥4.5:1.
**Warning signs:** Hard-to-read green numbers in dark mode; faint gold CTA on navy.

### Pitfall 5: table→card collapse assumed to exist
**What goes wrong:** The plan treats mobile cards as a "re-skin" of an existing responsive pattern, but the dense tables are desktop-only `<table>` markup with no card variant.
**Why it happens:** STATE.md prose references a "Phase-2/3 card pattern" that was a *spec intent*, not implemented code.
**How to avoid:** Treat table→card (UI-07) as net-new work for `extrato-table`, `import-review-table`, `nf-table`, `reserva-ledger-table`; props stay frozen but a `<md` card rendering branch is added per table.
**Warning signs:** "re-skin the existing mobile cards" task with no source component to point at. `[VERIFIED: grep of extrato-table.tsx — only a truncate span, no md:/card responsive branch]`

### Pitfall 6: chart is the sole carrier of a number
**What goes wrong:** A user can't read an exact value because only the chart shows it.
**Why it happens:** Removing the existing labeled totals when adding a chart.
**How to avoid:** UI-SPEC rule — every chart is accompanied by a labeled total/legend; charts are `aria-label`led with a text/data fallback; all money via `formatCents`.

## Code Examples

### Brand mark (inline SVG, token-driven, auto-theming)
```tsx
// Source: UI-SPEC §Brand/Logo  [CITED: 07-UI-SPEC.md]
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Gestão Financeira">
      <rect width="24" height="24" rx="6" fill="var(--primary)" /> {/* navy tile uses --sidebar/--card in context; gold glyph */}
      {/* three ascending gold bars — growth/ledger */}
      <rect x="5"  y="13" width="3" height="6"  rx="1" fill="var(--primary-foreground)" />
      <rect x="10" y="9"  width="3" height="10" rx="1" fill="var(--primary-foreground)" />
      <rect x="15" y="5"  width="3" height="14" rx="1" fill="var(--primary-foreground)" />
    </svg>
  )
}
```
Note: the exact fill mapping (tile=navy, glyph=gold) must be wired so both light and dark read correctly — confirm against the UI-SPEC token roles during the brand task.

### Theme-aware Recharts tooltip formatting cents
```tsx
// formatCents already exists at src/lib/money.ts — reuse it in the tooltip formatter
<ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCents(Number(v))} />} />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` JS theme | Tailwind v4 CSS-first `@theme` directive | Tailwind v4 (2025) | Tokens live in `globals.css`; already adopted here. |
| shadcn charts on Recharts 2 | shadcn `chart` on Recharts 3 (needs react-is override under React 19) | Recharts 3 (2025) | The override is mandatory; documented on the official shadcn react-19 page. |
| `@supabase/auth-helpers` cookie get/set/remove | `@supabase/ssr` getAll/setAll | 2024 | Already adopted — not in scope, but confirms no auth touch this phase. |

**Deprecated/outdated:**
- Teal accent (`--primary: oklch(0.55 0.07 195)`) and grayscale `--chart-1..5` in current `globals.css` → replaced by gold accent + navy/gold categorical ramp.
- Grayscale chrome (`oklch(L 0 0)`) → navy-tinted chrome (hue ≈255–258).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inter Tight 600 as the added `--font-heading` (vs keeping Geist 600) | Standard Stack / Typography | Low — UI-SPEC already locks this with a Geist-600 fallback if perf/layout suffers; planner can swap with no structural change. |
| A2 | The exact OKLCH values in the UI-SPEC hit ≥4.5:1 in both modes | Pitfalls 4 | Medium — values are author-estimated, not tool-measured. Planner should add a contrast-check task in the polish sweep (light + dark) rather than trust the table blindly. |
| A3 | All ~20 routes' components read CSS vars with zero hardcoded colors | Runtime State / Pitfall 1 | Medium — verify by grep for literal `oklch(`/`#`/`195` (old teal hue) in `src/components`; any hardcode is a flip-integrity hole. |

**Note:** Items A2/A3 are verification tasks, not blockers — they belong in the planner's polish-sweep/contrast-check task.

## Open Questions

1. **Exact heading font family**
   - What we know: UI-SPEC locks Inter Tight 600 for headings/brand, Geist for body, Geist Mono for numbers; at most one added font.
   - What's unclear: whether Inter Tight via `next/font/google` is desired vs keeping Geist 600 (the conservative fallback).
   - Recommendation: ship Inter Tight; if `next build` shows a layout/perf regression, fall back to Geist 600 (the `--font-heading` var already exists).

2. **Whether to add `breadcrumb`**
   - What we know: UI-SPEC marks it optional (MEI sub-pages, reserva detail).
   - What's unclear: whether the user wants the extra wayfinding chrome.
   - Recommendation: defer to a single optional task; not required for any UI requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm | install recharts + override | ✓ | (project toolchain) | — |
| shadcn CLI | `shadcn add chart` | ✓ | ^4.11.0 (devDep) | Manually vendor `chart.tsx` from docs |
| `recharts` (post-install) | UI-04/05 | ✗ (to install) | 3.8.1 target | UI-SPEC keeps gauge/adherence custom; if recharts blocks, custom SVG donut is a fallback for UI-05 only |
| `next-themes` | UI-02 | ✓ (installed, unwired) | 0.4.6 | — |
| `tw-animate-css` | UI-08 shimmer | ✓ | 1.4.0 | CSS `@keyframes` |
| Local Supabase stack | running the 559 tests as the regression gate | ✓ (STATE.md: API 127.0.0.1:55321 left running) | 2.106.x CLI | `supabase start` |

**Missing dependencies with no fallback:** none (recharts installs cleanly; the only gate is the react-is override).
**Missing dependencies with fallback:** `recharts` — UI-05 donut could be hand-rolled SVG if Recharts ever blocks, but this is not expected.

## Validation Architecture

> `nyquist_validation: true` in config — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 + @testing-library/react 16 + jsdom |
| Config file | (vitest config in repo; `npm test` → `vitest run`) |
| Quick run command | `npm test -- <file>` (single file) |
| Full suite command | `npm test` (559 passed / 12 todo baseline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Token rewrite is color-only — all behavior tests stay green | regression | `npm test` (full suite) | ✅ existing 559 |
| UI-01 | `next build` compiles with new tokens + added font | build gate | `npm run build` | ✅ existing |
| UI-02 | ThemeToggle is mounted-guarded, renders 3 options | unit/component | `npm test -- theme-toggle` | ❌ Wave 0 |
| UI-04/05 | Chart components render with data + empty-state, format cents | component | `npm test -- receita-gasto-chart category-distribution-chart` | ❌ Wave 0 |
| UI-06 | Re-skinned gauge/adherence keep direction-aware tokens + aria | component (existing) | `npm test -- limite-gauge adherence-bar` | ⚠️ behavior tests exist; color not asserted |
| UI-07 | Table→card renders row data at `<md` | component | `npm test -- extrato-table` (add a mobile render case) | ⚠️ table tested; card branch new |
| UI-08 | Skeletons render; empty states show CTA | component | `npm test -- table-skeleton` | ❌ Wave 0 |
| all | react-is override → recharts renders in build | build gate | `npm run build` after override | ✅ existing |

### Sampling Rate
- **Per task commit:** `npm test -- <touched component>` + `tsc --noEmit`.
- **Per wave merge:** `npm test` (full suite must stay ≥559 green) + `npm run build`.
- **Phase gate:** Full suite green + `next build` clean + secret-bundle audit unaffected before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `theme-toggle.test.tsx` — mounted-guard + 3-way render (UI-02)
- [ ] `receita-gasto-chart.test.tsx` / `category-distribution-chart.test.tsx` — data + empty-state render, cents formatting (UI-04/05)
- [ ] `table-skeleton.test.tsx` (and card/chart skeleton smoke) (UI-08)
- [ ] A contrast/flip-integrity check is manual (human-verify) — not unit-automatable in jsdom; gate it in the polish-sweep human-verify plan.
- [ ] Recharts install + react-is override is verified by `next build`, not a unit test.

*Note: color/contrast is intentionally NOT unit-tested (jsdom has no rendering); it is a human-verify gate. The unit tests guard structure/behavior of new components.*

## Security Domain

> `security_enforcement` not set to false → included, but this is a presentation-only phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Untouched — auth flows frozen (re-skin only). |
| V3 Session Management | no | Untouched. |
| V4 Access Control | no | RLS/IDOR/ownership frozen; no new query or action. |
| V5 Input Validation | no | No new inputs/forms with data mutation; theme choice is client-only. |
| V6 Cryptography | no | No crypto in scope. |
| V14 Configuration | minimal | `package.json` `overrides` + one new dependency (`recharts`) — confirm no secret leaks into the client bundle remains true after the chart client component lands. |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| New client dependency widens client bundle / could pull a secret | Information Disclosure | `recharts` is a pure client viz lib (no server import); re-run the existing secret-bundle audit (`scripts/check-bundle-secrets.sh`) after `next build` — Phase 6's SEC-01 gate stays green. |
| Chart consumes data it shouldn't (cross-user) | Information Disclosure | Charts read ONLY RSC-fetched, RLS-scoped view data; no new query. The "no new query" rule is the control. |
| Supply-chain (malicious package) | Tampering | `recharts` passed the legitimacy seam (OK, 52M dl/wk, no postinstall). |

**Bottom line:** the security posture is "do not regress." The single concrete check is re-running the Phase-6 secret-bundle audit after the recharts client component is added.

## Sources

### Primary (HIGH confidence)
- `https://ui.shadcn.com/docs/components/chart` — ChartContainer/ChartConfig/ChartTooltip, `--chart-N` + `--color-{key}` theming, install command, bar + pie examples. `[CITED]`
- `https://github.com/pacocoursey/next-themes` — App Router ThemeProvider, `suppressHydrationWarning`, mounted-guard, anti-FOUC pre-paint script. `[CITED]`
- `https://ui.shadcn.com/docs/react-19` — official react-is override guidance for Recharts under React 19. `[CITED]`
- npm registry via `npm view` / legitimacy seam — recharts 3.8.1 (pub 2026-03-25, 52.8M dl/wk, no postinstall), next-themes 0.4.6, recharts peerDeps. `[VERIFIED]`
- Codebase inspection — `globals.css`, root + `(app)` + `(auth)` layouts, `app-sidebar`, `user-menu`, `dashboard/page.tsx`, `limite-gauge`, `adherence-bar`, `ui/sonner`, `package.json`, `components.json`, `node_modules/react-is@16.13.1` vs `react@19.2.4`. `[VERIFIED]`
- `.planning/phases/07-identidade-visual-e-polimento/07-UI-SPEC.md` — the locked design contract (token tables, sequencing, component inventory). `[CITED]`

### Secondary (MEDIUM confidence)
- WebSearch (shadcn/recharts/react-19 react-is) — corroborated the override requirement across multiple community sources + the official doc. `[VERIFIED via official source cross-check]`

### Tertiary (LOW confidence)
- none.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified on registry + locally; only one new dep.
- Architecture: HIGH — UI-SPEC is a complete contract, cross-checked against real files.
- Pitfalls: HIGH — react-is mismatch and font bug both confirmed by direct file/version inspection; FOUC pattern cited from the next-themes source.

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable stack; re-verify `recharts` version + `react-is` override at build time if more than ~30 days elapse).
