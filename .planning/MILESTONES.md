# Milestones

## v1.6 Classificação fluida & ingestão robusta (Shipped: 2026-06-21)

**Phases completed:** 4 phases (21–24), 9 plans, 13 tasks
**Git range:** `c0eb7ec` → `7b146d8` · 73 commits · ~2026-06-20→21
**Requirements:** 8/8 code-side satisfeitos (KW-09/KW-10 · KW-07/KW-08 · CLSAI-10 · PDF-06/PDF-07/IMP-07) — auditoria do milestone `tech_debt` (0 blockers; integration WIRED 8/8)
**Quality:** suíte **917/917** verde · `tsc --noEmit` + `npm run build` limpos · code review por fase (review→fix→re-review limpo) · migration 0038 replay-provada no stack local (`UPDATE 1`, antes 23514)

**Key accomplishments:**

- **Match wildcard + procedência persistida** (Phase 21, KW-09/KW-10): glob `*` opt-in na palavra-chave (`UBER*`, `*IFOOD*`) ReDoS-safe com especificidade por contagem de literais, e a procedência `palavra-chave` finalmente PERSISTE em `transactions.classification_source` (migration `0037` widening do CHECK; `deriveSource` re-deriva server-side com guarda de igualdade de categoria) — resolve o coarse-`memória` do v1.5.
- **Sugestão de palavra-chave inline + batch** (Phase 22, KW-07/KW-08): controle inline "+ palavra-chave" por linha na grid de revisão (opt-in, só em linha `origin==='manual'`, reusa `addKeyword`); e um dialog global em `/categorias` que minera `merchant_patterns` confirmados, exclui descritores já cobertos (via `matchKeyword`), e aprova/descarta candidatas em lote (`getKeywordSuggestions`/`approveKeywordSuggestions`, owner-gate único + um revalidate, descarte session-only). Sem auto-cadastro.
- **Aplicar sugestões em lote por confiança** (Phase 23, CLSAI-10): o "aplicar todas" agora preenche só as sugestões de IA confiáveis (`confidence >= LOW_CONFIDENCE` 0.6), deixando as de baixa confiança pendentes para revisão manual — limiar único reusado, copy pt-BR "confiáveis", sem auto-commit, `confirmImport` intacto.
- **Ingestão robusta** (Phase 24, PDF-06/PDF-07/IMP-07): worker do `pdfjs` forçado no bundle serverless da Vercel (`outputFileTracingIncludes`), parser degrada limpo em PDF image-only/ruído (sem OCR), e migration `0038` libera o re-import — `statements.status` aceita `'imported'`, destravando a fast-path "já confirmado → bloqueia re-review" que estava morta (23514 engolido).

**Deferred items (autonomous:false, credential/deploy-gated — acknowledged at close):** PROD `supabase db push` de `0037`+`0038` (precisa `SUPABASE_ACCESS_TOKEN`) + live-verify de PDF em PROD (SC1) e dos UATs de P22/P24. Code-complete + localmente provado; ver STATE.md "Deferred Items" + `22-UAT.md`/`24-UAT.md`.

---

## v1.5 Classificação determinística (Shipped: 2026-06-20)

**Phases completed:** 3 phases (18–20), 6 plans
**Git range:** `401cbb4` → `0f0b26a` · 118 files, +7766/−93 · execução em ~6h (2026-06-19)
**Requirements:** 8/8 satisfeitos — MKT-01 live human-verify fechado 2026-06-20 (18-UAT.md 3/3 pass)
**Quality:** suíte 857 verde · `tsc --noEmit` + `npm run build` limpos · 3/3 fases SECURED · nyquist 3/3 compliant

**Key accomplishments:**

