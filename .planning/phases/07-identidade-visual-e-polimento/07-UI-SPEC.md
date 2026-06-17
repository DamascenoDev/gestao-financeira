---
phase: 7
slug: identidade-visual-e-polimento
status: draft
shadcn_initialized: true
preset: base-nova
created: 2026-06-17
---

# Phase 7 — UI Design Contract (Navy + Gold Re-skin)

> The single source of truth for the **complete private-banking re-skin**: deep navy + gold (BTG Pactual / Mercury / Linear vibe — sophisticated, trustworthy, premium, information-dense), full dark mode, data-viz, mobile, and polish. This spec **REWRITES the global palette** established in Phases 2–3 and **re-maps every semantic money/status token** onto the new identity while preserving its meaning and contrast in light AND dark.
>
> **Re-skin only.** This phase touches the presentation layer exclusively. It does NOT change Server Actions, RLS, ownership/IDOR checks, money-as-bigint-centavos, `security_invoker` views, or any of the 584 behavior tests — those tests do not assert on color, so they must stay green. If a token rename would break a test, the test wins; rename the test selector, never the security logic.
>
> Stack locked: Next.js 16 App Router, TS strict, Tailwind v4 (`@theme` CSS-first), shadcn `base-nova` (neutral baseColor, `registries: {}`), lucide, pt-BR. Money only via `src/lib/money.ts`. `next-themes` is **already a dependency** (currently unwired) — this phase wires it.

---

## Inheritance & Delta (read first)

| Inherited from Phases 2–3 (KEEP the grammar) | This phase CHANGES |
|----------------------------------------------|--------------------|
| "Color is information, never decoration" — chrome stays low-chroma, saturated color only carries money meaning | The neutral chrome flips from **grayscale → navy**. The reserved accent flips from **teal → gold**. |
| Money semantics: income(+)/expense(neutral)/allocation/consumption; sign/color by `kind` never by value | All four money tokens **re-tuned in OKLCH** to keep ≥4.5:1 contrast against the new navy surfaces, light + dark |
| Direction-aware adherence (teto green-under/red-over, alvo green-at-target) + MEI tiered status | Same status logic, re-mapped tokens. Gold is fenced off so it never collides with money-green or alert-red |
| `--font-mono` (Geist Mono) tabular numbers as protagonists | Prose font gains personality (see Typography); mono numbers unchanged |
| 8-pt spacing, 3 prose sizes + mono, one-h1-per-page, density on tables | Unchanged spacing/scale; adds chart, theme-toggle, bottom-nav, skeleton grammar |
| All shadcn primitives already vendored | Adds `chart` (Recharts) + a charts override; wires `next-themes` provider |

