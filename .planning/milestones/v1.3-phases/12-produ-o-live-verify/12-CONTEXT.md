# Phase 12: Produção & Live-Verify - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Levar o app — onze fases code-complete e verificadas no stack Supabase **local** — para produção no **Supabase pessoal + Vercel** do usuário, provar o **core value ao vivo no browser**, e fechar a dívida WR-02 (migration 0029) **antes** de qualquer dado entrar em produção.

A fase NÃO é greenfield: ela **sequencia e executa seis walkthroughs `autonomous:false` já escritos** (gated nas credenciais do usuário), mais a migration 0029 e a doc-hygiene. Toda a fase é credencial/interativa.

**Em escopo:** DEPLOY-01..05, DEBT-01 (WR-02 / migration 0029), DEBT-02 (doc hygiene).
**Fora de escopo:** construir a classificação por IA (deferida — ver Deferred), PDF de fatura (Phase 13), domínio próprio, segundo usuário (esposa).
</domain>

<decisions>
## Implementation Decisions

### Gap da IA na classificação (afeta DEPLOY-05 / core value)
- **D-01:** A classificação por **IA nunca foi construída** — `src/lib/classifier/suggest.ts` é um seam deferido que retorna `null` sempre (CLS-02 "post-v1"); não há AI SDK instalado. Classificação real hoje = **memória pura**: estabelecimento novo → pick **manual**, não sugestão de IA.
- **D-02:** Para o v1.3, **memory-only É o core value** a ser provado ao vivo. O live-verify (DEPLOY-05) prova: memória aprende com a confirmação → auto-classifica o mesmo merchant na próxima fatura (CLS-04), + aderência às metas (mensal **e** anual). NÃO se verifica "IA no caso novo" porque não existe.
- **D-03:** **DEPLOY-05 deve ser reinterpretado como "memória + pick manual"** (não "memória + IA"). A wording original de DEPLOY-05/PROJECT core-value que cita "IA" está factualmente errada para o estado built — o planner/verifier NÃO deve criar verificação para uma IA inexistente (seria gap falso). Correção aplicada em REQUIREMENTS.md no fechamento deste discuss.
- **D-04 [informational]:** A IA (wire AI SDK + Gemini 2.5 Flash-Lite via AI Gateway no seam `suggestCategory()` já pronto + `validateSuggestion` enum wrapper) é **diferida para o próximo milestone (v1.4)** — ver Deferred. _(Não é trabalho da Phase 12 — decisão de escopo diferido; não rastreada por nenhum plano, ver D-01/02/03.)_

### Região da infraestrutura
- **D-05:** Projeto Supabase e deploy Vercel na região **São Paulo (Supabase `sa-east-1` / Vercel `gru1`)** — menor latência BR, dado financeiro fica no Brasil (LGPD-friendly), combina com o `America/Sao_Paulo` já usado no código (date-fns-tz). **Free tier** em ambos.

### Domínio / URL de produção
- **D-06:** Usar o **subdomínio `*.vercel.app`** gerado (grátis, zero DNS). Configurar o Supabase Auth Site URL + Redirect URLs para essa URL. Domínio próprio fica para depois (troca sem retrabalho grande). Ver Deferred.

### Execução dos 6 walkthroughs diferidos
- **D-07:** **Deploy único, verify em sequência.** Ordem de execução:
  1. Criar + aplicar **migration 0029** (WR-02, DEBT-01) no stack local; validar.
  2. Wire Supabase remoto (`.env.local` + dashboard: email confirmation OFF) → `supabase link` → `db diff` (não-clobbering) → `db push` aplicando **0001-0029** (inclui a 0029, pra prod nascer com a view corrigida).
  3. **Um** deploy Vercel (`vercel link` + env vars + `vercel --prod`).
  4. Rodar os 6 verifies contra essa URL única, em ordem: **01-04 (auth/RLS/skeleton) → 02-05 (receitas/lançamentos) → 03-06 (metas/aderência/reservas) → 04-04 (upload OFX/CSV + classificação memória + aprendizado) → 05-04 (MEI/DASN) → 06-05 (LGPD/export/delete/secret-gate)**.
- **D-08:** Não re-deployar entre walkthroughs (mesmo bundle; um deploy basta).
- **D-09:** DEBT-02 (doc hygiene — `requirements_completed` CAR-02/03/04 no frontmatter dos SUMMARY das fases 9/10) é um **chore trivial** dentro desta fase, não plano próprio.

### Carregadas de planos diferidos (NÃO re-perguntar — já decididas)
- **D-10:** Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (nomes novos sb_publishable_/sb_secret_; se o projeto for legado, colar a anon key sob o var name publishable). Confirmado em `src/lib/supabase/` e no plano 01-04.
- **D-11:** **Email confirmation OFF** (Auth → Providers → Email) para signup frictionless do v1; re-ligar quando a esposa entrar. O único usuário cria a conta via **signup aberto** na URL deployada.
- **D-12:** `db push` precede qualquer upload; bucket `statements` **privado**; RLS sem badge "Unrestricted" (checagem de dashboard). SEC-02: grep do bundle deployado sem `sb_secret_`/`service_role`.

