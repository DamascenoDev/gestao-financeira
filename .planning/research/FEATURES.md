# Feature Research

**Domain:** Personal finance / budgeting web app (single-user, Brazil) with AI-assisted expense classification, savings goals, % -of-income budget targets, sinking funds, and MEI tax management
**Researched:** 2026-06-16
**Confidence:** HIGH on table-stakes + Brazil tax facts (Context: official Receita/gov.br + established BR apps); MEDIUM on classification-memory UX patterns (verified against YNAB/Monarch/QuickBooks behavior); MEDIUM on PDF-parsing feasibility (verified against existing BR OSS parsers)

## Executive Framing

The user's edge is explicitly stated in PROJECT.md: **"classificação inteligente com memória + visão de metas"** must work even if everything else fails. So the bar for table stakes is "what makes the classify→goals loop usable," and the differentiators are the three things the mass-market BR apps (Mobills, Organizze) do NOT do well: (1) a *learned* merchant→category memory with a confirm loop, (2) % -of-income budget targets evaluated monthly **and** annual-cumulative, and (3) the reservas + MEI modules. Everything that is generic ledger plumbing is table stakes; the moat is in those three.

A key strategic finding: the dominant BR apps already do OFX/CSV/PDF import, editable categories, goals, and credit-card invoice management. So importing + categories + basic dashboards are **table stakes, not differentiators** — they're the price of entry, and the user should build them as cheaply as possible (lean on existing patterns) to spend budget on the moat.

## Feature Landscape

### Table Stakes (Users Expect These)

Features the user (and later, wife) will assume exist. Missing these = the classify→goals loop is unusable or the app feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Income tracking — recurring fixed (salário, pensão) + ad-hoc | % -of-income targets are meaningless without a reliable income denominator | LOW–MEDIUM | Recurring = a template that auto-materializes a monthly entry; ad-hoc = manual. The recurring engine is shared infra with recurring-expense detection (below). Store *expected* vs *received* so a late salary doesn't silently break the month's target math. |
| Statement/invoice ingestion: **OFX + CSV** | This is the cheap, reliable path; every BR app supports it (Mobills, Organizze import OFX/CSV/Excel). Nubank/Itaú/Inter all export OFX | LOW (OFX/CSV) | OFX is a structured (SGML/XML-ish) format — parse it deterministically, no AI. Make this the primary ingestion path. CSV needs a per-bank column-mapping step (date/amount/description vary). |
| Statement ingestion: **PDF** | User explicitly wants PDF; many BR credit-card bills only come as PDF | **HIGH** | PDF is the riskiest line item. BR bank PDFs are inconsistent (merged words, multi-line descriptions, dates split across lines; layout changes month to month). Existing OSS (`tio-ze-rj/banksheet` TS — Nubank/Itaú/Bradesco/Inter; `moacyrricardo/bank-importer`) proves it's doable but per-bank and brittle. **Treat PDF as a differentiator-risk, not a table stake** — see Pitfalls. Recommend: ship OFX/CSV first, add PDF per-bank incrementally. |
| Transaction list with edit (date, amount, description, category, notes) | Core ledger CRUD; nothing works without it | LOW | The spine everything else hangs on. |
| Editable BR-standard expense categories (add/remove/rename) | Explicitly requested; every BR app has it | LOW | Ship a sensible BR default seed (see category list below) so the user isn't categorizing into an empty taxonomy. Soft-delete categories (don't orphan historical transactions). |
| Manual review/confirm of classified transactions | The whole "suggest → confirm → auto-apply" loop requires a review surface | MEDIUM | This *is* the product's main screen. See classification UX notes in Differentiators. |
| Monthly spend-by-category view / dashboard | You can't judge goal adherence without seeing category totals | MEDIUM | Drives the adherence dashboard. |
| Duplicate detection on import | Re-importing an overlapping statement is the #1 way ledgers get corrupted | MEDIUM | Hash on (date, amount, normalized description) + fuzzy window. Table stakes because without it every re-upload doubles spend and breaks every target. |
| Multi-account / multi-source separation | User has multiple cards + bank + income sources; mixing them silently double-counts | MEDIUM | Even single-user, "which card is this from" matters for reconciliation and dedup. Model an `account`/`source` per transaction now; cheap later. |
| Per-user data isolation (RLS, `user_id` scoping) | Financial data; wife joins later | MEDIUM | Already a PROJECT.md decision. Not a "feature" the user sees but non-negotiable infra. |
| pt-BR everything: locale, R$ currency, DD/MM/YYYY, comma decimals | Brazilian user; OFX/CSV amounts and dates come in BR formats | LOW | Cross-cutting. Parse `1.234,56` correctly on import (classic bug source). |

