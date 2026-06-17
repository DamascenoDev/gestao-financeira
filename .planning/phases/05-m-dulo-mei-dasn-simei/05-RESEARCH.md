# Phase 5: Módulo MEI / DASN-SIMEI - Research

**Researched:** 2026-06-16
**Domain:** BR tax-domain feature (MEI annual revenue tracking + DASN-SIMEI report) over the existing Supabase/RLS/bigint-centavos stack
**Confidence:** HIGH (2026 MEI/DASN numbers re-verified against current BR sources; all engineering patterns lifted verbatim from shipped Phases 1–4)

## Summary

Phase 5 is an **isolated record-and-report module**: the user registers each issued NF (nota fiscal), the system sums the year's **gross** revenue (`receita bruta`), compares it to the **applicable** limit (proportional in the opening year, R$81.000 full thereafter), shows a tiered status with a 20% tolerance band, alerts at 80%, and emits a yearly report that maps 1:1 to the DASN-SIMEI fields. It does **not** integrate with the transactions/classification core and does **not** e-file anything (out of scope).

Almost nothing here is novel engineering — every primitive already exists in the repo: bigint-centavos money (`src/lib/money.ts`), `America/Sao_Paulo` year boundaries (`src/lib/month.ts` → `currentYear`/`yearBounds`), the Server-Action shape (`Zod safeParse` → `getClaims` → ownership re-derive → `revalidatePath`), the uniform per-table RLS shape, `security_invoker` aggregate views, the tiered-status mapper pattern (`src/lib/adherence.ts`), and the IDOR ownership helpers (`src/lib/ownership.ts`). The **only genuinely new domain logic** is the applicable-limit computation, and its danger is entirely in the edges (proportional first year, gross-not-net, 20% band, year boundary) — which the project's own PITFALLS.md already catalogues (Pitfalls 12–14).

**Primary recommendation:** Centralize the four MEI rule numbers (R$81.000 / R$6.750-per-month / 20% band / 31-May deadline) in ONE constant module (`src/lib/mei/rules.ts`), compute the applicable limit + tiered status in a `security_invoker` SQL view (`v_mei_year_summary`) so the invariant lives inside the RLS boundary and the app stays a pure formatter, and mirror the `adherence.ts` status-mapper + `view-leak.test.ts`/`reserva-idor.test.ts` test patterns. **Never hardcode 81.000** — the limit is always computed from `mei_start_date` and the report's calendar year.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NF CRUD (MEI-01) | API / Server Action | Database (RLS+CHECK) | Same boundary as incomes/transactions; ownership + money validation server-side |
| Gross-revenue sum + split (MEI-03, MEI-04) | Database (security_invoker view) | — | Aggregation belongs in SQL inside the RLS boundary (mirrors `v_adherence_*`, `v_reserva_balance`) |
| Applicable-limit computation (MEI-02) | Database (view) | App constant module | Proportional/full logic in SQL off `mei_start_date`; the numbers come from the centralized constant, surfaced to both SQL and TS |
| Tiered status verde/âmbar/vermelho + banda (MEI-02) | App (`mei/status.ts`) | Database (raw bp in view) | Pure presentation mapper — the `adherence.ts` pattern; view emits the ratio, app maps to status/token/label |
| 80% alert (MEI-05) | App (derived from view bp) | — | A derived flag, not stored; same as budget threshold alerts |
| Yearly report + CSV export (MEI-04) | App (read view → format) | Database (view) | View provides the consolidated row; app formats screen + CSV (export pattern this phase establishes for DATA-01) |
| Informational disclaimer (MEI-06) | Frontend (every MEI screen) | — | Static, visible UI element; liability requirement, not footnote |

## Standard Stack

No new packages. Everything needed is already installed and proven in Phases 1–4.

### Core (already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.108.2 | Typed DB/auth client | Already the data path for every action; RLS-active server client |
| `@supabase/ssr` | ^0.12.0 | Server-side auth (`getClaims`) | The established action auth pattern |
| `zod` | (installed) | Boundary validation | Every action's `safeParse` gate; one schema shared form↔action |
| `react-hook-form` + `@hookform/resolvers` | ^7.x / ^5.4.0 | NF entry form | Established `field + RHF + zodResolver` shadcn form pattern |
| `date-fns` + `date-fns-tz` | ^4.4.0 / ^3.2.0 | Year boundary pinned to `America/Sao_Paulo` | `currentYear`/`yearBounds` already in `src/lib/month.ts` |
| shadcn/ui (vendored) | — | Form, card, dense table, progress, badge | Reuse `money-input`, `amount-cell`, dense-table, `progress` |
| `vitest` | (installed) | TDD: unit + local-DB integration | `npm test` → `vitest run`; helpers in `tests/helpers/local-supabase.ts` |

