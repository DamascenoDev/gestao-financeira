---
phase: 11
slug: detalhe-do-carro-gr-fico-de-consumo
status: draft
shadcn_initialized: true
preset: base-nova
created: 2026-06-17
---

# Phase 11 — UI Design Contract (Carro: detalhe enriquecido + gráfico de consumo)

> **LEAN spec — reference, do not re-derive.** The complete design system (navy+gold OKLCH tokens light+dark, Inter Tight headings, Geist/Geist Mono, shadcn `base-nova`, money/status semantics, chart grammar via shadcn `chart`/recharts, empty/loading/error grammar, mobile table→card + BottomNav) is **LOCKED and shipped in Phase 7** — see `.planning/phases/07-identidade-visual-e-polimento/07-UI-SPEC.md`. The Carro module's visual contract (identity card, nav entry, dialog grammar, copy tone) was set in **Phase 8** — see `.planning/phases/08-substrato-carro-crud-navega-o/08-UI-SPEC.md`. This phase introduces **zero new design tokens, zero new npm deps** (recharts already vendored), and **zero new third-party registries**.
>
> This document specs ONLY the **new Phase-11 surfaces** (CAR-05 capstone):
> 1. The **enriched `/carros/[id]` detail layout** — 3 KPI stat cards (km/l médio · R$/km · gasto total), a "gasto por categoria" horizontal-bar section (AdherenceBar visual grammar), the **consumption line chart** (km/l over time, recharts via shadcn `chart`, mirroring `ReceitaGastoChart`), and the **existing Phase-10 `AbastecimentoHistory`** integrated into the layout — plus the section order + responsive stacking.
> 2. The `/carros` list: **add gasto total + km/l médio** to each `CarroCard` (completing the Phase-8 identity-only card from `v_carro_resumo`).
> 3. Money/status semantics for the above: gasto in pt-BR `R$`, chart line on a chart token that flips with theme, and the empty/loading/error grammar reused verbatim.
>
> **Pure presentation / re-skin-only.** No business logic, metas, or contabilidade changes (CONTEXT.md "lente" rule, D4). Any new view is `security_invoker=true` and read-only. The bundle-secret audit (SEC-01) is re-run after the new chart client component.
>
> Stack locked (inherited): Next.js 16 App Router, TS strict, Tailwind v4, shadcn `base-nova` (`registries: {}` — verified), lucide, pt-BR. Money only via `src/lib/money.ts` (`formatCents`), cents-as-bigint internally; consumption labels via `src/lib/carro/consumo.ts` (`kmPerLitroLabel`, `reaisPerKmLabel`).

---

## Inheritance (read first — what this phase REUSES verbatim)

| Concern | Inherited — reference, do not redefine |
|---------|----------------------------------------|
| Color tokens (navy chrome + gold accent + semantic money/status + `--chart-1..5`, light+dark) | 07-UI-SPEC §Color System. No new tokens. |
| Typography (3 prose sizes + mono `text-3xl`/`text-lg` display, 2 weights, Inter Tight heading) | 07-UI-SPEC §Typography |
| Spacing (8-pt scale + table-row/touch/chart-aspect exceptions) | 07-UI-SPEC §Spacing Scale |
| Chart grammar (shadcn `chart`/`ChartContainer` token-aware, `formatCents` tooltip, empty-state, `aria-label`, never sole carrier of a number) | 07-UI-SPEC §Data-Viz; analog component `ReceitaGastoChart` (`src/components/receita-gasto-chart.tsx`) |
| Empty / loading / error grammar (shadcn `empty`, `CardSkeleton`/`ChartSkeleton`, `text-destructive` inline, never spinner) | 07-UI-SPEC §Polish |
| Horizontal-bar visual grammar (`h-2` `bg-muted` track + token fill + mono label, color never sole signal) | `AdherenceBar` (`src/components/adherence-bar.tsx`) |
| Abastecimento history (table→card mobile, averages block, RowActions) | `AbastecimentoHistory` (`src/components/abastecimento-history.tsx`, Phase 10) — **integrate, do not rebuild** |
| Carro identity card + dialog + nav + copy tone | 08-UI-SPEC; `CarroCard` (`src/components/carro-card.tsx`) |
| Money/date formatting (`formatCents`, mono `tabular-nums`, `dd/MM` SP-pinned, `—` for null) | 07-UI-SPEC §Money; `src/lib/money.ts`, `src/lib/carro/consumo.ts` |