Where this doc is silent, the Phase 2/3 contracts still govern the interaction (forms, selection bar, qual-reserva sub-flow, alvo-only progress, etc.). This phase changes how it **looks**, not how it **works**.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json` present, `registries: {}`) |
| Preset | `base-nova` style, `neutral` baseColor, CSS variables, RSC (unchanged) |
| Component library | Radix / base-ui (vendored) |
| Icon library | lucide |
| Font | **`--font-sans`: a refined sans for prose** (see Typography) · `--font-mono`: Geist Mono for all money/percent/counts (unchanged) |

**Design intent — "private banking, not fintech toy."** Deep navy as the calm, serious base; a single restrained **gold** accent that signals premium and brand without shouting; mono numbers as the loudest typographic element. Dense, precise, trustworthy. The screen should feel like a statement from a private bank, not a colorful budgeting app. Gold is **rare and reserved** — if everything is gold, nothing is.

---

## Color System — the heart (OKLCH, light + dark)

The current `:root`/`.dark` is grayscale-chrome + teal-primary. This phase **replaces the chrome with a navy scale and the accent with gold**, and re-tunes the semantic tokens. All values are OKLCH `L C H`. Navy hue ≈ **255–260**, gold hue ≈ **85–90**.

### Chrome — Light mode (`:root`)

| Token | OKLCH | Approx hex | Role (60/30/10) |
|-------|-------|-----------|-----------------|
| `--background` | `0.985 0.004 255` | `#fbfcfe` | Dominant (60%) — page, content surface, table body. Near-white with the faintest cool navy tint, not pure white. |
| `--foreground` | `0.22 0.03 258` | `#1d2433` | Body text — deep navy-ink, not black. |
| `--card` / `--popover` | `1 0 0` | `#ffffff` | Secondary (30%) — cards/dialogs sit pure-white above the tinted page (subtle lift). |
| `--card-foreground` / `--popover-foreground` | `0.22 0.03 258` | `#1d2433` | Text on cards |
| `--secondary` | `0.95 0.012 255` | `#eef1f6` | Secondary surfaces, quiet buttons |
| `--secondary-foreground` | `0.30 0.03 258` | `#2b3346` | Text on secondary |
| `--muted` | `0.955 0.01 255` | `#eff1f6` | Muted surfaces, table header row, bar track, selected-row |
| `--muted-foreground` | `0.52 0.025 258` | `#697287` | Meta/label/helper text (≥4.5:1 on background) |
| `--accent` | `0.95 0.012 255` | `#eef1f6` | Hover surface (NOT the brand) |
| `--accent-foreground` | `0.30 0.03 258` | `#2b3346` | Text on hover surface |
| `--border` / `--input` | `0.90 0.012 255` | `#dde2eb` | Hairline dividers, input borders |
| `--ring` | `0.78 0.12 88` | gold | Focus ring = gold (brand) |

### Brand accent — Gold (light)

| Token | OKLCH | Approx hex | Role |
|-------|-------|-----------|------|
| `--primary` | `0.76 0.13 88` | `#c79a3a` | Accent (10%) — brand, primary CTA fill, active nav, selected control. A muted, metallic gold (lower chroma than pure yellow so it reads "private banking" not "warning"). |
| `--primary-foreground` | `0.20 0.03 258` | `#1d2433` | Navy ink ON gold (gold is light → dark text, ≥4.5:1) |

### Chrome — Dark mode (`.dark`) — the deep-navy hero surface

| Token | OKLCH | Approx hex | Role |
|-------|-------|-----------|------|
| `--background` | `0.20 0.03 258` | `#161b29` | Dominant — deep navy canvas (this is the signature BTG surface) |
| `--foreground` | `0.96 0.008 255` | `#f3f5f9` | Off-white text |
| `--card` / `--popover` | `0.245 0.032 258` | `#1e2435` | Secondary — slightly lifted navy panels |
| `--card-foreground` | `0.96 0.008 255` | `#f3f5f9` | Text on cards |
| `--secondary` | `0.28 0.03 258` | `#252c3e` | Quiet surfaces |
| `--secondary-foreground` | `0.96 0.008 255` | `#f3f5f9` | — |
| `--muted` | `0.28 0.03 258` | `#252c3e` | Header rows, tracks |
| `--muted-foreground` | `0.70 0.025 258` | `#a3acc0` | Meta text (≥4.5:1 on navy) |
| `--accent` | `0.30 0.032 258` | `#2a3247` | Hover surface |
| `--accent-foreground` | `0.96 0.008 255` | `#f3f5f9` | — |
| `--border` | `0.98 0 0 / 9%` | navy-translucent | Hairlines (white @ ~9%) |
| `--input` | `0.98 0 0 / 14%` | — | Input borders |
| `--ring` | `0.82 0.13 88` | gold | Focus ring = gold |

### Brand accent — Gold (dark)

| Token | OKLCH | Approx hex | Role |
|-------|-------|-----------|------|
| `--primary` | `0.82 0.13 88` | `#e0b85c` | Brighter gold for navy ground (raised L for contrast) |
| `--primary-foreground` | `0.20 0.03 258` | `#161b29` | Navy ink on gold |