### Supporting (reuse, do not rebuild)
| Asset | Path | Use Here |
|-------|------|----------|
| `parseBRLToCents` / `formatCents` / `centsToEditableBRL` | `src/lib/money.ts` | NF amount parse + display; strictly-positive integer-cents invariant enforced once |
| `currentYear` / `yearBounds` | `src/lib/month.ts` | Report calendar-year window, TZ-pinned (Dec-31-near-midnight safety) |
| `moneyWriteError` / `assertOwned*` pattern | `src/lib/ownership.ts` | Map 23514 check-violation; clone `assertOwnedStatement` → `assertOwnedMeiInvoice` for IDOR |
| `adherenceStatus` / `adherenceTokens` mapper | `src/lib/adherence.ts` | Template for the MEI tiered-status mapper (verde/âmbar/vermelho + banda) |
| local-DB test harness | `tests/helpers/local-supabase.ts` | RLS isolation + view-leak + IDOR integration tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Limit/status computed in a `security_invoker` view | Compute in TS in the action | Splits the invariant out of the RLS boundary and duplicates rounding; the repo's strong precedent (`v_adherence_*`, `v_reserva_balance`) is SQL-in-the-boundary. **Use the view.** |
| Activity type per-NF | Single revenue total | Can't produce the DASN comércio/serviços split (Pitfall 13). **Per-NF activity_type, even though user is likely services-only.** |
| `has_employee` as a setting *per year* | Single boolean on `mei_settings` | A MEI can hire/fire across years; DASN asks per declaration year. **Model per-year (table `mei_year_flags` or a `(user_id, year)` row).** |

**Installation:** none — `npm install` not required for this phase.

## Package Legitimacy Audit

> Not applicable — this phase installs **zero** external packages. All dependencies are already present and were legitimacy-audited in their introducing phases. No `npm install` step in the plan.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEI-01 | Registra NF emitida (data, valor, tomador, descrição) | `mei_invoices` table + `createMeiInvoice` action (incomes.ts shape); NF CRUD + RLS tests |
| MEI-02 | Faturamento anual vs limite, cap proporcional 1º ano + banda 20% | `v_mei_year_summary` view computes applicable limit off `mei_start_date`; tiered status mapper; verified 2026 numbers as named constants |
| MEI-03 | Receita por tipo (comércio/indústria vs serviços) + flag de funcionário | `activity_type` enum on `mei_invoices`; `has_employee` per-year flag; split summed in the view |
| MEI-04 | Relatório anual consolidado p/ DASN-SIMEI | View row = total bruto + split + employee flag; screen + CSV export |
| MEI-05 | Alerta ao se aproximar do limite | 80%-of-applicable-limit flag derived from the view's ratio bp |
| MEI-06 | Interface deixa claro: informativo, não consultoria fiscal | Fixed visible disclaimer component on every MEI screen |

## MEI Domain Facts (2026) — VERIFIED

> All four headline numbers re-verified 2026-06-16 against current BR sources. **No 2026 change from the commonly-cited figures** — the R$81k limit has been in force since 2018 and a proposed increase was NOT in effect for 2026.

| Rule | Value (2026) | Provenance |
|------|--------------|------------|
| Annual gross-revenue ceiling (full calendar year) | **R$ 81.000,00** (8_100_000 centavos) | [VERIFIED: Contabilizei / InfinitePay / Creditas, Jun 2026] |
| First-year proportional rate | **R$ 6.750,00 / mês ativo** (675_000 centavos) | [VERIFIED: Sitecontabil / Razonet / Wise, Jun 2026] |
| Active-month counting | Opening month counts **in full**; months = (12 − opening_month + 1) in the start year. MEI opened **March → 10 months → R$67.500**; **July → 6 months → R$40.500** | [VERIFIED: Sitecontabil/Razonet examples, Jun 2026] |
| 20% tolerance band (full year) | Over R$81.000 but **≤ R$97.200** (9_720_000 centavos) → stays MEI through Dec, pays **DAS complementar**, migrates to Simples/ME **next January**. Over R$97.200 (**>20%**) → **desenquadramento retroativo** to Jan of the current year, recálculo de impostos + multa até 20% + juros Selic | [VERIFIED: Contabilizei / Loggi / Agilize, Jun 2026] |
| DASN-SIMEI deadline | **31 de maio** of the following year (declares the prior calendar year); required **even with zero revenue**; late = multa mínima R$50 (2%/mês, teto 20%) | [VERIFIED: Contadores.cnt.br / Rankia / Marchesan, Jun 2026] |
| DASN fields | (1) total receita bruta of the year; (2) **split**: *comércio/indústria/transporte* (ICMS) vs *prestação de serviços* (ISS); (3) **houve empregado?** (yes/no) | [VERIFIED: Contadores.cnt.br / InfinitePay, Jun 2026; matches project FEATURES/PITFALLS] |

**First-year proportional band:** apply the same 20% to the proportional cap. For a July-opened MEI, applicable limit = R$40.500, and the band ceiling = R$40.500 × 1.20 = **R$48.600** (recompute proportionally — do NOT use the full-year R$97.200 line in the start year). [VERIFIED: derived from the proportional rule + 20% band, both verified above]