- **Pipeline determinístico memória → palavra-chave → IA** no upload (Phase 20, KW-02/03/04/05): o keyword pass roda entre a memória e o batch de IA, **maior palavra-chave vence**, é sobrescrevível na grid, aprende no confirm e não auto-commita — reduz as chamadas de IA cobrindo merchants cadastrados.
- **Cadastro de palavras-chave por categoria** em `/categorias` (Phase 19, KW-01/KW-06): tabela `category_keywords` (migration `0036`, RLS user-scoped) + actions `addKeyword`/`removeKeyword` (Zod, owner gate, dedupe pré-check+23505) + `CategoryKeywordsDialog` (chips removíveis + Empty state).
- **Prompt da IA kind-aware** (Phase 18, CLSAI-09): cada categoria vai ao prompt com seu `kind` (consumo/alocação) + glossário + regra dura anti-alocação + code gate — corrige a classe de erro "AliExpress/Mercado Livre → Investimentos/Reserva".
- **Categoria default "Marketplace"** (migration `0035`) aplicada em PROD (`db push` do owner, 2026-06-19) — dá à IA e às regras um bucket de compras de marketplace. (MKT-01)
- Badge de procedência **'palavra-chave'** na grid de revisão, espelhando o badge de memória.

**Deferred items: 0 (all resolved).** MKT-01 fechado 2026-06-20 via `/gsd-verify-work 18` — owner confirmou ao vivo em PROD: `0035` na coluna Remote, "Marketplace" presente em `/categorias`, e um descritor de marketplace nunca visto recebeu sugestão de consumo (nunca Investimentos/Reserva). 18-UAT.md 3/3 pass → 18-VERIFICATION.md `passed`. Milestone fechado em **8/8 requisitos**.

---

## v1.4 IA de Classificação (Shipped: 2026-06-19)

**Phases completed:** 4 phases, 12 plans, 17 tasks

**Key accomplishments:**

- Installed the two first-party Vercel AI providers (@ai-sdk/google 3.0.83, @ai-sdk/anthropic 3.0.85) behind an approved legitimacy gate, and laid down three RED Nyquist Wave 0 tests pinning the BYOK schema, provider factory, and provider-error→pt-BR contracts.
- Authored and (LOCAL-)applied `0033_ai_settings.sql` — the encryption/storage root of the v1.4 BYOK chain: a Vault-backed `ai_settings` table that stores only a `key_secret_id` reference (never a plaintext key), RLS isolating each user's row, and three SECURITY DEFINER RPCs (get/save/remove) where decrypt is reachable only through an `auth.uid()`-filtered trust boundary. Regenerated `database.types.ts` and proved cross-user decrypt isolation, key rotation, and removal on the LOCAL stack.
- BYOK substrate: Zod provider/apiKey gate, client-safe provider registry, per-call gemini/claude factory, and a server-only decrypt DAL that is the app's sole handler of the plaintext key.
- Review-grid suggestion affordances: `SuggestionSlot` consumes `row.suggestion` with a provenance badge (memória vs IA), a per-row confidence hint, and low-confidence-first ordering — pure UI over the proven pipeline, no auto-commit (CLSAI-07/08).
- Phase 17 (operational/isolated): quitou a dívida v1.3 — G-07/G-08 confirmados no bundle PROD (deploy-ancestry), walkthroughs MEI (dasn CSV BOM/`;`/pt-BR) + LGPD (export + delete) ao vivo, VALIDATION.md Nyquist 12/13, e o **delete destrutivo de conta DATA-02 executado ao vivo** sob runbook de 5 guard-rails.
- Batched, schema-constrained `doGenerate` classifier (`classifyDescriptors`) over Gemini+Claude with a flat $ref-free JSONSchema7, post-hoc enum-gating via `validateSuggestion`, a never-throw empty-Map fallback, and a PII-safe descriptor_norm-only prompt — plus the additive `ParsedReviewRow.suggestion` hint field.
- Wired the real AI into the ingest pipeline as a memory-first two-pass loop around ONE batched `classifyDescriptors` call (zero calls when every descriptor is a memory hit), attaching non-binding `row.suggestion` hints on misses without ever auto-committing to `category_id`, plus a `suggestCategory` 1-item delegate, a payload-only-`descriptor_norm` PII guard, and `maxDuration = 60`.

