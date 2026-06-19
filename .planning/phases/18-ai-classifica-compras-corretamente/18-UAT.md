---
status: testing
phase: 18-ai-classifica-compras-corretamente
source: [18-VERIFICATION.md]
started: 2026-06-19T15:25:00Z
updated: 2026-06-19T15:25:00Z
---

## Current Test

number: 1
name: Aplicar migration 0035 (Marketplace) em PROD
expected: |
  Após `supabase db push` (rodado pelo dono, se 0035 ainda não estiver em Remote),
  `supabase migration list` mostra 0035 na coluna Remote.
awaiting: user response

## Tests

### 1. Aplicar migration 0035 (Marketplace) em PROD
expected: |
  `supabase db push` (ou `npm run db:push`) rodado pelo dono a partir do ambiente
  linkado ao PROD, caso 0035 esteja ausente de Remote. Depois, 0035 aparece na coluna
  Remote de `supabase migration list`. (A verificação read-only falhou aqui:
  "Invalid access token format" — sem SUPABASE_ACCESS_TOKEN no ambiente.)
result: [pending]

### 2. Re-signup em PROD + confirmar "Marketplace" em /categorias
expected: |
  PROD foi wiped 2026-06-19 → re-signup + re-entrada da chave BYOK. Em /categorias, a
  categoria default "Marketplace" (consumo) aparece na lista (criada pelo handle_new_user
  re-seeded da 0035, ou pelo backfill idempotente).
result: [pending]

### 3. Descritor de marketplace nunca visto → sugestão de consumo (nunca alocação)
expected: |
  Upload de um OFX com um descritor de marketplace nunca visto (ex.: AliExpress, Mercado
  Livre, Shopee). Na grid de revisão, a sugestão da IA cai em "Marketplace" (ou outra
  categoria de consumo) — NUNCA em Investimentos/Reserva. (O kind gate do 18-01 já garante
  que alocação jamais é sugerida para um gasto, mesmo em caso de erro do modelo.)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