### Centralized constant module (the ONE place 2027 edits happen)

```typescript
// src/lib/mei/rules.ts
// The ONLY place MEI rule numbers live. A 2027 limit change is ONE edit here.
// Confirm against the Receita/Portal do Empreendedor manual each tax year.
// Money is integer centavos — NEVER reais floats. (money.ts invariant)

/** Full calendar-year gross-revenue ceiling (centavos). 2026: R$ 81.000,00. */
export const MEI_ANNUAL_LIMIT_CENTS = 8_100_000

/** Proportional monthly rate for the opening year (centavos). 2026: R$ 6.750,00/mês. */
export const MEI_MONTHLY_RATE_CENTS = 675_000

/** Tolerance band as basis points over the applicable limit. 20% = 2000 bp → ×1.20. */
export const MEI_TOLERANCE_BP = 2000

/** Alert threshold as basis points of the applicable limit. 80% = 8000 bp. */
export const MEI_ALERT_BP = 8000

/** DASN-SIMEI deadline (month/day) for the PRIOR calendar year. 31 May. */
export const DASN_DEADLINE = { month: 5, day: 31 } as const

/** Tax year these numbers were verified against (surface in the disclaimer). */
export const MEI_RULES_YEAR = 2026
```

> The SQL view needs the same numbers. Either inline them in the migration with a comment pointing back to `rules.ts` as the source of truth, or (preferred for a single edit point) inject them as a tiny `mei_rules(year, ...)` reference table seeded by a migration. **Recommendation:** inline literals in the view migration WITH a header comment `-- MUST match src/lib/mei/rules.ts` AND a unit test that asserts the constant values, so a drift between SQL and TS is caught (the "never hardcode 81k spread across files" property).

## Applicable-Limit Computation (the subtle part)

### Formula

```
opening_year      = year(mei_start_date)            -- TZ: stored as a date; year is civil
opening_month     = month(mei_start_date)

if report_year <  opening_year:  applicable_limit = 0           -- MEI did not exist (no NFs valid)
if report_year == opening_year:  active_months    = 12 - opening_month + 1
                                 applicable_limit = MEI_MONTHLY_RATE_CENTS * active_months
if report_year >  opening_year:  applicable_limit = MEI_ANNUAL_LIMIT_CENTS

band_ceiling = applicable_limit * (10000 + MEI_TOLERANCE_BP) / 10000   -- ×1.20, integer math
ratio_bp     = gross_cents * 10000 / applicable_limit                  -- guard /0

status:
  ratio_bp <  8000                          → verde   (< 80%)
  8000 <= ratio_bp < 10000                  → âmbar   (80–100%)
  ratio_bp >= 10000 AND gross <= band_ceil  → vermelho-dentro-da-banda  (migra Simples ano seguinte)
  gross > band_ceiling                      → vermelho-fora-da-banda     (desenquadramento retroativo)
```

### View sketch (`v_mei_year_summary`, security_invoker)

```sql
-- 0025_mei.sql (excerpt) — security_invoker is MANDATORY (view-leak proof, like 0014).
-- Numbers MUST match src/lib/mei/rules.ts (asserted by a unit test).
create or replace view public.v_mei_year_summary
  with (security_invoker = true) as
  with by_year as (
    select
      i.user_id,
      to_char(i.issued_on, 'YYYY')::int as year,
      sum(i.amount_cents)::bigint as gross_cents,
      sum(i.amount_cents) filter (where i.activity_type = 'comercio_industria')::bigint as comercio_cents,
      sum(i.amount_cents) filter (where i.activity_type = 'servicos')::bigint as servicos_cents
    from public.mei_invoices i
    group by i.user_id, to_char(i.issued_on, 'YYYY')::int
  ),
  with_settings as (
    select b.*, s.mei_start_date,
           extract(year  from s.mei_start_date)::int as opening_year,
           extract(month from s.mei_start_date)::int as opening_month
    from by_year b
    join public.mei_settings s on s.user_id = b.user_id
  )
  select
    w.user_id, w.year, w.gross_cents, w.comercio_cents, w.servicos_cents,
    coalesce(f.has_employee, false) as has_employee,
    case
      when w.year  < w.opening_year then 0
      when w.year  = w.opening_year then 675000 * (12 - w.opening_month + 1)  -- MEI_MONTHLY_RATE_CENTS
      else 8100000                                                            -- MEI_ANNUAL_LIMIT_CENTS
    end::bigint as applicable_limit_cents,
    -- band ceiling = applicable × 1.20 (integer math)
    (case
       when w.year  < w.opening_year then 0
       when w.year  = w.opening_year then 675000 * (12 - w.opening_month + 1)
       else 8100000
     end * 12000 / 10000)::bigint as band_ceiling_cents,
    -- ratio in bp of the applicable limit; guard divide-by-zero (year before opening)
    case when (...) = 0 then null
         else (w.gross_cents * 10000) / (...) end as ratio_bp
  from with_settings w
  left join public.mei_year_flags f
    on f.user_id = w.user_id and f.year = w.year;

grant select on public.v_mei_year_summary to authenticated;
```