---

## v1.3 Produção & PDF (Shipped: 2026-06-18)

**Phases completed:** 2 phases (12-13), 15 plans, 18 tasks
**Git:** 76 commits, 100 files (+7829 / -128), single-day sprint. First tag: `v1.3`.

**Key accomplishments:**

- **App live em produção** — Supabase pessoal remoto (`sa-east-1`, migrations 0001-0032, RLS ativo em todas as tabelas, typed client sem drift) + Vercel (`gru1`, `maxDuration` nas rotas de parsing). Login pessoal, sessão persistente e isolamento RLS cross-user verificados ao vivo no browser (DEPLOY-01/02/03).
- **Core value provado ao vivo** — fatura real (Nubank OFX, 22 linhas) em produção → parse server-side → review grid → classificação por **memória** (auto-classifica conhecido; novo vira padrão na confirmação) → aderência às metas mensal **e** anual (DEPLOY-04/05). A camada de IA NÃO foi construída; o core value shipou memory-only (seam `suggestCategory()` pronto p/ v1.4).
- **PDF de fatura** — Santander PDF pela mesma UI de upload, fluindo pelo MESMO pipeline ingest→review→confirm→classify→metas que OFX/CSV: parser `getText` (não `getTable`, decidido no spike), bloco hard image-only distinto de parse 0-linhas, estorno→`credit` server-derived, migrations 0031 (`transactions.kind`) + 0032 (`statements.format`). Verificado end-to-end ao vivo (98 linhas, contagens honestas, estorno verde, confirm→/extrato→metas) (PDF-01..05).
- **WR-02 fechado + doc hygiene** — migration 0029 corrige o edge same-odometer em `v_abastecimento_consumo` (km/l não subestima, R$/km não superestima); `requirements_completed` CAR-02/03/04 backfilled no frontmatter das fases 9/10 (DEBT-01/02).
- **8 defeitos de live-verify corrigidos (G-01..G-08)** — Base UI Select renderiza label não o valor cru/`__none__` em todos os call sites; truncamento de label de aderência + migration 0030 (refresh da view remota stale); copy calma sob-teto ("Dentro"); affordance de delete em /receitas; `BrDateField` pt-BR dd/mm/aaaa em todos os 6 forms (storage ISO mantido); toast de importação honesto em re-confirm all-duplicate.

**Requirements:** 12/12 v1.3 satisfeitos (DEPLOY-01..05, PDF-01..05, DEBT-01/02). Auditoria do milestone: `tech_debt` — `milestones/v1.3-MILESTONE-AUDIT.md`. Cross-phase integration limpa (0 blockers, 0 broken flows, `tsc` exit 0).

**Status:** **SHIPPED — app no ar em produção.** Core value (memory-only) e PDF de fatura provados ao vivo. Tag git `v1.3` (primeira tag do projeto).

**Known deferred items at close: 3** (acknowledged `tech_debt`, ver STATE.md `## Deferred Items`):

- Redeploy dos fixes G-07/G-08 (cosméticos do grid de importação; GREEN local, commit `2ae93fb`) — live bundle pendente.
- Walkthroughs hands-on 12-06 (MEI: downloads CSV/JSON) + 12-07 (LGPD: export + delete de conta throwaway) — re-verificam reqs v1.0 (MEI-*/DATA-*/SEC-01), não reqs v1.3.
- VALIDATION.md de Nyquist: Phase 12 ausente, Phase 13 draft (`nyquist_compliant:false`) — ambas verificadas por outros meios.

---

## v1.2 Carro (Shipped: 2026-06-18)

**Phases completed:** 4 phases, 13 plans, 17 tasks

**Key accomplishments:**