### Semantic money/status tokens — re-mapped, meaning preserved (light → dark)

The **meaning is sacred** (Phase 2/3 rules). Only the OKLCH coordinates move so each token stays legible on navy. Gold's hue (88) is deliberately kept **away** from money-green (≈150) and alert-red (≈25–27) so the accent never reads as a financial signal.

| Token | Light OKLCH | Dark OKLCH | Meaning (unchanged) |
|-------|-------------|------------|---------------------|
| `--income` / `--color-income` | `0.60 0.13 152` | `0.72 0.15 152` | Receita / money-in / `alvo` atingido. Emerald-green, **not** gold. |
| `--income-foreground` | `0.985 0 0` | `0.20 0.03 258` | Text on income fill |
| `--expense` | `0.22 0.03 258` (= foreground) | `0.96 0.008 255` (= foreground) | Gasto — **neutral foreground, never red.** A gasto is normal. |
| `--allocation` | `0.58 0.11 250` | `0.74 0.12 250` | Alocação (investimento/poupança) — a **blue-violet, pushed off the navy chrome hue (258→250) and lower-L vs nothing** so it reads as a signal, not chrome. Distinguishes "saving" from "spending". |
| `--consumption` | `0.62 0.10 70` | `0.74 0.11 70` | Consumo — warm amber/bronze. **Distinct from gold-88**: consumption sits at hue 70 (warmer, lower-chroma) so it never collides with the gold brand accent. |
| `--destructive` | `0.58 0.22 27` | `0.70 0.19 25` | Errors + destructive confirms + `teto` over-limit ONLY |
| `--destructive-foreground` | `0.985 0 0` | `0.20 0.03 258` | Text on destructive |

**Collision audit (must hold):**
- Gold brand `H≈88` · Consumption `H≈70` · Income `H≈152` · Allocation `H≈250` · Destructive `H≈27` → all ≥18° apart from gold; gold↔consumption are the closest (18°) but separated by chroma (gold 0.13 vs consumption 0.10) and context (brand-only vs category-badge-only). Acceptable and intentional.
- **The "is this over-limit?" red and the "money-in" green are maximally far from gold** — the two signals users must never confuse with the brand.

### Data-viz palette (`--chart-1..5`) — navy+gold series

Currently grayscale; replace with a coherent navy+gold-anchored categorical ramp that does **not** reuse the semantic money hues for arbitrary categories (so a chart slice never accidentally looks like "income").

| Token | Light OKLCH | Dark OKLCH | Use |
|-------|-------------|------------|-----|
| `--chart-1` | `0.76 0.13 88` (gold) | `0.82 0.13 88` | Primary series (e.g. gasto line, largest slice) |
| `--chart-2` | `0.45 0.06 258` (navy) | `0.66 0.07 258` | Secondary series (e.g. receita line) |
| `--chart-3` | `0.58 0.11 250` | `0.74 0.12 250` | 3rd |
| `--chart-4` | `0.62 0.10 70` | `0.74 0.11 70` | 4th |
| `--chart-5` | `0.55 0.09 200` | `0.70 0.10 200` | 5th |

For the **receita-vs-gasto evolution chart specifically**, override the series to the semantic tokens: receita = `--income` (green), gasto = `--expense`/foreground-tint or `--consumption`. The categorical ramp above is for the **category-distribution** chart where slices are arbitrary categories.

### Sidebar tokens (navy chrome)

| Token | Light | Dark |
|-------|-------|------|
| `--sidebar` | `0.97 0.008 255` (`#f1f3f8`) | `0.175 0.028 258` (`#12172333`→`#121723`, deeper than canvas) |
| `--sidebar-foreground` | `0.30 0.03 258` | `0.92 0.01 255` |
| `--sidebar-primary` | `0.76 0.13 88` (gold) | `0.82 0.13 88` (gold) |
| `--sidebar-primary-foreground` | `0.20 0.03 258` | `0.16 0.03 258` |
| `--sidebar-accent` | `0.94 0.012 255` | `0.245 0.032 258` |
| `--sidebar-accent-foreground` | `0.30 0.03 258` | `0.92 0.01 255` |
| `--sidebar-border` | `0.90 0.012 255` | `0.98 0 0 / 8%` |
| `--sidebar-ring` | `0.78 0.12 88` | `0.82 0.13 88` |

