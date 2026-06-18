# Phase 13: PDF de Fatura - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Adiciona **upload de fatura em PDF** ao pipeline de ingestão que já existe (Fase 4),
sem reescrevê-lo. Fluxo: usuário sobe um PDF pela mesma UI de upload (junto de
CSV/OFX) → arquivo persiste no Storage privado `{user_id}/` → parse server-side
extrai as linhas de transação (`pdf-parse` v2 `getTable()` primário, `unpdf`
fallback de texto) e normaliza pro contrato canônico (`RawTransaction`: data civil
SP, centavos inteiros, descritor cru+normalizado) → review grid editável **antes**
de persistir, **sem auto-commit de linha** → ao confirmar, as transações entram no
**mesmo pipeline memória + metas** (idêntico a CSV/OFX). Best-effort com confirmação
humana obrigatória.

**Spike-first (obrigatório antes de comprometer o build):** validar `getTable()` /
`unpdf` contra as amostras Santander REAIS em `fixtures/faturas-pdf/santander/`
(duas faturas reais já presentes, gitignored). Santander é o banco mais usado → alvo
primário.

**Cobre:** PDF-01..05.

**NÃO inclui:** OCR de PDF image-only (fora de escopo — mensagem clara orientando
CSV/OFX); chamada LLM de classificação (IA deferida desde a Fase 4 — pipeline é
memory-only); adicionar linha manual no grid (lançamento manual já existe em
`/lançamentos`); novos bancos além do Santander (contrato fica genérico, mas a
calibragem do v1.3 é só Santander).
</domain>

<decisions>
## Implementation Decisions

### Régua de qualidade (best-effort) — Claude's Discretion + direção
- **D-01:** O critério numérico exato de "extração boa o suficiente" fica a cargo do
  researcher/planner APÓS o spike Santander — não cravar um threshold arbitrário agora.
  **Direção do usuário:** o único bloqueio rígido é **PDF image-only / zero texto
  extraível** (PDF-04) → mensagem clara orientando CSV/OFX, nunca resultado vazio
  silencioso. Para o resto, **o review grid é a rede de segurança**: extrai o que der,
  mostra contadores honestos (N extraídas, J descartadas — reusar `ParseResult.dropped`),
  e o usuário corrige/deleta. Não recusar o arquivo por cobertura parcial.

### Edições no review grid do PDF
- **D-02:** Estender o grid de revisão para **editar categoria (como hoje) + DELETAR
  linha**. Deletar é necessário para o usuário limpar linhas espúrias que a extração de
  PDF inevitavelmente captura (saldo anterior, total da fatura, cabeçalhos, rodapés).
- **D-03:** **NÃO** adicionar "adicionar linha manual" ao grid. Se a extração perdeu
  muita coisa, é sinal de usar CSV/OFX daquele banco; lançamento manual já existe em
  `/lançamentos`. Mantém o grid best-effort enxuto, não vira mini-editor de lançamento.

### Quais linhas da fatura viram transação
- **D-04:** Importar **compras + estornos/créditos** (ambos afetam gasto real e a
  aderência às metas). **Filtrar na extração:** pagamento-da-fatura, juros/encargos/IOF,
  e linhas de saldo/total — não são gasto de categoria.
- **D-05:** **Parcela** entra como **o valor lançado NESTA fatura** (uma linha — é o que
  de fato impactou o mês); não expandir o cronograma de parcelas futuras.
- **D-06:** **Moeda estrangeira:** importar o valor em **BRL já convertido** que aparece
  na fatura (não a moeda original).
- Heurística de filtro fina = discretion do researcher após ver os blocos reais do PDF.

### Escopo do extrator
- **D-07:** **Santander-first atrás de um contrato genérico.** A heurística de extração é
  calibrada no layout Santander (o banco que importa), mas plugada atrás do mesmo
  contrato `ParseResult`/`RawTransaction` que OFX/CSV já usam — um 2º emissor depois é
  **additivo**, sem re-arquitetar. NÃO tentar genérico-pra-todos no v1.3 (contra o
  "spike-first num banco" do ROADMAP).

