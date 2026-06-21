# Phase 14: Key Storage + BYOK Settings - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Entrega a raiz da cadeia de dependência do v1.4: o usuário configura seu provedor de IA (Gemini ou Claude) e cola a própria chave API numa tela de Settings; a chave é criptografada at-rest no Supabase Vault, escopada por `user_id` + RLS, **nunca volta ao client**, pode ser testada (ping barato) e removida/trocada. Cobre BYOK-01..05.

NÃO faz parte desta fase (deferido p/ fases seguintes): a chamada de IA de classificação real no seam `suggestCategory()` (Phase 15), o badge de procedência / afordâncias da review grid (Phase 16), DeepSeek como 3º provedor (Future — gap `json_object` + churn do model-id). Esta fase só entrega o substrato seguro de chave + a superfície de Settings + o test-connection.
</domain>

<decisions>
## Implementation Decisions

### Rota, Navegação & UX da página
- Rota: novo subroute `/conta/configuracoes-ia` (o segmento `conta` já existe em `src/app/(app)/conta`; espelha o padrão `mei/configuracoes`).
- Navegação: link/card "Configurações de IA" dentro de `/conta` — **sem** novo item de sidebar (setup raro, não merece slot permanente de nav).
- Layout: RSC lê a linha `ai_settings` (RLS-scoped, pode ser null no first-run) → seed de um client `AiSettingsForm` (provider Select + input de chave + botão "testar conexão" + status), **1 card**, espelhando `MeiSettingsForm` (`src/components/mei-settings-form.tsx` + `src/app/(app)/mei/configuracoes/page.tsx`).
- First-run (sem chave): Gemini pré-selecionado, input de chave vazio com placeholder, badge "Nenhuma chave configurada" → após salvar vira "Chave configurada ✓" (a chave NUNCA é ecoada de volta — form write-only).

### Modelo de dados & ciclo de vida da chave
- Tabela `ai_settings`: `user_id` PK/FK → `auth.users`, `provider` text CHECK in ('gemini','claude'), `model` text, `key_secret_id` uuid (referência ao secret do Vault), `created_at`/`updated_at`. RLS habilitado com as **4 políticas** (select/insert/update/delete) `using (auth.uid() = user_id)` + `with check (auth.uid() = user_id)`.
- Cardinalidade: **1 linha por usuário = 1 provedor ativo**. Trocar de provedor = UPDATE na mesma linha; a chave do provedor anterior é rotacionada (secret antigo do Vault apagado) ao gravar a nova.
- Cripto: chave no **Supabase Vault** (`vault.create_secret`); a tabela guarda só o `key_secret_id`. Decrypt acontece **server-only** via RPC `SECURITY DEFINER` `get_ai_api_key()` filtrado por `auth.uid()` (a view `vault.decrypted_secrets` é service-role-only — o RPC é a ponte RLS-safe). O client recebe SÓ `has_key` (boolean derivado) + `provider` — nunca o `key_secret_id` nem a chave.
- Model: default barato hard-coded por provedor (`gemini-2.5-flash-lite` / `claude-haiku-4-5`) gravado na coluna `model`; **sem picker de model na UI** (CLSAI-F2 deferida ao Future).

### Testar conexão & wiring de provedor
- O "testar conexão" faz um `generateText` mínimo (~1 token, ex. prompt "ping") com a chave+provedor configurados; sucesso → ok; erro → mensagem amigável mapeada (chave inválida / sem créditos / rede). Catch total → nunca vaza stack/segredo.
- Salvar **não** exige teste verde: salvar persiste a chave; testar é afordância separada/opcional (decoplado). O usuário pode salvar e depois testar.
- Pacotes/factory NESTA fase: instalar `@ai-sdk/google` + `@ai-sdk/anthropic` agora (o test-connection precisa validar os 2 provedores) + criar um `lib/ai/provider-factory.ts` MÍNIMO (`modelFor(provider, model, apiKey)`) que já será reusado/expandido na Phase 15. `@ai-sdk/deepseek` NÃO entra (Future).
- Onde roda o teste: Server Action `testConnection` (Node runtime), lê a chave decifrada server-only via o RPC, nunca a expõe ao client; retorna `{ ok: true } | { error }`. A action `saveAiSettings` segue o mesmo grammar (`'use server'` + Zod safeParse boundary + getClaims owner + revalidatePath).