**Active nav item:** gold text + subtle `--sidebar-accent` background + a 2px gold left-border indicator. The dark sidebar runs **deeper** than the canvas (`#121723` < `#161b29`) so it reads as a distinct navigational rail.

**`@theme inline` additions:** mirror every new/renamed token (`--color-income`, `--color-allocation`, `--color-consumption`, `--color-chart-*`, `--color-destructive-foreground` if added) so Tailwind utilities (`bg-income`, `text-allocation`, `bg-chart-1`, etc.) resolve. Keep the existing radius scale.

---

## Brand / Logo

A simple, type-led wordmark — no illustration (illustrations are deferred).

- **Mark:** a monogram tile — rounded-square (`--radius-lg`) filled **navy** with a **gold** glyph. Glyph = a stylized "**₲/G**"-less approach: use a **gold ascending bar-trio** (three vertical bars of rising height) inside the navy tile — reads as "growth + ledger" and is trivially drawable as 3 `<rect>`s in an inline SVG (no asset pipeline). 24px in the sidebar header, 32px on auth.
- **Wordmark:** "**Gestão Financeira**" in `--font-sans` weight 600, with "**Financeira**" optionally in gold on the auth/landing hero only (never in-app chrome, to keep gold reserved). In-app the wordmark is foreground-colored; only the mark tile carries gold.
- **Favicon:** the navy tile + gold bar-trio, exported as a single SVG favicon.
- Keep it inline-SVG + token-driven so it auto-themes (gold/navy come from CSS vars), no PNG variants per theme.

---

## Dark Mode Strategy