- Carro data substrate: `carros` + `abastecimentos` tables, the nullable non-accounting `transactions.carro_id` tag, two `security_invoker` consumption views (km/l + R$/km), the cost XOR CHECK + partial unique index, uniform RLS — applied to the local stack with a no-drift typed client and Wave-0 cross-user isolation proofs.
- The typed, validated, IDOR-safe Carro write boundary: `carroSchema` (apelido required + the four optional fields + the fixed combustivel enum), `assertOwnedCarro` (exactly-1-row RLS re-derive in the shared ownership module), and the four `createCarro`/`updateCarro`/`archiveCarro`/`unarchiveCarro` server actions — every write Zod-gated, session-gated, ownership-re-derived before touching a row, returning `{ ok } | { error }` without ever throwing — mirroring the proven reservas/MEI grammar exactly.
- The user-facing Carro slice that closes CAR-01 + CAR-06: a "Carros" nav entry (sidebar after Reservas + bottom-nav 6th mobile item, lucide `Car`), the `CarroForm` create/edit Dialog and identity-only `CarroCard` (both cloned verbatim from the reservas grammar and wired to the Plan-02 actions), the `/carros` list RSC (RLS-scoped read + `?arquivados=1` Switch filter + responsive CarroCard grid + Car-icon Empty + inline error), and the minimal `/carros/[id]` identity detail (definition list + Editar/Arquivar header actions, `notFound()` on a foreign/missing id) — identity only, zero money/KPIs (deferred to Phases 9-11), zero new visual primitives, zero new npm deps.
- Non-destructive expense→car tagging (CAR-02, D4): an optional `carro_id` lens on any expense via the transaction form, an "Vincular a carro" row action + bulk action on the extrato, and per-row tagging in the import-review — every write `assertOwnedCarro`-re-derived (IDOR-safe), and tagging/untagging never touches the row's category, value, or goal math (proven byte-identical by a Wave-0 integration test).
- Hybrid fueling log + consumption math (CAR-03/04): `abastecimento` entries with odometer/liters/full-tank flag/fuel type, cost from EITHER a linked invoice transaction OR a manual amount (exactly one, enforced by a DB CHECK XOR + server validation), feeding two `security_invoker` views that compute km/l by the full-tank method and R$/km per interval, exposed as per-car averages.
- Two pure-data Phase-11 presentation leaves — a token-aware recharts km/l-over-time LineChart (pt-BR tooltip, null/0-interval drop, empty state) and a neutral gasto-por-categoria magnitude-bar list (valor-desc, formatCents mono label) — each behind a Wave-0-tested prop contract.
- The /carros list now shows real gasto total + km/l médio per card, read from the existing `v_carro_resumo` (RLS-scoped), with the `—` sentinel for no-data — completing the deferred Phase-8 identity-only card promise without touching its identity/actions.
- The `/carros/[id]` detail page is now the full CAR-05 capstone — header, 3 KPI cards (km/l médio · R$/km · gasto total), an inline RLS-scoped gasto-por-categoria magnitude-bar section, the km/l-over-time consumption line chart, and the integrated Phase-10 AbastecimentoHistory — in UI-SPEC section order, with the SEC-01 bundle-secret audit re-run GREEN against a fresh build now that a chart client component is in the bundle.

**Requirements:** CAR-01..06 — 6/6 satisfied (audit: `milestones/v1.2-MILESTONE-AUDIT.md`). Cross-phase integration ship-ready, headline E2E flow complete, no double-count.

**Tech debt carried forward (accepted at close):**

- WR-02 — `v_abastecimento_consumo` understates km/l / overstates R$/km when two full-tank fills share the EXACT same odometer (near-impossible single-user data shape; isolated to one car's consumption average; `gasto_total_cents` unaffected). Fix = future migration 0029.
- Doc hygiene — CAR-02/03/04 absent from per-plan SUMMARY `requirements_completed` frontmatter (carried by checkbox + phase VERIFICATION instead).

**Status:** Code-complete on the LOCAL Supabase stack. **Not deployed** — no git tag created. The deferred `autonomous:false` remote-wiring + Vercel deploy + live-verify walkthroughs (01-04, 02-05, 03-06, 04-04, 05-04, 06-05) remain open pending user credentials; tag v1.2 at real release.

---