> Repeat the limit CASE three times or wrap in a lateral/sub-CTE; the sketch shows the shape. The app reads one row per `(user, year)`, picks the report year, and maps `ratio_bp` + `gross_cents vs band_ceiling_cents` to a status via a pure `src/lib/mei/status.ts` (mirrors `adherence.ts`). **The TS mapper never recomputes the limit — it consumes the view's numbers.**

## Architecture Patterns

### System Architecture Diagram

```
[NF entry form (RHF+Zod)] --FormData--> [createMeiInvoice action]
                                              |  Zod safeParse (date, tomador, descricao, activity_type)
                                              |  parseBRLToCents(amount)  -> strictly-positive cents
                                              |  getClaims() -> userId
                                              v
                                        [mei_invoices]  (RLS: auth.uid()=user_id ; CHECK amount_cents>0)
                                              |
[mei_settings: mei_start_date] ---+          | (read, RLS-active)
[mei_year_flags: has_employee]  --+--------> [v_mei_year_summary]  (security_invoker)
                                              |  gross + split + applicable_limit + band_ceiling + ratio_bp
                                              v
                  [MEI dashboard page (RSC read)] --> [mei/status.ts pure mapper]
                       |  verde/âmbar/vermelho(+banda)  |  80% alert flag (ratio_bp >= 8000)
                       |  limit card / NF table / report card
                       +--> [CSV export route]  (total bruto + split + employee → DASN-ready)
                       +--> [Disclaimer component]  (visible on EVERY screen — MEI-06)
```

### Recommended Project Structure
```
src/
├── lib/mei/
│   ├── rules.ts          # the ONE constant module (limits/rate/band/deadline)
│   ├── status.ts         # pure tiered-status mapper (verde/âmbar/vermelho+banda) — adherence.ts twin
│   └── csv.ts            # report → CSV string (establishes the Phase-6 DATA-01 export pattern)
├── lib/schemas/mei.ts    # Zod: NF, settings, year-flag — shared form↔action
├── actions/mei.ts        # 'use server' NF CRUD + settings; getClaims + ownership + revalidatePath
├── lib/ownership.ts      # + assertOwnedMeiInvoice (clone of assertOwnedStatement)
├── app/(app)/mei/        # MEI shell route: limit card, NF table, report, disclaimer
supabase/migrations/
├── 0025_mei.sql          # mei_settings + mei_invoices + mei_year_flags + RLS + grants + indexes
└── 0026_mei_views.sql    # v_mei_year_summary (security_invoker)  [or fold into 0025]
```

### Pattern 1: NF CRUD Server Action (mirror incomes.ts exactly)
**What:** Zod `safeParse` → `parseBRLToCents` (throw→friendly) → `getClaims()` for owner → insert under RLS-active client → `moneyWriteError` mapping (23514) → `revalidatePath('/mei')`.
**When:** every MEI write (NF create/edit/delete, settings, year flag).
**Example:**
```typescript
// Source: src/actions/incomes.ts (createAdhocIncome), adapted
export async function createMeiInvoice(formData: FormData): Promise<ActionResult> {
  const parsed = meiInvoiceSchema.safeParse({
    issuedOn: formData.get('issuedOn'),
    amount: formData.get('amount'),
    tomador: formData.get('tomador'),
    descricao: formData.get('descricao'),
    activityType: formData.get('activityType'), // 'comercio_industria' | 'servicos'
  })
  if (!parsed.success) return { error: firstIssue(parsed.error.issues[0]?.message) }

  let amountCents: number
  try { amountCents = parseBRLToCents(parsed.data.amount) }
  catch { return { error: 'Valor monetário inválido.' } }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('mei_invoices').insert({
    user_id: userId,
    issued_on: parsed.data.issuedOn,
    amount_cents: amountCents,            // gross — receita bruta (NEVER net)
    tomador: parsed.data.tomador,
    descricao: parsed.data.descricao,
    activity_type: parsed.data.activityType,
  })
  if (error) return { error: moneyWriteError(error, 'Não foi possível salvar a NF.') }
  revalidatePath('/mei')
  return { ok: true }
}
```

### Pattern 2: IDOR ownership re-derive for `mei_invoice_id`
**What:** any action that takes a client-supplied `mei_invoice_id` (edit/delete) validates the UUID then re-derives ownership under the RLS-active client. Add `assertOwnedMeiInvoice` as a verbatim clone of `assertOwnedStatement` in `ownership.ts`. (RLS already makes a forged id match 0 rows; this is defense-in-depth + clean errors — the established repo stance.)