| Decision | Choice |
|----------|--------|
| Mechanism | **`next-themes`** (already a dependency) — `class` strategy driving the existing `.dark` class + `@custom-variant dark` already in `globals.css`. |
| Provider | Add `ThemeProvider` (`next-themes`) in **root `layout.tsx`**, wrapping `{children}`. Add `suppressHydrationWarning` to `<html>`. `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. |
| Persistence | `next-themes` writes `localStorage` + respects `prefers-color-scheme`; no flash (it injects the pre-hydration script). |
| Toggle placement | In the **`UserMenu`** dropdown (top bar) as a 3-way segment **Claro / Escuro / Sistema** (lucide `sun` / `moon` / `monitor`). Mirror it into the **mobile drawer footer**. One toggle component (`ThemeToggle`), `mounted`-guarded to avoid hydration mismatch. |
| Default | `system` (the app already defines both palettes; respect the OS). |
| Token flip | Every token has a `:root` and `.dark` value in the table above — the flip is purely CSS-var swap; no component reads a hardcoded color. The print stylesheet already forces white — keep it (the DASN report prints on white regardless of theme). |

**Flip integrity rule:** the checker must verify each semantic token keeps its *meaning and ≥4.5:1 text contrast* in BOTH modes. Income stays green, expense stays neutral-foreground, teto-over stays red, alvo-met stays green, gold stays brand-only — in light and dark.

---

## Data-Viz (UI-04 / 05 / 06)

**Charts library decision — resolved (Claude's discretion):** Adopt **shadcn `chart` (Recharts 3.x)** for the new dashboard charts. Rationale: it is the officially-wrapped, token-aware (`ChartContainer` consumes our CSS vars), theme-reactive path the stack already anticipated (STACK.md lists `recharts` 3.8.x + the `react-is` override). The Phase-3 `AdherenceBar` and `LimiteGauge` stay **custom** (a div/flex bar reads faster than a chart for "X% vs Y% meta" and avoids chart overhead) — Recharts is added ONLY for the three genuinely-graphical views below.

**Tradeoff noted (the `react-is` override):** Recharts 3 under React 19 requires a `package.json` `overrides: { "react-is": "19.x" }` matching the installed React. `overrides` is currently empty — the planner must add this in the charts task and re-run install; the executor verifies `next build` + the 584 tests still pass after. This is the only new runtime dependency in the phase.

| Chart | Route | Type | Palette |
|-------|-------|------|---------|
| **Evolução mensal receita vs gasto** | `/dashboard` | Grouped/line chart over `eachMonthOfInterval` (last ~12 months, SP-pinned). Receita line/bar = `--income` (green), Gasto = `--consumption` (amber) or `--expense`-tint. Tooltip = `formatCents`. | semantic |
| **Distribuição por categoria (mês)** | `/dashboard` | Donut/horizontal-bar of the selected month's gasto por categoria. Slices use the `--chart-1..5` ramp + repeat, NOT the money tokens. Center label = total `formatCents`. | categorical ramp |
| **Aderência (rich) + Gauge MEI** | `/dashboard`, `/mei` | Keep `AdherenceBar`/`LimiteGauge` as custom div-bars but re-skin them with the new direction-aware tokens (teto amber→red, alvo →green, gauge tiered green/amber/red from `meiStatusTokens`). The MEI gauge gains a subtle radial/arc treatment but stays token-driven and accessible. | direction-aware semantic |

**Chart rules:** all charts read CSS-var colors (auto-theme in dark); all money in tooltips/axes via `formatCents`; charts degrade to an empty-state (see Polish) when there's no data; no chart is the *sole* carrier of a number (a labeled total/legend always accompanies it). Charts are `aria-label`led and ship a data table fallback where feasible.

---

## Spacing Scale

Inherited unchanged (8-pt, multiples of 4). No new values.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label, badge padding, nav-indicator |
| sm | 8px | Dense table cell padding, bar height (`h-2`), chart legend gap |
| md | 16px | Card padding, form gaps, chart inner padding |
| lg | 24px | Section gaps, dialog padding, dashboard grid gap |
| xl | 32px | Major block gaps, auth hero padding |
| 2xl | 48px | Empty-state centering, auth panel vertical rhythm |
| 3xl | 64px | Landing/auth hero spacing |

**Exceptions:** dense table rows stay **40px** on desktop (carried from Phase 2); icon-only controls keep a **44px** hit area; **bottom-nav** items are **≥48px** tall touch targets on mobile; chart containers get a fixed aspect ratio (`aspect-video` / `h-[240px]`) not an arbitrary pixel height.

---

## Typography

Mono numbers stay protagonists. Prose gains personality without breaking the 3-size + mono rule or the 2-weight rule.

| Role | Size | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| Body / table cell | 14px (`text-sm`) | 400 | 1.5 | Dense data tool; unchanged |
| Label / meta | 12px (`text-xs`) | 400 | 1.4 | Uppercase `tracking-wide` table headers, badges, helper |
| Heading | 20px (`text-xl`) | 600 | 1.2 | One h1 per screen, dialog titles |
| Display / hero | 28px (`text-3xl`) mono | 600 | 1.2 | Hero money figures (receita líquida, saldo, MEI faturamento) — mono, tabular |
| Money / numeric | 14px mono | 600 | 1.5 | Geist Mono, `tabular-nums`, right-aligned |

**Prose font (personality):** keep **`--font-sans` = Geist** as the safe default OR upgrade to a more refined grotesque/serif-accented sans for headings only. **Recommendation:** introduce **one** additional `next/font` for **headings + brand** (`--font-heading`) — a slightly more characterful sans (e.g. a humanist/grotesque such as *Inter Tight*, *Geist* kept for body, or a refined serif like *Fraunces*/*Newsreader* for the auth hero ONLY). To stay conservative and avoid scope creep, the **locked default** is: body/UI = Geist (unchanged), **headings + brand wordmark = `--font-heading` mapped to a single added display sans (Inter Tight 600)**; mono = Geist Mono. The executor adds at most ONE font; if it risks layout/perf, fall back to Geist 600 for headings (the `--font-heading` var already exists in `@theme`, currently aliased to `--font-sans`).

Rules unchanged: exactly one `text-xl` h1 per page; weight 600 reserved for headings, money, percentages, active nav; hierarchy via `foreground` vs `muted-foreground`, not extra weights.

---

## Color (60/30/10 restated under navy+gold)

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` (tinted near-white / deep navy) | Page, content, table body, chart canvas |
| Secondary (30%) | `--card` / `--muted` / `--sidebar` | Cards, dialogs, nav rail, table header, bar tracks, selected rows |
| Accent (10%) | `--primary` (**gold**) | Primary CTA (one per surface), active nav item + indicator, focus ring, checked controls, brand mark, chart-1 series |
| Income | `--income` (green) | Receita `+`, alvo atingido, receita series |
| Allocation / Consumption | `--allocation` / `--consumption` | Category-kind badges + adherence fills only |
| Destructive | `--destructive` (red) | Delete confirms, errors, teto over-limit only |

