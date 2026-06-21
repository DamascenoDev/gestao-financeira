# Phase 24: Ingestão robusta (PDF em PROD + re-import) - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Endurece a ingestão de faturas em três frentes (PDF-06, PDF-07, IMP-07). Duas já estão **completas em código** e só precisam de verificação/deploy; a terceira é o único build real:

- **PDF-06 (worker em PROD):** o fix já está commitado (`next.config.ts` `outputFileTracingIncludes` força `pdf.worker.mjs` + cmaps/fonts no trace das rotas `/importar` e `/importar/[statementId]`; `serverExternalPackages: ["pdf-parse"]`). SC1 "funciona em PROD" é item de **deploy + verificação ao vivo** (humano), não rebuild.
- **PDF-07 (degradação clara, sem OCR):** já implementado — PDF image-only dá hard-block com mensagem que orienta CSV/OFX (`import.ts` ~358-363); texto-presente-com-0-linhas degrada para review vazio sem throw; linha malformada é pulada, nunca explode; sem OCR. Acrescentar **um teste genérico** (não-Santander) que trava a "robustez genérica" do SC2.
- **IMP-07 (re-import):** o único build de código — migration que adiciona `'imported'` ao CHECK de `statements.status`, para o `update({status:'imported'})` do `confirmImport` parar de falhar silenciosamente e a fast-path "já confirmado → bloqueia re-review" (`import.ts` ~323) virar alcançável.

**Fora do escopo:** OCR; parser per-bank novo (só quando aparecer banco real falhando); mudar o pipeline de classificação; re-arquitetar o bundling do worker.
</domain>

<decisions>
## Implementation Decisions

### Escopo: build vs verify
- **PDF-06 = code-complete** (`next.config.ts`, commit `fb91b58`). NÃO rebuildar. SC1 vira um item de **deploy + human-verify** (subir o PDF de verdade em PROD após deploy).
- **PDF-07 = code-complete** (hard-block image-only + degradação graciosa + sem OCR, já testado em `import.test.ts` 495-529). Acrescentar **1 teste de degradação genérica** (entrada não-Santander / ruído) para travar o SC2 "robustez genérica", sem construir parser novo.
- **IMP-07 = o build:** migration que larga `'imported'` no CHECK de `statements.status`.

### A migration do IMP-07
- **Espelhar `0032_statements_format_pdf.sql`:** novo arquivo `0038_statements_status_imported.sql` → `drop constraint if exists statements_status_check` (e qualquer nome prévio) → recriar `check (status in ('uploaded','parsing','parsed','failed','imported'))`. Mantém `text` + CHECK (não converte para enum Postgres).
- **Sem `gen:types`:** `status` é `text + CHECK`, então o tipo TS gerado permanece `string` (idêntico ao que `0032` fez para `format`). Verificar que o diff de `database.types.ts` é vazio.
- **Sem backfill:** statements existentes ficam como estão; só confirmações futuras gravam `'imported'`.
- **PROD push é human-gated:** `supabase db push` precisa de auth interativa / `SUPABASE_ACCESS_TOKEN` (igual ao `0037`, que segue pendente de push em PROD). Escrever + replay-validar local; o push em PROD é uma task `autonomous:false`, **diferida e documentada** (não bloqueia o fechamento da fase em código).

### Verificação & testes
- **IMP-07:** os testes de action mockados já asseguram o contrato (`import.test.ts` 410-432: confirmado → `alreadyImported`; não-confirmado → re-parse). Mantê-los verdes; o replay da migration é a prova do lado-DB. **Pular** um teste de integração live-Supabase novo (env-flaky no histórico do projeto).
- **PDF em PROD (SC1):** item de **human-verify** (UAT diferido, igual à Phase 22) — rodar um upload de PDF ao vivo depois do deploy.
- **Validação local da migration:** replay-validar (`supabase db reset`/diff se o stack local estiver de pé; senão dry-parse do SQL). Não exigir PROD rodando.