### Claude's Discretion
- Conteúdo exato da migration 0029 (abordagem do fix same-odometer em `v_abastecimento_consumo`) — decisão técnica do planner/executor.
- Mecânica de `supabase gen types --linked` pós-push se houver drift.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Walkthroughs diferidos a executar (núcleo da fase)
- `.planning/phases/01-funda-o-auth-rls-dinheiro-schema/01-04-PLAN.md` — wire `.env.local` + Supabase remoto, `db push`, deploy skeleton Vercel, verify auth ao vivo (DEPLOY-01/02/03). Tem o threat model de deploy.
- `.planning/phases/02-receitas-categorias-e-lan-amentos-manuais/02-05-PLAN.md` — verify receitas/lançamentos manuais ao vivo.
- `.planning/phases/03-metas-ader-ncia-e-reservas/03-06-PLAN.md` — verify dashboard de aderência (mensal+anual) + sub-fluxo reservas.
- `.planning/phases/04-upload-classifica-o-inteligente/04-04-PLAN.md` — verify upload OFX/CSV → review → classificação por **memória** → aprendizado de padrão (núcleo do DEPLOY-05). Confirma que CLS-02/IA está deferido.
- `.planning/phases/05-m-dulo-mei-dasn-simei/05-04-PLAN.md` — verify MEI (NF, limite anual, relatório DASN) ao vivo.
- `.planning/phases/06-endurecimento-lgpd-isolamento-auditoria/06-05-PLAN.md` — verify export CSV/LGPD + delete + gate de segredos no bundle.

### Requisitos & roadmap
- `.planning/REQUIREMENTS.md` — DEPLOY-01..05, DEBT-01/02 (DEPLOY-05 corrigido p/ memory-only neste discuss).
- `.planning/ROADMAP.md` §"Phase 12" — goal, success criteria, exclusão explícita do 07-07.

### Stack & convenções de deploy
- `CLAUDE.md` §"Supabase patterns (App Router, TS strict)" + §"Statement parsing on Vercel serverless" + §"Money, dates, i18n" — `@supabase/ssr` getAll/setAll, middleware refresh, RLS `auth.uid()=user_id`, Storage privado, `maxDuration` nas rotas de parsing, `America/Sao_Paulo`.

### Seam da IA (contexto da decisão D-01..04)
- `src/lib/classifier/suggest.ts` — o seam deferido (retorna null); `validateSuggestion` enum wrapper já pronto p/ a IA futura.
- `.planning/phases/04-upload-classifica-o-inteligente/04-04-SUMMARY.md` — "CLS-02 (LLM suggestion) remains Deferred".
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/supabase/client.ts` + server client — consomem `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SECRET_KEY`; já implementam o padrão SSR. Nada a mudar; só wirar env.
- `supabase/migrations/0001-0028` — idempotentes, aplicadas no local. A **0029** (WR-02) é a única nova; aplicar local → remoto.
- Parsers in-house `src/lib/parsers/{csv.ts,ofx.ts}` (sem dep externa de OFX; papaparse p/ CSV) — o upload OFX/CSV verificado no 04-04 usa estes.
- `src/lib/classifier/{memory.ts,suggest.ts}` — memory match + seam de IA (null). Verify do core value exercita só memory.ts.

### Established Patterns
- Dinheiro em centavos inteiros (bigint); RLS `auth.uid()=user_id` em toda tabela; Storage `statements` privado por `user_id`. Todos provados no local; esta fase re-prova no remoto.
- `autonomous:false` = checkpoint humano (paste de credencial / passo de browser). Toda a Phase 12 é assim.

### Integration Points
- `.env.local` (gitignored) → clients Supabase. Mesmos valores nas env vars do projeto Vercel.
- Dashboard Supabase: email confirm OFF, região, RLS/bucket checks. Vercel: link + env + deploy + região gru1.
</code_context>

<specifics>
## Specific Ideas

- Live-verify do core value (DEPLOY-05) = **caminho de memória**: subir uma fatura OFX/CSV real → revisar no grid → classificar memory-miss manualmente → confirmar (aprende padrão) → re-subir fatura com mesmo merchant → ver auto-classificação (CLS-04), com a aderência às metas refletindo.
- Amostras reais disponíveis em `fixtures/faturas-pdf/{santander,nubank}/` (gitignored) — o **Nubank OFX** serve para o verify do upload em produção (caminho determinístico); os PDFs são para a Phase 13.
</specifics>

<deferred>
## Deferred Ideas

- **Classificação por IA (CLS-02)** → próximo milestone **v1.4**: wire AI SDK + Gemini 2.5 Flash-Lite via AI Gateway no seam `suggestCategory()` (memory-first, IA só no caso novo, confirmação humana antes de virar padrão). Infra do seam + enum wrapper + SuggestionSlot já prontos → é additivo.
- **Domínio próprio** → depois do v1.3; trocar Site/Redirect URLs do Supabase. Sem retrabalho grande.
- **Segundo usuário (esposa)** → re-ligar email confirmation + UI de conta compartilhada; modelo de dados já `user_id`-scoped.
- **PDF de fatura** → Phase 13 (mesmo milestone).
- **07-07-PLAN.md** (verify visual/UI local) → NÃO é deploy; pode ser reconfirmado oportunamente depois do app no ar; não carrega requisito v1.3.

</deferred>

---

*Phase: 12-produ-o-live-verify*
*Context gathered: 2026-06-18*