### Tensão a resolver no research (NÃO decidida pelo usuário — é arquitetura)
- **D-08:** O parse de OFX/CSV hoje roda **síncrono dentro do server action**
  `ingestStatement` (`src/actions/import.ts`). PROJECT.md/CLAUDE.md travam o parse de
  **PDF em Route Handler runtime Node + `export const maxDuration`** (parsing de PDF pode
  levar segundos). O comentário em `import.ts` já antecipa isso ("structured to later move
  behind a Route Handler + `after()` if files grow"). **O researcher resolve contra o
  spike:** se o parse síncrono do PDF estourar o tempo/limite do server action → mover o
  parse de PDF (ou todo o ingest) pra um Route Handler Node com `maxDuration`. Honrar a
  guidance travada do PROJECT.md.

### Claude's Discretion
- Critério numérico de aceite do spike (ver D-01).
- Heurística exata de quais blocos/linhas do PDF Santander virar transação (D-04..D-06).
- Como detectar débito vs. crédito (estorno) numa linha de PDF (sinal/marcador no layout).
- Forma exata de estender o dispatch de extensão (hoje `z.enum(['ofx','csv'])` em
  `extSchema` + detecção `endsWith('.csv')?'csv':'ofx'`) para incluir `pdf` (3 vias).
- `dedupe_key` do PDF: sem FITID → hash de `data+valor+descritor` (igual ao CSV).
- Server action vs. Route Handler (ver D-08).
- Layout visual da affordance de deletar-linha no grid; como exibir contadores
  extraídas/descartadas; como rotular linha de moeda estrangeira.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack / guidance travada (PDF)
- `CLAUDE.md` — "Deep Dives §1 Statement parsing on Vercel serverless" + "What NOT to
  Use": `pdf-parse` v2 (`getTable()`) primário, `unpdf` fallback edge-safe; NÃO usar
  `pdf-parse` v1 nem `pdfjs-dist` legacy raw; Route Handler runtime **Node** (não Edge) +
  `maxDuration`; parse do **buffer baixado do Storage**; PDF é best-effort → review grid →
  usuário confirma → persiste (NUNCA auto-commit de linha PDF); verificar que o dist npm
  do `pdf-parse` casa com o repo mehmet-kozan no install.
- `.planning/PROJECT.md` — mesma guidance de parsing serverless + constraints
  (TS estrito, RLS por `user_id`, centavos inteiros).

### Pipeline analog (a estender, não reescrever)
- `src/lib/parsers/types.ts` — **contrato canônico**: `RawTransaction`, `ParseResult`
  (`rows`/`dropped`/`capped`), `ParsedReviewRow`, `MAX_PARSED_ROWS=10_000` (cap WR-02).
  O extrator de PDF emite esse mesmo `ParseResult`.
- `src/actions/import.ts` — `ingestStatement` (download→parse→normalize→dedup→
  memory-classify), `createUploadUrl`, `extSchema` (`z.enum(['ofx','csv'])` — adicionar
  `pdf`), dedup `content_hash` + `dedupe_key`, comentário sobre mover pra Route Handler.
- `src/lib/parsers/ofx.ts`, `src/lib/parsers/csv.ts` — parsers existentes (o de PDF é o
  3º, mesmo shape de saída).
- `src/lib/schemas/import.ts` — schemas Zod do upload/ingest.
- `src/components/import-review-table.tsx` — review grid a estender (editar categoria +
  **deletar linha**); `import-uploader.tsx`, `upload-dropzone.tsx` (aceitar `.pdf`),
  `import-summary-header.tsx`, `import-review-confirm-toast`.
- `src/lib/classifier/memory.ts`, `src/lib/classifier/suggest.ts` — classificação
  memory-first; `suggestCategory()` é o seam que retorna null no v1 (IA deferida) — o PDF
  usa exatamente esse caminho.
- `.planning/phases/04-upload-classifica-o-inteligente/04-CONTEXT.md` — decisões do
  pipeline de ingestão (memory-first, dedup 2 camadas, aprendizado no confirm, IDOR/
  ownership re-derive, IA deferida). O PDF herda tudo isso.

### Spike samples
- `fixtures/faturas-pdf/santander/` — duas faturas Santander REAIS (`*.pdf`, gitignored —
  dado financeiro pessoal, NUNCA comitar) + `README.md`. Alvo do spike `getTable()`/`unpdf`.

### Requisitos
- `.planning/REQUIREMENTS.md` — PDF-01..05 (linhas 24-28).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Contrato `RawTransaction`/`ParseResult`/`ParsedReviewRow`** (`src/lib/parsers/types.ts`):
  o extrator de PDF emite `ParseResult` exatamente como OFX/CSV → review/dedup/classify
  funcionam de graça. `ParseResult.dropped` já serve pros contadores honestos da régua.
- **`ingestStatement` + dedup** (`src/actions/import.ts`): `content_hash` (re-upload =
  "0 novas") + `dedupe_key` per-tx (PDF usa hash data+valor+descritor, sem FITID, igual CSV).
- **Memory classifier + seam** (`src/lib/classifier/memory.ts`, `suggest.ts`): pipeline
  memory-first; `suggestCategory()` retorna null (IA deferida). PDF entra sem mudança aqui.
- **Review grid + bucket** (`import-review-table.tsx`; bucket privado `statements`
  `{user_id}/uuid.ext` com Storage RLS): grid estendido com deletar-linha; bucket reusado.
- `src/lib/money.ts` (centavos/`parseBRLToCents`), `src/lib/month.ts` (mês civil SP),
  padrão Server Action Zod + getClaims + ownership re-derive (IDOR).

### Established Patterns
- TS estrito, dinheiro bigint centavos, mês civil SP (`America/Sao_Paulo`), pt-BR,
  migrations versionadas, TDD contra stack local (a verificação real do PDF é contra os
  PDFs Santander reais, não fixtures sintéticas).
- Parsers puros (Supabase-free) que retornam `ParseResult`; row malformada é SKIPPED
  (conta em `dropped`), nunca lança — o PDF segue isso.
- `MAX_PARSED_ROWS=10_000` (WR-02): o extrator de PDF para no cap; ingest rejeita
  resultado `capped` com mensagem amigável.

### Integration Points
- `extSchema` em `import.ts` (`z.enum(['ofx','csv'])`) + detecção de extensão →
  adicionar a 3ª via `pdf`.
- Path do bucket `{user_id}/uuid.pdf`; parse lê o buffer baixado do Storage.
- **Decisão de runtime (D-08):** parse de PDF pode precisar sair do server action síncrono
  pra um Route Handler Node + `maxDuration` (PROJECT.md). Hoje não há `route.ts` em
  `src/app` — seria o 1º. Resolver no research.
- Confirm → cria `transactions` (Fase 2), aderência (Fase 3) reflete automaticamente —
  idêntico a CSV/OFX.

</code_context>

<specifics>
## Specific Ideas

- **Spike contra dado REAL, não sintético:** as duas faturas Santander em
  `fixtures/faturas-pdf/santander/` são a fonte de verdade do que `getTable()` consegue
  extrair. O spike decide a régua de qualidade (D-01) e a heurística de filtro (D-04..D-06).
- **Contadores honestos como UX da régua:** "N transações extraídas, J linhas descartadas"
  visível no review, em vez de um gate silencioso.
- **Deletar-linha é o mecanismo central de limpeza** do ruído inerente a PDF (D-02).
- IA continua deferida — não reabrir; o PDF prova o core value via memória, igual ao resto.

</specifics>

<deferred>
## Deferred Ideas

- **Adicionar linha manual no review grid** — fora de escopo (D-03); usar `/lançamentos`
  ou CSV/OFX se a extração perder muita coisa.
- **OCR de PDF image-only/escaneado** — fora de escopo do v1 (PDF-04 só mostra mensagem
  orientando CSV/OFX); candidato a fase futura se virar necessidade real.
- **2º+ emissor de PDF (outros bancos)** — o contrato fica genérico (D-07), mas a
  calibragem de outro layout é additiva, fase/quick-task futura.
- **Chamada LLM real (`suggestCategory()` → Gemini via AI Gateway)** — CLS-AI, deferido
  desde a Fase 4; o seam está pronto.
- **Fuzzy matching de descritor** — v1 segue match exato normalizado.

None além dessas — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 13-pdf-de-fatura*
*Context gathered: 2026-06-18*