### Claude's Discretion
- Nome exato do constraint a dropar (provável `statements_status_check`; usar `drop ... if exists` defensivo para nomes alternativos, como o `0032` fez).
- Forma exata do teste de degradação genérica do PDF-07 (estender `pdf.test.ts`/`import.test.ts` com um texto não-Santander que degrada a 0 linhas sem throw).
- Como replay-validar a migration dado o ambiente (local stack vs dry-parse) — seguir o que estiver disponível.
- Texto/observabilidade: manter o log do `confirmImport` (line ~1001) como rede de segurança; após a migration o update passa a suceder.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `next.config.ts` — `PDFJS_RUNTIME_ASSETS` + `outputFileTracingIncludes` (PDF-06, já commitado `fb91b58`) + `serverExternalPackages: ["pdf-parse"]`.
- `supabase/migrations/0032_statements_format_pdf.sql` — **template exato** do drop+recreate de CHECK em `statements` (format). O `0038` espelha isso para `status`.
- `supabase/migrations/0019_statements.sql` — define `status ... check (status in ('uploaded','parsing','parsed','failed'))` (linha 20-21, o alvo do widening) + `unique(user_id, content_hash)` (idempotência).
- `src/actions/import.ts` — `ingestStatement` (~244-596): upsert idempotente + a fast-path `if (existing.status === 'imported')` (~319-333, hoje inalcançável) + branch PDF image-only (~353-375). `confirmImport` (~677-1010): `update({status:'imported'})` (~995-998) que hoje falha o CHECK e é logado-e-engolido (~1001).
- `src/lib/parsers/pdf.ts` — `extractPdfText` (image-only → `''`, sem throw) + `parseSantanderText` (puro, pula linha malformada, `dropped`). `src/lib/dedupe.ts` — `contentHash` (sha256).
- Testes: `src/actions/import.test.ts` (410-432 dedupe por status; 495-529 PDF image-only/0-linhas), `src/lib/parsers/pdf.test.ts` (degradação pura), fixtures em `tests/fixtures/`.

### Established Patterns
- Migration de CHECK = drop-if-exists + recreate, `text` + CHECK (não enum), defensivo a nomes de constraint (`0032`, `0037`).
- Dinheiro em cents; RLS user-scoped; PDF best-effort (review humano, sem auto-commit; sem OCR).
- Push de migration em PROD é etapa humana separada (token interativo) — escrever+replay local, deferir o push.

### Integration Points
- ÚNICO arquivo de produção novo: `supabase/migrations/0038_statements_status_imported.sql`. Teste novo: estender `pdf.test.ts`/`import.test.ts` (degradação genérica). NENHUMA mudança em `import.ts`/`next.config.ts`/`database.types.ts` (o código já está pronto; a migration destrava a fast-path existente).
</code_context>

<specifics>
## Specific Ideas

- `0038_statements_status_imported.sql`: `alter table public.statements drop constraint if exists statements_status_check; alter table public.statements add constraint statements_status_check check (status in ('uploaded','parsing','parsed','failed','imported'));`
- Não rodar gen:types (verificar diff vazio em `database.types.ts`).
- 1 teste de degradação genérica PDF-07 (texto não-Santander → 0 linhas, sem throw).
- PROD `supabase db push` do `0038` = task `autonomous:false`, diferida (junto do `0037` pendente).
- PDF live em PROD (SC1) = UAT human-verify diferido.
</specifics>

<deferred>
## Deferred Ideas

- OCR para PDF image-only — fora do escopo do v1 (steer para CSV/OFX).
- Parser per-bank novo — só quando aparecer um banco real falhando.
- Teste de integração live-Supabase para o dedupe por status — env-flaky; mock tests + replay cobrem.
- PROD `supabase db push` de `0037` + `0038` + `npm run gen:types` — etapa humana (token), diferida.
</deferred>
