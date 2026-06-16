# Phase 4: Upload + classificação inteligente - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<scope_decision>
## IMPORTANT — AI deferred for v1 (user decision 2026-06-16)

The user chose **"Sem IA por enquanto"**: Phase 4 ships the full ingestion + **memory-first** classification pipeline, but the LLM-suggestion step is DEFERRED. On a memory miss (never-seen merchant), the review row is left UNCLASSIFIED and the user picks the category manually; confirming saves the pattern. A clean, pluggable **suggestion seam** is built so an AI provider (Vercel AI Gateway, cheap model, normalized-descriptor-only input, enum-constrained output) can be slotted in later without reworking the pipeline.

Effect on requirements:
- **IMP-01..05, CLS-01, CLS-03, CLS-04, CLS-05, CLS-06, RSV-06** — fully in scope this phase.
- **CLS-02 (IA sugere categoria)** — PARTIAL: the memory-miss → manual-classify flow + the pluggable suggestion interface ship now; the actual LLM call is deferred to a post-v1 "AI suggestion" follow-up. Mark CLS-02 as Pending/deferred, not Complete.
- **SEC-03 (só descritor normalizado, sem PII, ao LLM; saída validada)** — the descriptor normalization + enum-validation of any suggestion ship now; since there is NO external LLM call in v1, there is trivially no PII egress. SEC-03's no-PII guarantee holds by construction; the enum-validation is wired into the suggestion seam for when AI is added.

Build against synthetic OFX/CSV fixtures (BR, pt-BR, vírgula decimal, DD/MM); the user validates with real bank exports later. LOCAL stack only; remote deploy deferred.
</scope_decision>

<domain>
## Phase Boundary

Entrega a ingestão de faturas e a classificação por memória: o usuário sobe OFX/CSV direto pro Storage, o sistema extrai/normaliza/deduplica as transações, classifica por memória (merchant→categoria/reserva já aprendido) primeiro, mostra uma tela de revisão; ao confirmar/corrigir, aprende o padrão e auto-classifica as próximas. Maior risco, construído por último sobre o core provado (Fases 1-3).

Inclui: upload por signed URL, parse OFX/CSV, dedup idempotente, tabela `merchant_patterns`, `normalizeDescriptor`, tela de revisão, aprendizado no confirm, detecção de recorrentes, categoria point-in-time, aprendizado merchant→reserva. NÃO inclui a chamada LLM (deferida — ver scope_decision), PDF (v2), MEI (Fase 5).

Cobre: IMP-01..05, CLS-01, CLS-03, CLS-04, CLS-05, CLS-06, RSV-06; CLS-02 e SEC-03 parciais (costura + normalização, sem LLM).

</domain>

<decisions>
## Implementation Decisions

### Upload & Parse
- Upload direto browser→Supabase Storage por **signed/resumable upload URL** (contorna o limite de 4.5MB da função); a função recebe só o PATH no Storage
- OFX parseado first-class (`ofx-data-extractor`); CSV via detecção de header + um dialog de mapeamento de colunas (data/descritor/valor) quando ambíguo — um "perfil" reutilizável por layout
- Parse roda no SERVER (route handler / server action lendo do path do Storage); em arquivo grande, trabalho deferido via `after()`
- Transações normalizadas: centavos inteiros (money.ts), data (mês civil SP), descritor cru + normalizado
- Dedup em duas camadas: hash do conteúdo do arquivo (`statements.content_hash` unique → re-upload = "0 novas") + `dedupe_key` por transação (FITID do OFX, ou hash de data+valor+descritor pro CSV) unique → não duplica em faturas sobrepostas

### Classificação (memória, sem IA no v1)
- Tabela `merchant_patterns` (user_id, normalized_descriptor único por user, category_id, reserva_id opcional, last_used/count) — RLS + ownership
- `normalizeDescriptor` compartilhado: lowercase, remove ruído de rede de cartão/cidade/dígitos/datas, colapsa espaços — determinístico e testado
- Classificação na importação: **memória primeiro** (match EXATO no descritor normalizado — fuzzy fica pra depois, evita falso positivo); para extrato de merchants conhecidos as chamadas externas são ZERO
- **Miss (merchant novo):** sem IA — a linha fica não-classificada na revisão e o usuário escolhe; a interface de "suggestion provider" existe como costura plugável (retorna vazio no v1) para receber o LLM depois