**Gold (`--primary`) reserved for:** primary action button (one per surface), active nav item + its left-indicator, focus rings, checked selection controls, the brand mark, and the `chart-1` primary series. **Never** for income (green owns money-in), never for a category color, never as a generic link (links = `foreground` underline or `primary` on hover only), never on a card background. On the Extrato the only gold is "Novo lançamento" + any active filter + the active nav item. The 60/30/10 must hold: most pixels are navy chrome; gold stays under ~10% and only where it carries brand/action meaning.

---

## Component Inventory

**Reuse (re-skinned, NOT rewritten):** every existing `ui/*` primitive + all composites (`AdherenceBar/Row/SummaryStrip`, `LimiteGauge`, `AmountCell`, `CategoryBadge`, `MonthSelector`, `YearSelector`, `MoneyInput`, `ReservaCard/Progress/LedgerTable/Picker`, `SelectionActionBar`, `ExtratoTable`, `ImportReviewTable`, `NfTable/Form`, `DasnReportView`, `MeiDisclaimer`, `app-sidebar`, `user-menu`). Re-skin = token + spacing + state polish; behavior and props are frozen.

**Add (shadcn official registry — safety not required):**

| Component | Used by | Purpose |
|-----------|---------|---------|
| `chart` (+ `recharts`) | `/dashboard`, `/mei` | The two new graphical charts + optional gauge polish. Token-aware `ChartContainer`. |
| `breadcrumb` (optional) | MEI sub-pages, reserva detail | Light wayfinding under the navy header |

**New custom composites (vendored):**

| Composite | Purpose |
|-----------|---------|
| `ThemeProvider` | `next-themes` wrapper in root layout |
| `ThemeToggle` | 3-way Claro/Escuro/Sistema control in `UserMenu` + mobile drawer |
| `BrandMark` | Inline-SVG navy tile + gold bar-trio (auto-theming) |
| `BottomNav` | Mobile `<md` bottom navigation bar (icon + label, ≥48px targets, active = gold) |
| `ReceitaGastoChart` | Recharts evolution chart (receita vs gasto over months) |
| `CategoryDistributionChart` | Recharts donut/bar of month gasto por categoria |
| `EmptyState` polish, `TableSkeleton`, `CardSkeleton`, `ChartSkeleton` | Consistent loading/empty grammar (wrap shadcn `empty`/`skeleton`) |
| `AuthShell` | Identity-carrying two-panel auth/landing layout |

No new third-party registries. `registries: {}` unchanged. Recharts is an npm dep (with the `react-is` override), not a registry block.

---

## Screen Contracts (re-skin deltas)

Behavior is frozen from Phases 1–6; these are the **visual/interaction deltas**.