### Differentiators (Competitive Advantage)

These align directly with PROJECT.md Core Value. This is where to spend effort.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Learned merchant→category memory (memory layer)** | Mass apps use static rules; user wants a memory that *grows from confirmations* and auto-applies. This is the stated moat | MEDIUM | Two-layer design (already a decision): **Layer 1 — memory**: normalized merchant descriptor → learned category, exact/fuzzy match, deterministic, free. **Layer 2 — AI**: only for never-seen merchants, always human-confirmed before it becomes a memory entry. Industry data: ML categorization is 70–80% accurate cold, ~95%+ after ~50 user corrections — the memory is what captures that lift. Normalization of the messy descriptor (strip store numbers, city codes, `*`, transaction IDs) is the real engineering work. |
| **Suggest → confirm → auto-apply UX loop** | The feel of "upload a fatura and watch it classify itself, getting smarter each time" is the product | MEDIUM | Mature pattern (QuickBooks/Monarch/YNAB): on import, show each new txn with a *suggested* category + confidence; user confirms/corrects in-line; confirmation writes the memory rule; future matches auto-apply silently (or land in a low-friction "review" queue only if confidence is low). **Auto-apply high-confidence, queue low-confidence** is the right default — don't make the user confirm what's already learned. |
| **Bulk re-classification** | When the user renames/merges a category or fixes a mis-learned merchant, they must fix history in one action | MEDIUM | Monarch's bulk-edit is the gold standard ("recategorize multiple transactions simultaneously — invaluable when cleaning up import data"). Needs: select-many → set category, and "re-apply this memory rule to all past matching transactions." Dependency: requires the memory layer + a stable merchant-normalization key. |
| **Budget targets as % of income, monthly AND annual-cumulative** | Mass apps do fixed-R$ monthly budgets; %-of-income + dual horizon is the user's specific mental model | MEDIUM–HIGH | Two evaluation windows over the same target set is the subtlety: monthly view = this month's spend vs (target% × this month's income); annual view = YTD spend vs (target% × YTD income). A category can be green monthly but red cumulative (or vice-versa) — the dashboard must show both without confusing them. Edge cases: variable income months, mid-year target changes. This is genuinely differentiating and worth getting right. |
| **Adherence dashboard** | The "visão de metas" half of Core Value | MEDIUM | Per-category: spent vs target, % used, on-track/over, both horizons. Visual progress bars + over-budget highlighting. Light, not gamified. |
| **Reservas de oportunidade (sinking funds)** | Named buckets (Apê, Carro), optional target + progress bar, contributions + withdrawals, per-bucket history | MEDIUM–HIGH | The clever UX hook: a contribution is *a transaction classified as "Reserva"* that then sub-prompts "qual reserva?" — so reservas piggyback on the same classification flow rather than being a separate manual ledger. Withdrawals reduce the bucket. Optional target → progress bar only when a target exists. Per-bucket transaction history. Complexity is in keeping bucket balances consistent with the underlying transactions (a reserva is both an expense in the main ledger *and* a contribution to a bucket — model carefully so it's not double-counted against budget targets; reservas should probably be a category *excluded* from normal spend-target math, or treated as "saving," not "spending"). **This double-meaning is the #1 modeling pitfall — flag for requirements.** |
| **MEI module** | Register issued service NFs, track R$81k annual limit, produce a DASN-SIMEI-easing report | MEDIUM | BR-specific, no mass app does this well integrated with personal finance. Scope (verified vs official Receita/gov.br): annual gross-revenue limit **R$ 81.000** (2026, MEI Geral); DASN-SIMEI is the annual declaration due **31 May** of the following year; must report total gross revenue, split (relevant for some) into *comércio/indústria* vs *serviços*. Module needs: (1) NF register (date, value, client, service description, optionally revenue type), (2) running annual total + % of R$81k with threshold alerts (e.g. 80%, 90%, 100%, and the +20% tolerance band that triggers desenquadramento), (3) a year-end report that maps directly to the DASN-SIMEI fields (total faturamento by type) so the user can transcribe it in minutes. Keep it a **record + report** tool, NOT a filing integration (see anti-features). |

### Anti-Features (Commonly Requested, Often Problematic)

Things that seem natural to add but should be deliberately NOT built for v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic bank integration (Open Finance / scraping) | "Why upload manually?" — every fintech does it | Already Out of Scope in PROJECT.md. Open Finance needs regulated partner/aggregator (Pluggy/Belvo) = cost + compliance + ongoing maintenance; scraping is fragile and ToS-risky. Massive scope for a personal app | Keep manual OFX/CSV/PDF upload. Revisit Pluggy/Belvo only if upload friction proves intolerable post-validation. |
| Full DASN-SIMEI e-filing / gov.br integration | "Make the MEI tab actually submit the declaration" | No public API; would mean automating a gov portal = brittle, legally sensitive, high maintenance. The stated goal is only to *facilitar* the declaration | Generate a clean report the user copies into the official portal. Record-and-report, not file-for-you. |
| IRPF / broader tax engine | "If it does MEI, why not income tax?" | Explicitly Out of Scope. IRPF rules are complex, change yearly, high liability | Hard stop at MEI/DASN-SIMEI. |
| Investment/brokerage tracking, net-worth, B3 sync | Common in Monarch/Mobills premium | Different domain (assets vs cash-flow), pulls focus from the classify→goals moat, needs market-data feeds | Out for v1. The app is cash-flow + budgeting, not wealth management. |
| Native mobile app | "I want it on my phone" | Out of Scope; responsive web covers it. Native = 2nd codebase, app-store overhead | Responsive Next.js web; installable PWA if mobile feel is needed. |
| Shared/family account UI | Wife joins later | Out of Scope for v1 UI; only the *data model* is multi-user-ready | Build `user_id` scoping + RLS now (table stake); defer shared-view UI to a later milestone. |
| Real-time / push-notification alerts infrastructure | "Alert me when I hit 90% of a budget" | Real-time push needs background jobs, delivery infra, mobile presence — heavy for single-user web | In-app threshold badges/banners computed on page load (e.g. "Alimentação at 92% of monthly target"). Email digest at most, later. |
| Multi-currency | Generic finance-app feature | User is single-currency BRL; adds modeling weight (FX rates, conversion) for zero value here | BRL-only. Hard-code R$. |
| AI auto-applying to *new* merchants without confirmation | "Let the AI just do it all" | Breaks the explicit decision: AI suggestions for never-seen merchants must be human-confirmed before becoming memory. Auto-trusting AI poisons the memory with errors | Confirm-then-memorize for new merchants; auto-apply only from *confirmed* memory. |

## Gaps in the User's Stated Scope (Should Consider)

Common features the user did NOT mention but that the domain expects — call these out for requirements:

- **Duplicate detection on import** — listed above as table stakes; user didn't mention it but it's mandatory to keep the ledger trustworthy. **Highest-priority gap.**
- **Recurring-expense detection** — user mentioned recurring *income* but not recurring *expenses* (Netflix, aluguel, mensalidades). Monarch auto-detects these; surfaces "hidden" subscriptions and makes monthly forecasts possible. Reuses the recurring-income engine. **Strong add — low marginal cost, high value.**
- **Budget threshold alerts (in-app)** — % -of-target alerts (80/90/100%) for both budget categories and the MEI R$81k limit. User implied adherence but not proactive warnings. The MEI-limit alert is arguably essential given desenquadramento risk.
- **Export (CSV / report PDF)** — for backup, taxes, and "own your data." Cheap, expected, reduces lock-in anxiety. Especially the MEI year-end report as a downloadable artifact.
- **Transfers between accounts** — moving money between own accounts must NOT count as income or expense, or it pollutes targets. Related to the reservas double-counting problem. **Modeling gap to resolve.**
- **Reconciliation / running balance per account** — light "does my recorded balance match reality" check; prevents silent drift.
- **Multi-account modeling** — listed in table stakes; user spoke of "faturas" (plural) but didn't model the account dimension explicitly.
- **Handling income/expense sign + refunds/estornos** — credit-card statements include estornos (refunds) and payments; these need correct signs or category math breaks.

## Feature Dependencies

```
Statement ingestion (OFX/CSV/PDF)
    └──requires──> Transaction list + multi-account model
    └──requires──> Duplicate detection (else re-import corrupts ledger)

Editable BR categories
    └──required-by──> Classification (memory + AI)
    └──required-by──> Budget targets
    └──required-by──> Reservas ("Reserva" is a category)

Classification memory layer
    └──requires──> Merchant-descriptor normalization (the hard part)
    └──required-by──> Suggest→confirm→auto-apply loop
    └──required-by──> Bulk re-classification (re-apply rule to history)

AI classification (Layer 2)
    └──requires──> Classification memory layer (only fires on cache-miss)
    └──requires──> Human-confirm gate before writing memory

Income tracking (recurring + ad-hoc)
    └──required-by──> Budget targets (% -of-income needs the denominator)
    └──shares-engine-with──> Recurring-expense detection

Budget targets (% of income, monthly + annual)
    └──requires──> Income tracking + categorized transactions
    └──required-by──> Adherence dashboard
    └──enhanced-by──> Threshold alerts

Reservas (sinking funds)
    └──requires──> "Reserva" category + sub-prompt flow on classification
    └──requires──> Transfer/exclusion logic (don't double-count vs budget targets)

MEI module
    └──mostly-independent (separate NF register + R$81k tracker + report)
    └──enhanced-by──> Threshold alerts (limit warnings)
```

### Dependency Notes

- **Budget targets require Income tracking:** %-of-income is undefined without a reliable income figure; build income first.
- **Classification loop requires merchant normalization:** the memory's match key is a normalized descriptor; without normalization the memory never hits and every txn looks "new" to the AI (expensive + annoying). This is the quiet critical path.
- **Reservas conflict with naive budget math:** a "Reserva" transaction is money leaving the checking account (looks like spend) but is *saving*, not *consumption*. If it counts against spend targets the adherence view lies. Decide early: reservas are excluded from spend-target denominators (treated as a transfer/saving). **Resolve in requirements.**
- **AI depends on memory:** AI is the fallback for cache-misses only; it cannot ship before the memory layer or costs/UX blow up.

## MVP Definition

### Launch With (v1) — the classify→goals loop must work end to end

- [ ] Income: recurring (salário, pensão) + ad-hoc — *budget denominator*
- [ ] OFX + CSV import with duplicate detection + multi-account model — *cheap, reliable ingestion*
- [ ] Transaction list + edit — *the spine*
- [ ] BR default categories, editable — *taxonomy for everything*
- [ ] Classification memory layer (normalize → match → auto-apply confirmed) — *the moat, half 1*
- [ ] AI classification for new merchants, human-confirmed → memorized — *the moat, half 2*
- [ ] Suggest→confirm→auto-apply review screen + bulk re-classify — *the product's main screen*
- [ ] Budget targets (% of income), monthly + annual-cumulative — *the moat, "visão de metas"*
- [ ] Adherence dashboard (both horizons, progress bars, over-budget flags) — *the payoff*
- [ ] Reservas: named buckets, optional target+progress, contribution-via-"Reserva"-category + withdrawals, per-bucket history — *differentiator the user clearly wants*
- [ ] MEI: NF register + R$81k running tracker + DASN-SIMEI report — *explicit v1 goal*
- [ ] In-app threshold alerts for budget % and MEI limit — *cheap, prevents real harm (desenquadramento)*
- [ ] `user_id` scoping + RLS — *infra mandate*

### Add After Validation (v1.x)

- [ ] **PDF import, per-bank** — *trigger: OFX/CSV proves too limited for the banks the user actually uses.* High-risk; add incrementally one bank at a time. Could be in v1 for the user's primary card only if OFX isn't available there.
- [ ] Recurring-expense detection — *trigger: enough history accrued to detect patterns.*
- [ ] Export (CSV + MEI report PDF) — *trigger: first tax season or backup need.*
- [ ] Transfers-between-accounts as first-class type — *trigger: reconciliation noise appears.*

### Future Consideration (v2+)

- [ ] Shared/family UI for wife — *defer until single-user is validated; data model already ready.*
- [ ] Email/digest alerts — *defer; in-app alerts suffice for single web user.*
- [ ] Open Finance aggregation (Pluggy/Belvo) — *defer; only if manual upload friction is proven painful, accept cost/compliance.*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Classification memory + confirm loop | HIGH | MEDIUM | P1 |
| Budget targets %-of-income (monthly+annual) + adherence dashboard | HIGH | MEDIUM–HIGH | P1 |
| OFX/CSV import + dedup + multi-account | HIGH | MEDIUM | P1 |
| Income tracking (recurring + ad-hoc) | HIGH | LOW–MEDIUM | P1 |
| Editable BR categories | HIGH | LOW | P1 |
| Reservas (sinking funds) | HIGH | MEDIUM–HIGH | P1 |
| MEI module (NF + limit + report) | HIGH | MEDIUM | P1 |
| AI fallback classification | HIGH | MEDIUM | P1 |
| Bulk re-classification | MEDIUM | MEDIUM | P1 |
| In-app threshold alerts (budget + MEI) | MEDIUM | LOW | P1 |
| PDF import | MEDIUM | HIGH | P2 |
| Recurring-expense detection | MEDIUM | MEDIUM | P2 |
| Export (CSV / report) | MEDIUM | LOW | P2 |
| Transfers between accounts | MEDIUM | LOW–MEDIUM | P2 |
| Shared/family UI | LOW (now) | MEDIUM | P3 |
| Open Finance integration | MEDIUM | HIGH | P3 |

## Suggested BR Default Category Seed

Editable, but ship a sensible Brazilian taxonomy so the user isn't staring at an empty list (sources: BB/Neon/XP/PayPal-BR personal-finance category guides):

- **Moradia** (aluguel/financiamento, condomínio, IPTU, manutenção)
- **Contas de consumo** (luz, água, gás, internet, celular)
- **Alimentação** (mercado/supermercado)
- **Restaurantes & delivery**
- **Transporte** (combustível, app de transporte, transporte público, manutenção veículo)
- **Saúde** (plano, farmácia, consultas)
- **Educação** (mensalidades, cursos)
- **Lazer & entretenimento** (streaming, cinema, viagens)
- **Compras pessoais** (roupas, eletrônicos)
- **Cuidados pessoais** (higiene, beleza)
- **Assinaturas & serviços**
- **Impostos & tarifas** (tarifas bancárias, taxas)
- **Pets**
- **Presentes & doações**
- **Reserva** (special — routes to sinking funds, excluded from spend targets)
- **Transferência** (special — internal, excluded from income/expense math)
- **Outros**

Mark **Reserva** and **Transferência** as system/special categories that are excluded from normal spend-vs-target computation.

## Competitor Feature Analysis

| Feature | Mobills / Organizze (BR mass apps) | Monarch / YNAB (US power apps) | Our Approach |
|---------|-------------------------------------|--------------------------------|--------------|
| Import | OFX/CSV/Excel/PDF, credit-card invoice import | Bank sync (US) + rules | OFX/CSV first, PDF per-bank later — no bank sync |
| Categorization | Manual + simple rules | Static rules engine, bulk edit (Monarch), payee-memory (YNAB) | **Learned memory + AI fallback w/ confirm** — the differentiator |
| Budgets | Fixed R$ monthly | Flexible monthly | **% -of-income, monthly + annual-cumulative** — the differentiator |
| Goals/savings | Goal manager | Goals | **Reservas w/ contribution-via-classification** — the differentiator |
| Recurring | Bills/alerts | Auto-detect recurring | Recurring income v1; expense-detect v1.x |
| Bulk recategorize | Limited | Yes (Monarch) | Yes — required by memory model |
| MEI/DASN | None | N/A (US) | **MEI module** — uncontested differentiator in BR personal finance |
| Tax filing | None | N/A | Report-only, not e-file (anti-feature) |

## Sources

- gov.br / Receita Federal — DASN-SIMEI manual & R$81k limit (HIGH): https://www8.receita.fazenda.gov.br/simplesnacional/arquivos/manual/manual_dasn-simei.pdf ; https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos-para-mei/declaracao-anual-de-faturamento
- MaisMEI / Contabilizei / Nubank — DASN-SIMEI deadlines, +20% tolerance, desenquadramento (MEDIUM): https://ajuda.maismei.com.br/hc/ajuda-da-maismei/articles/1745869317-guia-completo-entenda-a-dasn_simei-declaracao-anual-do-mei ; https://blog.nubank.com.br/dasn-simei/
- Mobills help / my-best / TechTudo — BR app import (OFX/CSV/PDF), feature baselines (HIGH on feature existence): https://ajuda.mobills.com.br/hc/pt-br/articles/360051606394 ; https://br.my-best.com/18262
- Monarch Money help — rules engine, bulk recategorize, recurring detection, review thresholds (MEDIUM): https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules
- YNAB vs Monarch comparisons — payee-memory vs rules, categorization UX (MEDIUM): https://robberger.com/ynab-vs-monarch-money/
- ExpenseSorted / QuickBooks pattern writeups — ML categorization accuracy (70–80% cold → ~95% after ~50 corrections), suggest/confirm/auto-apply, merchant memory, TF-IDF/embeddings normalization (MEDIUM): https://www.expensesorted.com/blog/ai-expense-categorization-personal-finance-apps
- Goodbudget/envelope UX writeups — sinking funds, 85% envelope alerts, categorize-on-transaction prompt (MEDIUM): https://medium.com/@ayushnandanwar13/revamping-a-budgeting-app-goodbudget-a-ux-ui-case-study-eaf0ef928222
- BR statement parsers (feasibility) — `tio-ze-rj/banksheet` (TS; Nubank/Itaú/Bradesco/Inter), `moacyrricardo/bank-importer`, PDF-parsing pitfalls (MEDIUM): https://github.com/tio-ze-rj/banksheet ; https://dev.to/tiozerj/i-built-a-local-only-pdf-bank-statement-parser-with-a-plugin-system-heres-how-it-works-3gd8
- LLM cost for short-text classification — GPT-4o-mini / Gemini Flash-Lite cheapest tier, embeddings vastly cheaper than prompting, batch mode (MEDIUM): https://inference.net/content/llm-api-pricing-comparison/
- BR category taxonomy — BB/Neon/XP/PayPal-BR personal-finance category guides (MEDIUM): https://blog.bb.com.br/controle-de-gastos-por-categoria-descubra-para-onde-vai-seu-dinheiro/

---
*Feature research for: personal finance / budgeting web app (Brazil) with AI classification, %-of-income budgets, sinking funds, and MEI*
*Researched: 2026-06-16*