### Revisão & Aprendizado
- Tela de revisão: grid das transações importadas (data, descritor, valor, categoria editável + origem da classificação: memória/manual), ANTES de persistir; reusa padrões da extrato-table + SelectionActionBar (reclassificação em massa)
- Aprendizado SÓ no confirm humano: ao confirmar/corrigir uma linha, salva o padrão merchant→categoria; quando a categoria é "Reserva" (flag is_reserva), dispara "qual reserva?" e salva merchant→reserva (RSV-06) + cria o aporte no ledger
- Recorrentes (CLS-06): heurística — mesmo descritor normalizado aparecendo em N meses distintos → marca a transação/merchant como "recorrente" (assinatura), exibido na revisão e no extrato
- Categoria point-in-time (CLS-05): a categoria é gravada na linha da transação; renomear/reclassificar categoria NÃO reescreve o histórico; padrões chaveados por `category_id`, nunca por nome
- **IDOR (lição das Fases 2-3):** todo category_id / reserva_id / statement_id vindo do cliente é validado server-side por dono antes de gravar

### Claude's Discretion
- Forma exata das migrations (statements, merchant_patterns; reusar padrão RLS+grants+índice+security_invoker)
- Bibliotecas de parse exatas (OFX: `ofx-data-extractor`; CSV: `papaparse` — ambas já citadas na pesquisa do projeto)
- Layout da tela de upload e revisão
- Detalhe do dialog de mapeamento de CSV

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/money.ts`, `src/lib/month.ts`; padrão de Server Action Zod + getClaims + **ownership re-derive** (replicar para statement_id/merchant_patterns); RLS+grants+índice; bucket privado `statements` por pasta `{user_id}/` (criado na Fase 1, ainda sem fluxo de upload)
- `src/components/extrato-table.tsx`, `selection-action-bar.tsx`, `category-badge`, `amount-cell`, `money-input`, `reserva-picker` (Fase 3) — a tela de revisão reusa fortemente
- `src/actions/transactions.ts` (`createTransactionWithReserva`, `syncReservaLedgerForTransaction`, `isReservaCategory`) — o aporte de reserva já existe; a importação reusa
- Categorias com flag `is_reserva`; reservas + ledger derivado (Fase 3)

### Established Patterns
- TS estrito, dinheiro bigint centavos, mês civil SP, pt-BR. Migrations versionadas (próxima: 0019+) aplicadas no LOCAL, types regenerados. TDD contra stack local. Lição: validar ownership de FKs client-supplied (IDOR), e test-first pega bugs reais (TOCTOU).

### Integration Points
- Bucket `statements` (já existe, privado, RLS por pasta) — o upload o usa pela primeira vez
- A importação cria `transactions` (Fase 2) e, em aportes, `reserva_ledger` (Fase 3); aderência (Fase 3) reflete automaticamente
- Costura de "suggestion provider" preparada para a IA futura

</code_context>

<specifics>
## Specific Ideas

- Construir com **fixtures sintéticas** realistas (OFX + CSV BR); o usuário valida com exports reais depois
- A costura de IA deve ser limpa: uma função `suggestCategory(normalizedDescriptor, categories) -> categoryId | null` que hoje retorna null (memória/manual) e amanhã chama o LLM (AI Gateway, enum-constrained, sem PID/valor)
- "0 novas" no re-upload é critério de aceite explícito (dedup idempotente)

</specifics>

<deferred>
## Deferred Ideas

- Chamada LLM real para sugestão em merchant novo (CLS-02 completo) + provider/key + A/B de modelo → pós-v1 (costura pronta)
- PDF de fatura (IMP-06) → v2 (spike sobre amostras reais)
- Fuzzy matching de descritor → depois (v1 = match exato normalizado)
- MEI → Fase 5; LGPD export/delete + hardening → Fase 6

</deferred>