### Pattern 3: Pure tiered-status mapper (adherence.ts twin)
**What:** `mei/status.ts` exports `meiStatus(ratioBp, grossCents, bandCeilingCents)` → discriminated `'verde' | 'ambar' | 'vermelho-banda' | 'vermelho-fora'` + token + pt-BR label. NO DB, NO limit recompute. Thresholds = `MEI_ALERT_BP` (8000) / 10000, band edge = `grossCents <= bandCeilingCents`.

### Anti-Patterns to Avoid
- **Hardcoding `81000` / `97200` anywhere outside `rules.ts`** — false "you're safe" for a mid-year MEI; spreads literals (Pitfall 12). The view literals must be guarded by a constant-equality unit test.
- **Summing net/profit instead of gross** — MEI limit is `receita bruta` (Pitfall 12). Store and sum the billed amount only.
- **A view WITHOUT `security_invoker`** — runs as DEFINER and leaks every user's MEI revenue (the exact failure `view-leak.test.ts` exists to catch).
- **Status as the only signal via color** — always render the pt-BR label (`adherence.ts` precedent; accessibility).
- **Disclaimer in a footer** — MEI-06 requires it visible on every MEI screen; it's a liability requirement, not polish.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse pt-BR money | Custom regex per form | `parseBRLToCents` | Already enforces strictly-positive cents, rejects ambiguous grouping (WR-05), rounds once |
| Format money | `toFixed`/`number` math | `formatCents` / `centsToEditableBRL` | bigint-safe, no float drift (MD-01) |
| Civil-year window pinned to TZ | `new Date().getFullYear()` | `currentYear` / `yearBounds` | UTC year-boundary bug on 31-Dec near midnight (Pitfall: TZ) |
| Per-table RLS + grants + index | Ad-hoc policy SQL | The uniform shape from 0013 | Forgetting `ENABLE ROW LEVEL SECURITY` = silent leak (Pitfall 2) |
| Aggregate inside RLS | App-side SUM over fetched rows | `security_invoker` view | Invariant lives in the boundary; the repo's strong precedent |
| Tiered status mapping | New threshold logic | `adherence.ts` mapper pattern | Same 80/100% structure already tested |
| Ownership of client FK ids | Trust the id | `assertOwned*` clone | Postgres FKs are NOT RLS-aware (IDOR, Pitfall 6) |

**Key insight:** this phase is 90% assembly of shipped primitives. The 10% new code is the applicable-limit math — and that's exactly where the project's PITFALLS.md (12/13/14) says the bugs live, so it's the part to TDD hardest.

## Runtime State Inventory

> Greenfield feature (new tables/views only) — not a rename/migration. No pre-existing runtime state to migrate.
> - **Stored data:** None — `mei_settings`/`mei_invoices`/`mei_year_flags` are net-new tables. No backfill.
> - **Live service config:** None — module is self-contained; no external service config.
> - **OS-registered state:** None.
> - **Secrets/env vars:** None — no new keys.
> - **Build artifacts:** `src/types/database.types.ts` MUST be regenerated after 0025/0026 (`npm run gen:types`) so the typed client sees the new tables/view. This is a required plan step, not optional.

## Common Pitfalls

### Pitfall 1: Hardcoding the limit / wrong active-month count
**What goes wrong:** `sum >= 81000` everywhere; a July MEI shown "safe" at R$50k when its proportional cap is R$40.500.
**Why it happens:** public sources headline "R$81k"; proportionality is a footnote.
**How to avoid:** compute applicable limit in the view off `mei_start_date`; opening month counts in full (`12 - opening_month + 1`); literals only in `rules.ts` + the view (with the equality test).
**Warning signs:** literal `81000`/`97200` in any TS file outside `rules.ts`; no `mei_start_date` read.

### Pitfall 2: Gross vs net
**What goes wrong:** summing profit/net undercounts the limit → false "safe".
**How to avoid:** `amount_cents` is the billed gross; never subtract anything; document it on the column and in the form copy.

### Pitfall 3: 20% band edge cases
**What goes wrong:** treating >100% as a single "over" state; missing the ≤R$97.200 (migrate next year, DAS complementar) vs >R$97.200 (retroactive desenquadramento) distinction.
**How to avoid:** the view emits `band_ceiling_cents`; the mapper distinguishes `vermelho-banda` (gross ≤ ceiling) from `vermelho-fora` (gross > ceiling). Recompute the ceiling proportionally in the start year (do NOT use 97.200 there).

### Pitfall 4: Year boundary (America/Sao_Paulo)
**What goes wrong:** an NF issued late on 31-Dec slips into the wrong year via UTC, mis-bucketing the annual total.
**How to avoid:** `issued_on` is a civil `date` (no time); the view groups by `to_char(issued_on,'YYYY')`; the app's "current year" comes from `currentYear()` (already TZ-pinned). No `new Date()` year math in the action.

### Pitfall 5: Money rounding
**What goes wrong:** float drift in the limit/band/ratio math.
**How to avoid:** all integer-cents; band ceiling via integer `× 12000 / 10000`; ratio via `× 10000 /`; never a JS float intermediate. Reuse `formatCents` at the display edge only.