### Claude's Discretion
- Nomes exatos de colunas/constraints, estrutura interna do `AiSettingsForm`, textos de erro/UI, e a forma exata do RPC de rotação do secret ficam a critério, seguindo as convenções existentes (actions `{ok}|{error}`, schemas em `lib/schemas/`, migration comentada + idempotente).
- Decisão de usar `react-hook-form` + Zod resolver (como os outros forms) vs form simples fica a critério, espelhando `MeiSettingsForm`.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/(app)/mei/configuracoes/page.tsx` + `src/components/mei-settings-form.tsx` — o analog exato do par RSC-settings + client-form a clonar.
- `src/actions/mei.ts` — grammar de Server Action: `'use server'`, Zod `safeParse` na borda → `{ error } | { ok: true }` (nunca lança/vaza), `getClaims()` p/ owner, `revalidatePath`, ownership re-derive antes de write. `idSchema = z.string().uuid()`.
- `src/lib/supabase/{server,admin,client,middleware}.ts` — `createClient()` (server, cookie RLS) e `admin.ts` (service-role, `import 'server-only'`) — o decrypt server-only deve espelhar a disciplina `server-only` do admin.
- `src/lib/schemas/*.ts` — schemas Zod co-localizados (ex. `mei.ts`, `category.ts`); criar `ai-settings.ts` aqui.
- `src/lib/classifier/suggest.ts` — o seam `suggestCategory(descriptorNorm, categories)` (retorna null) + `validateSuggestion` (enum wrapper). NÃO tocado nesta fase (é a Phase 15); confirma o contrato "modelo recebe SÓ descriptorNorm, sem PII".
- `@/lib/ownership` (`assertOwned*`, `moneyWriteError`) — padrão de IDOR/erro.

### Established Patterns
- Migrations em `supabase/migrations/NNNN_*.sql` — fortemente comentadas (WHY), constraints nomeadas, RLS + 4 políticas, idempotentes (drop-if-exists), com bloco "ACTION REQUIRED AFTER MERGE: supabase db push (LOCAL + PROD) + npm run gen:types". Head atual = `0032` → próxima = **`0033_ai_settings.sql`**.
- Dinheiro/typed client: `database.types.ts` regenerado por `npm run gen:types` após cada migration (pre-commit hook reescreve). **O usuário roda `supabase db push` manualmente** (LOCAL e PROD) — o dev server aponta p/ PROD (cuidado).
- Forms client em `src/components/*-form.tsx`; páginas RSC em `src/app/(app)/<seg>/...`.

### Integration Points
- Novo route `src/app/(app)/conta/configuracoes-ia/page.tsx` (RSC) + entrada/card em `src/app/(app)/conta/page.tsx`.
- Novo `src/components/ai-settings-form.tsx`.
- Novo `src/actions/ai-settings.ts` (`saveAiSettings`, `testConnection`, `removeAiKey`).
- Novo `src/lib/schemas/ai-settings.ts`.
- Novo `src/lib/ai/settings.server.ts` (`import 'server-only'` — decrypt read via RPC) + `src/lib/ai/provider-factory.ts` (mínimo).
- Migration `supabase/migrations/0033_ai_settings.sql` (tabela + RLS + Vault enable + RPC `get_ai_api_key`).
</code_context>

<specifics>
## Specific Ideas

- Invariante de segurança não-negociável: a chave NUNCA alcança o client. Verificação esperada na fase: nenhum `sk-...`/`AIza...` no Network tab, no payload RSC, nem no bundle; o RSC/server action só projeta `has_key` + `provider`. Decrypt só dentro de módulo `server-only`.
- Espelhar exatamente o par `mei/configuracoes` page + `MeiSettingsForm` para consistência visual e de código.
- Migration deve seguir o template comentado das migrations 0031/0032 (WHY + ACTION REQUIRED + idempotente). Confirmar que a extensão `supabase_vault` está habilitada no stack local antes de depender de `vault.create_secret`.
</specifics>

<deferred>
## Deferred Ideas

- DeepSeek como 3º provedor (CLSAI-F1 — Future): bloqueado por gap `json_object` + churn `deepseek-chat`→`deepseek-v4-flash` (2026-07-24).
- Picker de model por provedor na UI (CLSAI-F2 — Future): por ora só o cheap default hard-coded.
- A chamada de IA real de classificação (Phase 15) e as afordâncias da review grid (Phase 16) — fora do escopo desta fase.
</deferred>
