# Phase 15: Classification Wire - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Liga a IA real no pipeline de import: para descritor novo (cache-miss da memória), o sistema chama o provedor de IA configurado (Phase 14) e anexa uma **sugestão** de categoria à linha da review grid — memory-first (zero IA p/ merchant conhecido), **uma** chamada batched/deduplicada por upload, restrita ao enum vivo de categorias do usuário, degradando graciosamente para o pick manual em qualquer falha. A IA **nunca** auto-commita; o upload **nunca** falha por causa dela. Cobre CLSAI-01..06.

NÃO faz parte desta fase: as afordâncias visuais da review grid (badge de procedência, dica de confiança, ordenação) — isso é Phase 16; esta fase só PRODUZ `row.suggestion` (com confidence) e o anexa ao payload. DeepSeek continua fora (Future). A Settings UI / armazenamento de chave já é Phase 14.
</domain>

<decisions>
## Implementation Decisions

### Arquitetura da chamada batched
- Novo `src/lib/ai/classify.ts` com `classifyDescriptors(descriptors: string[], categories: {id,name}[], aiSettings)` → **UMA** chamada `generateObject` sobre os descritores de **miss únicos** → retorna `Map<descriptorNorm, { categoryId: string | null, confidence: number }>`.
- O seam `suggestCategory()` (`src/lib/classifier/suggest.ts`) permanece como wrapper PII-safe de 1-item que delega ao `classify` (preserva o contrato + `suggest.test.ts`); o hot path do `import.ts` usa o **batch** diretamente.
- Schema de saída **flat** (Claude-safe, sem `$ref`/`name`): `{ results: [{ descriptor: string, categoryId: string | null, confidence: number }] }`. O `categoryId` é validado por `validateSuggestion` contra os ids possuídos pelo usuário → `null` se a IA inventar um id não-possuído.
- Wire no `src/actions/import.ts`: depois de computar hits/misses de memória, coletar os `descriptor_norm` de **miss únicos** → 1 call → anexar `row.suggestion` por linha. **NÃO** seta `row.category_id` (sem auto-aplicar).

### Memory-first + batch + enum
- IA roda **só** para `descriptor_norm` que deu MISS em `lookupMemory`, **deduplicado**. **Zero** chamada se não houver miss (memory-first verificável — custo ∝ unique-unseen, não ∝ total de linhas).
- O enum de categorias é construído do `categoryList` já buscado em `import.ts` (~:392) **no momento da chamada** (fresh — rename/edição de categoria entre uploads não produz categoria stale/inventada).
- "Nenhuma encaixa" → `categoryId: null` → `row.suggestion` vazio (slot fica vazio, sem chute).
- `row.suggestion` shape: `{ categoryId, confidence, source: 'ia' }`, anexado ao `ParsedReviewRow` (campo novo opcional, persistido no jsonb `parsed_rows`). Phase 16 exibe; o usuário aplica na grid. `confidence` (0-1) é produzido AGORA, consumido na Phase 16.

### Segurança / fallback / PII / testes
- Provedor + chave vêm de `getDecryptedAiSettings()` (server-only, Phase 14). Se retornar `null` (sem chave) OU qualquer erro (401/chave inválida, 429/quota, 5xx, `NoObjectGeneratedError`, JSON malformado) → `try/catch` **interno** → suggestions vazias, **upload prossegue normalmente**, nota não-bloqueante no summary/toast. O upload e a review grid continuam plenamente usáveis.
- PII: envia **SÓ** `descriptor_norm` (nunca valor/data/raw/`descriptor` cru). O prompt lista as categorias como `id: nome` + a lista de descritores normalizados. (SEC-03 — o contrato do seam.)
- `tests/pii-guard.test.ts`: **atualizar** as asserções (b)/(c) — de "suggestCategory retorna null / classificador não faz fetch" para o novo invariante: a chamada de IA carrega **apenas** descriptor_norm, nunca valor/raw/PII. Manter um guard que verifica que o payload enviado não contém amount/raw/data. Os providers permitidos continuam Gemini+Claude (sem DeepSeek).
- `merchant_patterns` continua sendo escrito **SÓ** no `confirmImport` em confirmação humana — o loop confirm/learn do v1.3 permanece intacto (NENHUM auto-commit). `suggestCategory`/`classify` nunca escrevem.
- Confirmar `maxDuration ≥ 60` na rota/segmento de import (parse + 1 chamada de IA batched).