- **App shell (`(app)/layout.tsx` + `app-sidebar`):** navy sidebar rail (deeper than canvas in dark) with `BrandMark` + wordmark at top; active item = gold text + gold left-indicator + subtle accent bg. Top bar gains `ThemeToggle` (in `UserMenu`). `<md`: sidebar → off-canvas drawer (existing `sheet`) **plus** a persistent `BottomNav` for the 4–5 primary destinations (Dashboard, Extrato, Importar, MEI, Reservas) — drawer holds the full nav + theme toggle + logout.
- **Dashboard (`/dashboard`):** add the two Recharts charts above the adherence list (responsive 2-col `lg`, stacked `<md`); re-skin `AdherenceRow`/`SummaryStrip` with navy cards + gold CTA. Hero figure 28px mono.
- **MEI (`/mei`):** re-skin `LimiteGauge` with tiered status (green/amber/red) on navy; keep `MeiDisclaimer` prominent. Report (`/mei/relatorio`) print path unchanged (forces white).
- **Extrato / Import review / NF / Ledger tables:** re-skin dense tables; `<md` collapse to **one card per row** (existing Phase-2/3 pattern — Descrição + Categoria on top line, Data + Valor mono on second). `SelectionActionBar` floats bottom on mobile.
- **Login / landing (`/auth/login`, `/auth/signup`) — UI-03:** replace the bare form with **`AuthShell`**: a two-panel layout — left (`<md`: top) **navy brand panel** with the `BrandMark`, wordmark (gold "Financeira" allowed here), a one-line value prop ("Sua gestão financeira pessoal, privada e precisa."), and the MEI/private framing; right = the existing auth form on `--card`. On mobile the navy panel becomes a compact header band over the form. Carries identity without an illustration.
- **Conta / LGPD:** re-skin; destructive `AccountDeleteZone` keeps `border-destructive` + type-to-confirm (unchanged behavior).

---

## Polish — Empty / Loading / Error / Micro-interactions (UI-08)

**Consistent grammar across all ~20 routes:**

- **Empty:** always the shadcn `empty` primitive — lucide icon (in `--muted-foreground`) + `text-xl` heading + `text-sm muted` body (states the next step) + one gold CTA. (Copy table below + inherit Phase 2/3 strings verbatim.)
- **Loading:** **skeletons, never spinners** for content. `TableSkeleton` (header + N shimmer rows), `CardSkeleton` (grid), `ChartSkeleton` (aspect box + shimmer). Keep page chrome (header, nav, filters) visible while body streams. Use `tw-animate-css` shimmer (already a dep).
- **Error:** inline `text-destructive` block with the problem + recovery path; never a raw stack. Toasts (`sonner`, already themed via `next-themes`) for transient action results.
- **Micro-interactions:** `transition-colors`/`transition-[background,border,box-shadow]` at **150ms ease-out** on interactive surfaces (buttons, nav, rows, cards on hover). Focus = gold ring (`--ring`), always visible. `disableTransitionOnChange` on the theme provider so the theme flip is instant (no full-page color animation). Respect `prefers-reduced-motion`: shimmer/transitions reduce to opacity-only. No bounce, no decorative motion (advanced motion deferred).

---

## Money & Number Formatting

Unchanged from Phases 2–3: every value via `formatCents`/`parseBRLToCents`; mono `tabular-nums`; sign/color by `kind` not value; percentages `maximumFractionDigits:1` (`72,5%`); dates `dd/MM/yyyy` (`dd/MM` dense) pinned to `America/Sao_Paulo`; never `NaN%`. Charts also format all money through `formatCents`.

---

## Responsive Behavior

Mobile-first refinement (UI-07) over the existing desktop-first density.