### Pitfall 6: View leak (no security_invoker)
**What goes wrong:** the summary view runs as DEFINER and returns every user's revenue.
**How to avoid:** `with (security_invoker = true)` on `v_mei_year_summary`; covered by a clone of `view-leak.test.ts`.

### Pitfall 7: IDOR on `mei_invoice_id`
**What goes wrong:** a forged invoice id on edit/delete; FK is not RLS-aware.
**How to avoid:** `assertOwnedMeiInvoice` + UUID schema before `.eq('id', id)`; covered by a clone of `reserva-idor.test.ts`.

### Pitfall 8: Implied tax advice (MEI-06)
**What goes wrong:** the tab asserts "você está em dia" / "você deve declarar X".
**How to avoid:** frame as *your tracked numbers + the published rules*; fixed visible disclaimer "Este módulo é informativo e não constitui consultoria fiscal" on every MEI screen; reference `MEI_RULES_YEAR` so the disclaimer states which tax year the numbers reflect. Never assert compliance.

## Code Examples

### Tiered-status mapper (pure, adherence.ts twin)
```typescript
// src/lib/mei/status.ts — NO DB, consumes the view's numbers. (MEI-02)
import { MEI_ALERT_BP } from './rules'

export type MeiStatus = 'verde' | 'ambar' | 'vermelho-banda' | 'vermelho-fora'

export function meiStatus(
  ratioBp: number | null,
  grossCents: number | bigint,
  bandCeilingCents: number | bigint,
): MeiStatus {
  if (ratioBp === null) return 'verde'              // no applicable limit yet (pre-opening year)
  if (ratioBp < MEI_ALERT_BP) return 'verde'        // < 80%
  if (ratioBp < 10000) return 'ambar'               // 80–100%
  return BigInt(grossCents) <= BigInt(bandCeilingCents)
    ? 'vermelho-banda'   // over limit, within +20% → migra Simples ano seguinte (DAS complementar)
    : 'vermelho-fora'    // > +20% → desenquadramento retroativo
}

export function isNearLimit(ratioBp: number | null): boolean {
  return ratioBp !== null && ratioBp >= MEI_ALERT_BP   // 80% alert (MEI-05)
}
```