### Claude's Discretion
- Nomes exatos de funções/colunas, o formato exato do prompt, o tipo do campo `suggestion` em `ParsedReviewRow`, e como mapear o `Map` de volta às linhas ficam a critério, seguindo as convenções existentes.
- Modelos: usar `DEFAULT_MODEL` por provedor do Phase 14 (`gemini-2.5-flash-lite` / `claude-haiku-4-5`); re-verificar os model-ids no build (research flag).
- Decisão de usar `generateObject` (AI SDK) vs `doGenerate` direto fica a critério — o Phase 14 evitou o umbrella `ai` e usou `LanguageModelV3.doGenerate`; replicar/avaliar conforme o que dá structured-output limpo p/ Gemini+Claude.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/actions/import.ts` — o Server Action `ingestStatement` (`'use server'`, Node runtime). Já pré-busca `categoryList` (id,name) em ~:392 e faz `lookupMemory` por-linha; o miss já chama `await suggestCategory(raw.descriptor_norm, categoryList)` (hoje null). É AQUI que o batch se conecta.
- `src/lib/classifier/memory.ts` — `lookupMemory(supabase, descriptorNorm) → MemoryHit | null`. Define quem é hit vs miss.
- `src/lib/classifier/suggest.ts` — `suggestCategory(descriptorNorm, categories) → string | null` (seam) + `validateSuggestion(candidate, categories) → string | null` (enum wrapper, SEC-03 — o gate de saída).
- `src/lib/ai/settings.server.ts` — `getDecryptedAiSettings() → { provider, model, apiKey } | null` (server-only decrypt via RPC `get_ai_api_key`). A fonte de provedor+chave.
- `src/lib/ai/provider-factory.ts` — `modelFor(provider, model, apiKey) → LanguageModelV3` (Gemini+Claude). `src/lib/ai/map-provider-error.ts` — mapeia erro→pt-BR.
- `src/lib/ai/settings.ts` — `DEFAULT_MODEL` / `PROVIDER_LABEL` / `AI_PROVIDERS` (client-safe).

### Established Patterns
- Money em centavos; tipos de `src/types/database.types.ts` (LOCAL tem `ai_settings` + RPCs após 0033). `tsc --noEmit` + `npm test` (vitest, 797 testes) como gates.
- `ParsedReviewRow` é persistido como jsonb em `statements.parsed_rows` (additive); a review RSC lê de volta sem re-parse.
- Fallback gracioso e "nunca auto-commit" são padrões do v1.3 (PDF best-effort → review humano). `confirmImport` é o ÚNICO write de `merchant_patterns`.

### Integration Points
- Modificar `src/actions/import.ts` (coletar miss únicos → batch classify → anexar `row.suggestion`; nota no summary quando IA indisponível).
- Novo `src/lib/ai/classify.ts` (+ test) — a chamada batched + schema flat + `validateSuggestion` por item + try/catch→{}.
- Editar `src/lib/classifier/suggest.ts` — `suggestCategory` delega ao classify (1-item) mantendo o contrato PII-safe.
- Estender `ParsedReviewRow` com `suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }`.
- Atualizar `tests/pii-guard.test.ts` (asserções b/c → descriptorNorm-only).
- Confirmar `maxDuration` no segmento de import.
</code_context>

<specifics>
## Specific Ideas

- Invariantes não-negociáveis: (1) memory-first — ZERO chamada de IA quando todos os descritores são conhecidos; (2) UMA chamada por upload sobre miss únicos deduplicados; (3) saída restrita ao enum vivo via `validateSuggestion`; (4) NENHUM auto-commit — `row.suggestion` é só hint, `category_id` não é setado; (5) degradação graciosa — upload nunca falha por IA; (6) só `descriptor_norm` sai (sem PII).
- Verificações esperadas: teste que prova 0 chamadas quando tudo é hit; teste que prova 1 chamada com N descritores únicos quando há M linhas (M>N por duplicatas); teste de fallback (sem chave / erro → suggestions vazias, upload ok); teste de enum-drift (id inventado → null); pii-guard atualizado (payload só descriptor_norm).
- Re-verificar model-ids (`gemini-2.5-flash-lite` / `claude-haiku-4-5`) no build — uma chamada real de test-connection (Phase 14) ou o primeiro classify valida de graça.
</specifics>

<deferred>
## Deferred Ideas

- Afordâncias da review grid (badge procedência memória vs IA, dica de confiança, ordenação baixa-confiança-primeiro) — Phase 16 (CLSAI-07/08). Esta fase só produz `row.suggestion` + `confidence`.
- DeepSeek como 3º provedor — Future (CLSAI-F1).
- A/B de provedores / auto-fallback — Future (CLSAI-F3).
- PROD push da 0033 (Phase 14) — item humano deferido; o build/test da Phase 15 roda no LOCAL (que já tem ai_settings + RPCs).
</deferred>