- **Nav `<md`:** off-canvas drawer (full nav + theme + logout) **+** persistent `BottomNav` (primary destinations, gold active). `≥md`: icon-rail; `≥lg`: full-label sidebar.
- **Dense tables `<md`:** Extrato, Import review, NF, Ledger → **one card per row** (mono Valor + Categoria badge prominent; Data secondary). Selection → tap-select + floating bottom `SelectionActionBar`. Filters → single "Filtros" sheet.
- **Charts `<md`:** stack single-column; donut shrinks, legend wraps below; evolution chart keeps last 6 months on narrow widths.
- **Dialogs `<md`:** full-width sheet-style, single-column forms (already).
- Money/number cells never wrap; truncate descriptions with `tooltip`.

---

## Accessibility Basics

- Color never the sole signal (carried over): income shows `+`, adherence/MEI status show text label + glyph, category shows name beside dot, chart slices show legend labels.
- Contrast: every token tuned ≥4.5:1 for text, ≥3:1 for non-text indicators, in **light AND dark** (checker verifies the flip). Gold-on-navy CTA and navy-on-gold text both ≥4.5:1.
- Focus: visible gold ring on every interactive element; keyboard-reachable; `ThemeToggle` and `BottomNav` are real buttons/links with `aria-label`s.
- Theme toggle `mounted`-guarded; `suppressHydrationWarning` on `<html>`; no hydration flash.
- `prefers-reduced-motion` honored. Charts `aria-label`led with a text/total fallback; destructive flows keep focus-trapped `alert-dialog`.

---

## Copywriting Contract

All copy pt-BR, calm/direct/second-person, no exclamation. **Inherits every Phase 2/3/5/6 string verbatim** (Receitas/Categorias/Extrato/Metas/Reservas/MEI/LGPD). New strings this phase:

| Element | Copy |
|---------|------|
| Brand value prop (auth) | "Sua gestão financeira pessoal — privada, precisa e sob seu controle." |
| Theme toggle | "Tema" → "Claro" · "Escuro" · "Sistema" |
| Empty (dashboard charts, no data) | **Sem dados para o gráfico** — "Lance receitas e gastos para ver a evolução do mês aqui." |
| Empty (category distribution) | **Nenhum gasto neste mês** — "Os gastos por categoria aparecem aqui quando você lançar transações." |
| Chart aria/total label | "Evolução de receita e gasto por mês" · "Distribuição de gastos por categoria em {mês}" |
| Loading (generic) | (skeleton, no copy) |
| Error (generic, inherited) | "Não foi possível carregar {recurso}. Tente recarregar a página." |
| Login hero CTA | "Entrar" (unchanged) · Signup "Criar conta" (unchanged) |

Primary CTA per surface and all destructive/empty/error copy remain as defined in the inherited specs — this phase does not rename them.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | chart, breadcrumb (new) + all previously-vendored primitives | not required (official registry) |

No third-party registries declared. `registries: {}` in `components.json` (verified). Registry vetting gate: not applicable. New runtime dep: `recharts` (npm, via shadcn `chart`) + `react-is` override — a package dependency, not a registry block; vetted by STACK.md.

---

## Implementation Sequencing (for the planner)

1. **Tokens-first** — rewrite `globals.css` `:root`/`.dark` (chrome navy + gold accent + re-mapped semantic + chart tokens) and `@theme inline` mirrors. Run the 584 tests + `next build` (color-only change → must stay green). This is the BLOCKING substrate.
2. **Theme infra** — wire `next-themes` `ThemeProvider` in root layout + `suppressHydrationWarning`; build `ThemeToggle`; verify no flash + persistence.
3. **Brand + shell** — `BrandMark`, sidebar/top-bar re-skin, active-gold nav.
4. **Component re-skin pass** — all `ui/*` + composites adopt new tokens + polish (empty/skeleton/error grammar, 150ms transitions).
5. **Charts** — add `recharts` + `react-is` override; build `ReceitaGastoChart` + `CategoryDistributionChart`; re-skin gauge/adherence; verify build + tests.
6. **Mobile** — `BottomNav`, table→card collapse audit, chart responsiveness.
7. **Auth/landing** — `AuthShell`.
8. **Polish sweep** — per-route empty/loading/error consistency + a11y/contrast check (light + dark).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