Where this doc is silent, the Phase-7 and Phase-8 contracts govern. This phase enriches an existing module surface; it adds no new look.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json` present, `style: base-nova`, `baseColor: neutral`, `registries: {}`) |
| Preset | `base-nova` (inherited, unchanged) |
| Component library | Radix / base-ui (vendored) |
| Icon library | lucide (`Car` page header; KPI affordances may use `Gauge` / `Fuel` / `Receipt` — optional, decorative only, never the sole signal) |
| Font | `--font-sans` Geist (body/UI) · `--font-heading` Inter Tight 600 (headings) · `--font-mono` Geist Mono (all numeric/money/consumption) — all inherited |

---

## Spacing Scale

Inherited unchanged from Phase 7 (8-pt, multiples of 4). No new values.

| Token | Value | Usage this phase |
|-------|-------|------------------|
| xs | 4px | KPI label→value gap, bar→label gap, chart legend dot gap |
| sm | 8px | Bar track height (`h-2`), category-bar row gap |
| md | 16px | Card padding, KPI card inner padding, chart inner padding |
| lg | 24px | Detail section gaps (`gap-6`), KPI grid gap, list grid gap |
| xl | 32px | Page header → first section gap |
| 2xl | 48px | Empty-state vertical centering |

**Exceptions (inherited):** dense `AbastecimentoHistory` table rows stay 40px desktop; icon-only controls keep a 44px hit area; the consumption chart uses a **fixed aspect/min-height** (`min-h-[240px]`, matching `ReceitaGastoChart`), never an arbitrary pixel height. No new exceptions this phase.

---

## Typography

Inherited unchanged. Roles touched this phase:

| Role | Size | Weight | Line Height | Used by |
|------|------|--------|-------------|---------|
| Heading (h1) | 20px (`text-xl`) | 600 (Inter Tight) | 1.2 | `/carros/[id]` car apelido (the single h1) |
| Section heading (h2) | 14px (`text-sm`) | 600 | 1.2 | "Gasto por categoria", "Consumo (km/l)", "Abastecimentos" section labels |
| KPI value (display) | 20px (`text-xl`) mono | 600 | 1.2 | The 3 stat-card figures — mono `tabular-nums`; `—` when null |
| Body / cell | 14px (`text-sm`) | 400 | 1.5 | Identity line, category names, chart axis |
| Label / meta | 12px (`text-xs`) | 400 | 1.4 | KPI labels ("km/l médio"), category-bar value labels, helper text |
| Money / numeric | 14px mono | 600 | 1.5 | Category-bar amounts, list-card KPIs (`tabular-nums`, right-aligned) |

Exactly **one `text-xl` h1 per screen** — the car apelido on `/carros/[id]`. The 3 KPI figures are `text-xl` mono **values** inside cards, not page headings (no competing h1). KPI figures stay mono `tabular-nums`; consumption uses `kmPerLitroLabel`/`reaisPerKmLabel`, money uses `formatCents`. Weight 600 reserved for headings, money, and KPI values (the established rule).

---

## Color

Inherited verbatim from Phase 7 (60/30/10 under navy+gold). This phase introduces **no new color** and reads only existing tokens. **Never invent a color for money or status.**

| Role | Token | Usage this phase |
|------|-------|------------------|
| Dominant (60%) | `--background` | Detail page + list canvas, chart canvas |
| Secondary (30%) | `--card` / `--muted` | KPI stat cards, chart card, category-bar track (`bg-muted`), section surfaces |
| Accent (10%) | `--primary` (gold) | Active "Carros" nav item + indicator, focus rings, and the consumption-chart line via `--chart-1` (gold). **No new gold CTA on the detail page** (detail is read-only presentation; "Registrar abastecimento" already exists from Phase 10 as the one primary action). |
| Consumption series | `--chart-1` | The km/l line — gold primary series, token-aware (flips with `.dark` automatically; same as `ReceitaGastoChart`'s receita/gasto series). |
| Category bars | `--muted-foreground` (neutral fill) | Gasto-por-categoria bars are a **proportional magnitude** view (share of the car's total), NOT a meta-adherence view — so the fill is a **neutral foreground tint**, never the income/consumption/allocation semantic tokens (those carry kind-meaning that does not apply here) and never gold. |
| Destructive | `--destructive` | Only inline error text + the inherited `AbastecimentoHistory` delete-confirm. Not used elsewhere this phase. |

**Accent (gold) reserved for:** active "Carros" nav item, focus rings, and the `--chart-1` consumption line. **Never** for KPI figures (they are mono `foreground`), never for category-bar fills, never as a card background, never for money values. The 60/30/10 holds: most pixels are navy chrome + secondary cards; gold appears only in the single chart series + nav/focus.

**Money/status semantics (preserved):** gasto total renders in pt-BR `R$` via `formatCents`, neutral `foreground` (a gasto is normal — never red, per the locked `--expense` rule). `—` (em-dash) is the single sentinel for any null KPI/cell (no `R$ 0,00`, no `NaN`, no `0 km/l`). The consumption line follows the same theme-flip discipline as every Phase-7 chart.

---

## Screen Contracts (new + enriched surfaces only)

### 1. `/carros/[id]` — enriched detail layout (CAR-05)

The Phase-8 minimal detail (identity + Editar/Arquivar actions) and the Phase-10 abastecimento section are the base. This phase composes the full page. **Section order, top → bottom:**

1. **Header (inherited from Phase 8/10):** car **apelido** as the single `text-xl` h1 (Inter Tight 600); secondary line **modelo · placa · ano** (`text-sm text-muted-foreground`, null fields omitted via the existing `identityLine` pattern); "Arquivado" badge if archived; header action area keeps Editar + Arquivar/Desarquivar.

2. **KPI stat cards — 3 cards (CAR-05.1):** a responsive row — `grid grid-cols-1 gap-6 sm:grid-cols-3` (one column on mobile, three across `≥sm`). Each card is a `--card` surface (`Card`/`CardContent`) with:
   - a `text-xs text-muted-foreground` label, and
   - a `text-xl font-mono font-semibold tabular-nums` value.
   - **km/l médio** — `kmPerLitroLabel(km_por_litro_medio)` from `v_carro_resumo` → "12,4 km/l" or `—`.
   - **R$/km** — `reaisPerKmLabel(reais_por_km_medio)` from `v_carro_resumo` → "R$ 0,68/km" or `—`.
   - **Gasto total** — `formatCents(gasto_total_cents)` from `v_carro_resumo` (manutenção + combustível via `carro_id`) → "R$ 3.240,00" or `—` when there is no data. Neutral `foreground` (not red).
   - **Null discipline:** any KPI with no underlying data shows `—`, never a placeholder zero. (Mirrors the `Average` block already in `AbastecimentoHistory`.)

3. **Gasto por categoria (CAR-05.2):** a section with an `h2` `text-sm font-semibold` label "Gasto por categoria", then a list of horizontal bars — one row per categoria of this car's `carro_id`-tagged lançamentos, **ordered by valor desc** (CONTEXT.md). Each row reuses the **`AdherenceBar` visual grammar** (a `bg-muted` `h-2` rounded track + a fill `<div>` whose width = `valor / maiorValor`), paired — color is never the sole signal — with:
   - left: categoria name (`text-sm`);
   - right: `formatCents(valor)` mono `tabular-nums` (the bar is never the sole carrier of the number).
   - **Fill token:** neutral `bg-muted-foreground` (a proportional-magnitude view, not meta-adherence — see §Color). Do **not** import `AdherenceBar` if its meta/aria-meta semantics don't fit; spec a sibling `CarroCategoriaBars` that mirrors its track/fill/label markup and `role`/`aria` shape. If the planner finds `AdherenceBar` cleanly parametrizable for a meta-less magnitude bar, reuse is acceptable — the visual contract (track + fill + mono label + accessible name) is what's frozen, not the file.
   - **Empty:** when the car has no tagged spend, render a single `text-sm text-muted-foreground` line "Nenhum gasto vinculado a este carro." (no chart, no zero bars).

4. **Consumo (km/l) — line chart (CAR-05.4):** an `h2` `text-sm font-semibold` label "Consumo (km/l)" then the chart inside a `--card` surface. A **recharts line chart via shadcn `chart`**, mirroring `ReceitaGastoChart` exactly:
   - `ChartContainer` with a `chartConfig` keying the series `kmPorLitro: { label: 'km/l', color: 'var(--chart-1)' }` — **token-aware**, so the `.dark` flip re-themes the line with zero JS.
   - `LineChart` with `CartesianGrid vertical={false}`, an `XAxis dataKey="data"` (short pt-BR date label, `dd/MM`, SP-pinned), `accessibilityLayer`, and a `Line dataKey="kmPorLitro" stroke="var(--color-kmPorLitro)"` with visible dots.
   - **Tooltip pt-BR:** `ChartTooltip` + `ChartTooltipContent` with a `formatter` rendering "12,4 km/l" (reuse `kmPerLitroLabel` / the same `toLocaleString('pt-BR')` discipline). The x-label is the abastecimento date.
   - **Null intervals omitted:** points whose km/l is null (open interval / km≤0 guard from `v_abastecimento_consumo`) are **dropped from the series** before render — the line plots only valid tank-to-tank intervals (CONTEXT.md). Never plot a 0 or a gap-filled value.
   - **Not the sole carrier of a number:** the chart sits directly above the `AbastecimentoHistory` averages block, which already prints km/l médio as mono text — that labeled figure satisfies the Phase-7 "labeled total accompanies the chart" rule. `aria-label="Consumo de km/l ao longo do tempo"`.
   - **Empty:** fewer than 2 valid intervals → no chart; the inherited friendly empty copy "Sem dados de consumo ainda" / "Registre abastecimentos com tanque cheio para ver a curva de km/l aqui." (mirrors `ReceitaGastoChart`'s empty block grammar; no spinner).
   - **Loading:** `ChartSkeleton` (Phase-7), never a spinner.

5. **Abastecimentos (CAR-05.3) — integrate the existing Phase-10 `AbastecimentoHistory`:** render the **already-shipped** `AbastecimentoHistory` component (averages block + table→card list with RowActions + AbastecimentoForm) under an `h2` "Abastecimentos". **Do NOT rebuild it.** It already provides the mobile table→card collapse (Phase-7 grammar) and the data/odômetro/litros/R$/km-l/vínculo columns required by CAR-05.3. The "Registrar abastecimento" primary action stays where Phase 10 placed it.

**Responsive stacking (all sections `flex flex-col gap-6`):**
- KPI cards: `grid-cols-1` (`<sm`) → `grid-cols-3` (`≥sm`).
- Gasto-por-categoria + chart + abastecimentos: single column, full width, stacked in the order above on every breakpoint (`<md` and `≥md` alike — the detail page is a single column of sections; only the KPI row and the inherited abastecimento table go multi-column/dense at `≥sm`/`≥md`).
- Chart keeps `min-h-[240px]`, full width; on narrow widths recharts handles tick density.

**States:** loading = `CardSkeleton` (KPIs/categoria) + `ChartSkeleton` (chart), page chrome stays visible. Error / not-found = inherited inline `text-destructive` recovery block, or Next `not-found` for a non-owned/missing id (RLS returns empty → not-found). pt-BR `R$` throughout.

### 2. `/carros` list — KPIs on the CarroCard (CAR-05.2)

Extend the Phase-8 **identity-only** `CarroCard` (`src/components/carro-card.tsx`) with two KPI figures from `v_carro_resumo` — completing the deferred Phase-8 promise. No new card; add a KPI strip to the existing card body.

- **Add to `CarroCardData`:** `gastoTotalCents: number | bigint | null` and `kmPorLitroMedio: number | null` (read from `v_carro_resumo` in the `/carros` RSC).
- **Render:** below the identity/badges block, a small two-up KPI strip — `flex flex-wrap gap-x-6 gap-y-1` — each item a `text-xs text-muted-foreground` label over a `text-sm font-mono font-semibold tabular-nums` value:
  - **Gasto total** → `formatCents(gastoTotalCents)` or `—`.
  - **km/l médio** → `kmPerLitroLabel(kmPorLitroMedio)` or `—`.
- **Null discipline:** a car with no spend / no abastecimentos shows `—` for the respective KPI — **never `R$ 0,00`, never `0 km/l`** (CONTEXT.md). Do not hide the strip; show `—`.
- Identity (apelido link · modelo·placa·ano · combustível/Arquivado badges · Editar/Arquivar dropdown) is **unchanged**. The KPIs are additive, neutral `foreground`, never gold.
- The `/carros` grid, empty, loading (`CardSkeleton`), and error states are inherited from Phase 8 — unchanged.

---

## Component Inventory

**Reuse (frozen — do NOT rewrite):** all `ui/*` primitives (`Card`, `Badge`, `Table*`, `Skeleton`, `chart`/`ChartContainer`/`ChartTooltip`/`ChartTooltipContent`, `DropdownMenu`, `AlertDialog`, `Empty*`), `CardSkeleton` / `ChartSkeleton` (Phase 7), `AbastecimentoHistory` + `AbastecimentoForm` + `TransacaoPicker` (Phase 10 — integrated, not rebuilt), `ReceitaGastoChart` (Phase 7 — the line-chart analog/template, not edited), `AdherenceBar` (Phase 3/7 — visual grammar reference), `formatCents`/`money.ts`, `kmPerLitroLabel`/`reaisPerKmLabel`/`consumo.ts`, `app-sidebar`/`bottom-nav` (Carros entry already shipped Phase 8).

**Extend (additive, behavior preserved):**

| Component | Change |
|-----------|--------|
| `CarroCard` (`src/components/carro-card.tsx`) | Add `gastoTotalCents` + `kmPorLitroMedio` to `CarroCardData`; render the additive KPI strip (mono `tabular-nums`, `—` when null). Identity/actions unchanged. |

**New custom composites (vendored, this phase):**

| Composite | Purpose |
|-----------|---------|
| `CarroConsumoChart` (`src/components/carro-consumo-chart.tsx`) | Client recharts **line** chart — km/l over time, token-aware (`--chart-1`), pt-BR tooltip, null-interval points dropped, empty-state copy. Mirrors `ReceitaGastoChart`'s structure. Props are pure data (RSC passes the series). |
| `CarroCategoriaBars` (`src/components/carro-categoria-bars.tsx`) | Horizontal magnitude bars (categoria name + `bg-muted` track + neutral `bg-muted-foreground` fill at `valor/maiorValor` + `formatCents` mono label). Mirrors `AdherenceBar` track/fill/label markup; no meta semantics. Empty → single muted line. |
| KPI stat cards | May be three inline `Card`s in `page.tsx` or a tiny `CarroKpiCard` helper (planner's discretion) — `text-xs` label + `text-xl font-mono font-semibold tabular-nums` value + `—` null sentinel. |
| (route file) | `src/app/(app)/carros/[id]/page.tsx` enriched (KPIs + categoria bars + chart, keeping the Phase-10 abastecimento section); `src/app/(app)/carros/page.tsx` + RSC wiring to pass `v_carro_resumo` KPIs to `CarroCard`. Optional `v_carro_categoria` (`security_invoker=true`) OR inline RSC aggregation for gasto-por-categoria (planner decides — view if reusable; read-only, additive, does not touch metas). |

No new shadcn registry blocks. No new npm dependencies (recharts + `react-is` override already shipped Phase 7). `registries: {}` unchanged. lucide icons already installed.

---

## Money & Number Formatting

Inherited verbatim (07-UI-SPEC §Money, Phases 2–3). Every money value via `formatCents` (pt-BR `R$ 1.234,56`), cents-as-bigint internally; consumption via `kmPerLitroLabel` ("12,4 km/l") and cost-per-km via `reaisPerKmLabel` ("R$ 0,68/km"); all numeric `font-mono tabular-nums`, right-aligned in cells; dates `dd/MM` pinned to `America/Sao_Paulo`; the single null sentinel is `—` (em-dash). Never `NaN`, never `R$ 0,00` as a stand-in for "no data", never `0 km/l`. Charts format every value through the same helpers.

---

## Accessibility Basics

Inherited from Phase 7. This phase specifically:
- The consumption chart is `aria-label`led ("Consumo de km/l ao longo do tempo") and is **never the sole carrier of a number** — the `AbastecimentoHistory` averages block (km/l médio in mono text) accompanies it.
- Category bars expose an accessible name (categoria + valor) and pair the bar with a visible text label + mono amount — color/length is never the sole signal.
- KPI cards: label + value are both text (mono value is screen-reader legible); `—` reads as "traço/em branco" — acceptable for "sem dados".
- Contrast: `--chart-1` gold-on-navy line and `--muted-foreground` category fill both hold ≥3:1 non-text contrast in light AND dark (token flip verified by the Phase-7 system; no new tokens introduced). Focus = gold ring on every interactive control.
- `prefers-reduced-motion` honored (skeleton shimmer + chart animation reduce to opacity-only — inherited).

---

## Copywriting Contract

All copy pt-BR, calm/direct/second-person, no exclamation (inherited tone). **Inherits every Phase 7/8/10 string verbatim** (carro identity, abastecimento history, dialog/toast copy). New strings this phase:

| Element | Copy |
|---------|------|
| KPI label — consumo médio | **km/l médio** |
| KPI label — custo por km | **R$/km** |
| KPI label — gasto total | **Gasto total** |
| Section heading — categorias | **Gasto por categoria** |
| Section heading — chart | **Consumo (km/l)** |
| Section heading — abastecimentos | **Abastecimentos** (inherited from Phase 10 placement) |
| Empty — no tagged spend | **Nenhum gasto vinculado a este carro.** |
| Empty (chart, <2 valid intervals) — heading | **Sem dados de consumo ainda** |
| Empty (chart) — body | "Registre abastecimentos com tanque cheio para ver a curva de km/l aqui." |
| Chart aria-label | "Consumo de km/l ao longo do tempo" |
| List KPI label — gasto | **Gasto total** |
| List KPI label — consumo | **km/l médio** |
| Null sentinel (all KPIs/cells) | **—** (em-dash) |
| Error (generic, inherited) | "Não foi possível carregar os dados do carro. Tente recarregar a página." |
| Loading | (skeleton, no copy) |

**Primary CTA:** none new on the detail page (it is read-only presentation; "Registrar abastecimento" already exists from Phase 10, "Novo carro" from Phase 8). **Destructive actions:** none new this phase — the only destructive flow is the inherited `AbastecimentoHistory` "Excluir abastecimento" confirm (AlertDialog, unchanged).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Only previously-vendored primitives (`chart`, `Card`, `Badge`, `Table`, `Skeleton`, `DropdownMenu`, `AlertDialog`, `Empty`) — no new block added | not required (official registry) |

No third-party registries declared. `registries: {}` in `components.json` (verified this run). Registry vetting gate: **not applicable**. No new npm dependency this phase — recharts and the `react-is` override shipped in Phase 7. The bundle-secret audit (SEC-01) is re-run after the new chart client component lands (per CONTEXT.md) to confirm no regression.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