### Applicable-limit helper (for a unit-test oracle mirroring the SQL)
```typescript
// src/lib/mei/limit.ts — the SAME formula the view uses, so the test can assert parity.
import { MEI_ANNUAL_LIMIT_CENTS, MEI_MONTHLY_RATE_CENTS, MEI_TOLERANCE_BP } from './rules'

export function applicableLimitCents(reportYear: number, meiStartDate: string): number {
  const openingYear = Number(meiStartDate.slice(0, 4))
  const openingMonth = Number(meiStartDate.slice(5, 7))
  if (reportYear < openingYear) return 0
  if (reportYear === openingYear) return MEI_MONTHLY_RATE_CENTS * (12 - openingMonth + 1)
  return MEI_ANNUAL_LIMIT_CENTS
}

export function bandCeilingCents(applicable: number): number {
  return Math.floor((applicable * (10000 + MEI_TOLERANCE_BP)) / 10000) // ×1.20, integer
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat R$81k `>= 81000` gauge | Computed applicable limit + 20% band + proportional first year | Always (rule predates app) | Avoids false "safe"; matches the actual rule |
| Single revenue total | Per-NF `activity_type` split | DASN form requirement | Report maps 1:1 to the declaration |

**Deprecated/outdated:** none specific. The R$81k figure has been stable since 2018; a proposed increase was NOT in effect for 2026 (re-verified). Re-confirm each tax year via `MEI_RULES_YEAR`.

## Project Constraints (from CLAUDE.md)

- **TypeScript estrito, sem JavaScript** — all new files `.ts`/`.tsx`, strict.
- **Money as integer centavos** — never floats; format only at the display edge with `Intl.NumberFormat('pt-BR', BRL)`.
- **RLS non-negotiable on every table** — `using/with check (auth.uid() = user_id)` + `ENABLE ROW LEVEL SECURITY`; never app-layer-only filtering; never service-role to dodge a policy.
- **`user_id` on every domain table** (multi-user-ready) — on `mei_settings`, `mei_invoices`, `mei_year_flags`.
- **Migrations as versioned SQL** under `supabase/migrations/` (`db push`), then regenerate `database.types.ts`.
- **`@supabase/ssr` getAll/setAll; session refresh in middleware** — reuse the existing server client; do not re-introduce deprecated auth-helpers.
- **GSD workflow** — all edits via a GSD command.
- **MEI-specific:** informational, NOT tax advice (disclaimer required, MEI-06).

## Validation Architecture

> `workflow.nyquist_validation: true` — section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` (installed; `npm test` → `vitest run`) |
| Config file | `vitest.config.ts` + `vitest.setup.ts` (present) |
| Quick run command | `npx vitest run src/lib/mei/` (pure unit tests, no DB, < 5s) |
| Full suite command | `npm test` (includes local-DB integration via `supabase start`) |
| Local-DB harness | `tests/helpers/local-supabase.ts` (`serviceClient`, `userClient`, two-user setup — see `view-leak.test.ts`, `reserva-idor.test.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEI-01 | NF CRUD persists + RLS isolates | integration | `npx vitest run tests/mei-crud.test.ts` | ❌ Wave 0 |
| MEI-01/SEC | RLS: user B reads 0 of user A's NFs | integration | `npx vitest run tests/mei-rls-isolation.test.ts` | ❌ Wave 0 |
| MEI-02 | Proportional first-year cap (Jul → 6×6.750 = 40.500; Mar → 10 → 67.500) | unit | `npx vitest run src/lib/mei/limit.test.ts` | ❌ Wave 0 |
| MEI-02 | Full-year limit = 81.000 for year > opening | unit | `npx vitest run src/lib/mei/limit.test.ts` | ❌ Wave 0 |
| MEI-02 | 20% band tiers: verde/âmbar/vermelho-banda/vermelho-fora at exact edges (8000/10000 bp, gross vs band ceiling) | unit | `npx vitest run src/lib/mei/status.test.ts` | ❌ Wave 0 |
| MEI-02 | "Never hardcode 81k" — constants equal verified values; SQL literals match `rules.ts` | unit | `npx vitest run src/lib/mei/rules.test.ts` | ❌ Wave 0 |
| MEI-02 | View applicable_limit/band/ratio match the TS oracle for several start dates | integration | `npx vitest run tests/mei-summary-view.test.ts` | ❌ Wave 0 |
| MEI-03/04 | Yearly report split (comércio vs serviços) sums correctly; employee flag surfaced | integration | `npx vitest run tests/mei-summary-view.test.ts` | ❌ Wave 0 |
| MEI-04 | CSV export emits total bruto + split + employee, pt-BR amounts | unit | `npx vitest run src/lib/mei/csv.test.ts` | ❌ Wave 0 |
| MEI-05 | 80% alert flag fires at exactly 8000 bp of applicable, not before | unit | `npx vitest run src/lib/mei/status.test.ts` | ❌ Wave 0 |
| MEI-02/SEC | View leak: user B reads 0 of user A's summary (security_invoker proof) | integration | `npx vitest run tests/mei-view-leak.test.ts` | ❌ Wave 0 |
| MEI-01/SEC | IDOR: forged `mei_invoice_id` on edit/delete rejected | integration | `npx vitest run tests/mei-idor.test.ts` | ❌ Wave 0 |
| MEI-06 | Disclaimer renders on each MEI screen | component/manual | manual UI check (UI safety gate) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/mei/` (pure unit — limit/status/rules/csv, sub-5s).
- **Per wave merge:** `npm test` (full suite incl. local-DB integration; requires `supabase start`).
- **Phase gate:** full suite green before `/gsd-verify-work`; types regenerated post-migration.

### Wave 0 Gaps
- [ ] `src/lib/mei/rules.ts` — constants (+ `rules.test.ts` equality guard against verified 2026 values AND against SQL literals).
- [ ] `src/lib/mei/limit.ts` + `limit.test.ts` — proportional/full-year oracle.
- [ ] `src/lib/mei/status.ts` + `status.test.ts` — tiered status + 80% alert at exact bp/band edges.
- [ ] `src/lib/mei/csv.ts` + `csv.test.ts` — DASN-ready CSV.
- [ ] `tests/mei-crud.test.ts`, `tests/mei-rls-isolation.test.ts`, `tests/mei-summary-view.test.ts`, `tests/mei-view-leak.test.ts`, `tests/mei-idor.test.ts` — local-DB integration (clone existing reserva/view-leak harness usage).
- [ ] No framework install needed — `vitest` + local-supabase harness already present.

## Security Domain

> `security_enforcement` not set false → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Per-user RLS isolation as the trust boundary; aggregation in `security_invoker` views |
| V2 Authentication | no (reused) | Supabase Auth + `getClaims` already established |
| V4 Access Control | **yes** | RLS `auth.uid()=user_id` on all 3 tables + view; IDOR ownership re-derive on client FK ids |
| V5 Input Validation | **yes** | Zod `safeParse` at the action boundary; `parseBRLToCents` strict; UUID schema before `.eq` |
| V6 Cryptography | no | No new secrets/crypto |
| V7 Error Handling | yes | Never leak raw DB errors; `moneyWriteError` maps 23514; generic fallbacks |
| V8 Data Protection | yes | Financial/CNPJ-adjacent data is LGPD-sensitive — per-user isolation; export/delete is Phase 6 scope |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user MEI revenue leak via DEFINER view | Information Disclosure | `with (security_invoker = true)` — proven by `mei-view-leak.test.ts` |
| Too-loose/forgotten RLS policy | Information Disclosure | `ENABLE ROW LEVEL SECURITY` + `using/with check` per table; two-user isolation test |
| IDOR on `mei_invoice_id` (forged FK) | Tampering / Elevation | `assertOwnedMeiInvoice` + UUID validation; FK is not RLS-aware |
| Invalid month/year/amount injected | Tampering | Zod boundary + `parseBRLToCents` (rejects non-money) + civil-date `issued_on` |
| Implied tax advice / liability | Repudiation | Fixed visible disclaimer (MEI-06); frame as informational + the tax year of the rules |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | All MEI numbers, the DASN fields, the deadline, and the proportional/band rules were VERIFIED against multiple current 2026 BR sources; all engineering claims are CITED from shipped repo files. No `[ASSUMED]` claims. |

**This table is empty — all claims were verified or cited. No user confirmation needed before planning.**

## Open Questions

1. **`has_employee` storage shape**
   - What we know: DASN asks "houve empregado?" per declaration year; a MEI can change status across years.
   - What's unclear: a dedicated `mei_year_flags(user_id, year, has_employee)` table vs a JSON/array on `mei_settings`.
   - Recommendation: a small `mei_year_flags` table keyed `(user_id, year)` — clean RLS, clean join in the view, no JSON parsing. (This is in Claude's discretion per CONTEXT.)

2. **Where the SQL rule numbers live**
   - What we know: both `rules.ts` and the view need the same constants; CONTEXT wants one edit point.
   - What's unclear: inline literals in the view (+ a parity unit test) vs a seeded `mei_rules(year,...)` reference table the view joins.
   - Recommendation: inline literals + a `rules.test.ts` that reads the migration text (or queries a probe) and asserts equality — simplest, and the test makes drift loud. Reference table is the heavier alternative if multi-year rules become dynamic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (local Docker stack) | migrations, type gen, integration tests | ✓ (used through Phases 1–4) | 2.106.x | — |
| `vitest` | unit + integration tests | ✓ | installed | — |
| Node/Next toolchain | build/dev | ✓ | per repo | — |

**Missing dependencies:** none — this phase adds no external dependency. Code/SQL/test-only against the existing local stack.

## Sources

### Primary (HIGH confidence)
- Shipped repo files (CITED verbatim): `src/lib/money.ts`, `src/lib/month.ts`, `src/lib/ownership.ts`, `src/lib/adherence.ts`, `src/actions/incomes.ts`, `supabase/migrations/0013_reservas.sql`, `0014_adherence_views.sql`, `tests/helpers/local-supabase.ts`, `tests/view-leak.test.ts`
- Project research: `.planning/research/FEATURES.md` (MEI scope + DASN fields), `.planning/research/PITFALLS.md` (Pitfalls 12/13/14)
- 2026 MEI limit (R$81k, gross, 20% band → R$97.200): https://www.contabilizei.com.br/contabilidade-online/faturamento-mei-2026/ ; https://www.infinitepay.io/blog/limite-faturamento-mei-2026 ; https://www.creditas.com/exponencial/limite-do-mei/ ; https://agilize.com.br/blog/abrir-sua-empresa/faturamento-do-mei/
- First-year proportional (R$6.750/mês, opening month full, Jul→6→40.500 / Mar→10→67.500): https://sitecontabil.com.br/noticias_empresariais/ler/mei-2025--entenda-o-limite-de-faturamento-proporcional ; https://razonet.com.br/contabilidade-digital/limite-mei ; https://wise.com/br/blog/valor-maximo-mei
- DASN-SIMEI 2026 (deadline 31 May, split comércio/indústria/transporte vs serviços, empregado flag, zero-revenue obligatory): https://www.contadores.cnt.br/noticias/tecnicas/2026/04/24/declaracao-anual-do-mei-2026-prazo-e-passo-a-passo-da-dasn-simei.html ; https://www.infinitepay.io/blog/declaracao-anual-mei ; https://rankia.com.br/declaracao-mei-2026-dasn-simei-prazo-31-maio/
- Official manual referenced by project research (authoritative anchor): https://www8.receita.fazenda.gov.br/simplesnacional/arquivos/manual/manual_dasn-simei.pdf

### Secondary (MEDIUM confidence)
- Cross-checked the 20% band consequences (DAS complementar next year vs retroactive desenquadramento + multa/Selic) across Contabilizei, Loggi, Agilize — consistent.

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all primitives shipped and tested in Phases 1–4.
- MEI/DASN domain facts: HIGH — all four headline numbers + DASN fields + deadline re-verified against multiple current 2026 BR sources; no 2026 change.
- Architecture/patterns: HIGH — view+RLS+security_invoker, action shape, IDOR, tiered-status mapper all copied from shipped code.
- Pitfalls: HIGH — drawn from the project's own PITFALLS.md (12/13/14) plus money/RLS/view lessons.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 for engineering patterns; **re-confirm MEI numbers each tax year** (gate via `MEI_RULES_YEAR`) — a 2027 limit change is a single edit in `rules.ts` + the view literal + the equality test.
