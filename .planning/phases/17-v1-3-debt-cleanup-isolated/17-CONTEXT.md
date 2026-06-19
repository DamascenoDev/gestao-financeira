# Phase 17: v1.3 Debt Cleanup (ISOLATED) - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — operational / human-verify phase, `autonomous:false` style

<domain>
## Phase Boundary

Quitar a dívida operacional carregada do v1.3 — sem código de feature novo. Quatro entregas:

1. **SC1 — Redeploy G-07/G-08 confirmado ao vivo.** Os fixes do commit `2ae93fb` (sentinel do grid de
   importação / label do select de carro + toast "0 importadas") estão no bundle de PRODUÇÃO.
2. **SC2 — Walkthrough MEI em produção (downloads CSV/JSON).** Confirma os reqs MEI-* ao vivo, com foco
   no conteúdo dos arquivos baixados (BOM / `;` / pt-BR) que o 12-06 deixou sem abrir.
3. **SC3 — Walkthrough LGPD em produção (export + delete destrutivo).** Confirma DATA-*/SEC-01 ao vivo,
   incluindo um delete destrutivo de conta throwaway sob protocolo de segurança rígido.
4. **SC4 — VALIDATION.md de Nyquist para Phases 12 e 13.** Phase 12 ausente → criar; Phase 13 draft → finalizar.

DELIBERADAMENTE ISOLADA das fases de feature (14–16): contém um passo destrutivo em produção e o dev
server aponta para o Supabase de PROD. Nunca interleavar com commits de feature.

</domain>

<decisions>
## Implementation Decisions

### Autonomous Scope (work split)
- **"Docs + drive browser MCP".** O agente executa autonomamente, contra PRODUÇÃO e somente de forma
  não-destrutiva:
  - SC4 — gera `12-VALIDATION.md` e finaliza `13-VALIDATION.md`.
  - SC1 — confirma G-07/G-08 ao vivo via Chrome DevTools MCP (read-only).
  - SC2 — dispara e inspeciona os downloads CSV/JSON do MEI via Chrome DevTools MCP (não-destrutivo).
- O agente **NUNCA** roda o passo destrutivo (SC3 delete) nem o dev server (que aponta para PROD).
- SC3 destrutivo é entregue como **runbook de segurança**; o humano executa.

### SC3 Destructive Delete Safety Protocol
- **"You run it, my runbook".** O agente produz um runbook exato; o humano executa cada passo.
- Guard-rails obrigatórios, nesta ordem:
  1. **Backup do DB tirado ANTES** do delete.
  2. **`user_id` throwaway explicitamente criado e confirmado** (não a conta pessoal).
  3. **Double-confirm** do gate type-to-`APAGAR` (mecanismo já provado no 12-07, non-destructive).
  4. **Somente via site de PRODUÇÃO ao vivo** — NUNCA via dev server (aponta para PROD).
  5. **Verificar o cascade escopado ao `user_id` throwaway via RLS** após o delete.
- O agente nunca dispara o delete.

### VALIDATION.md Depth
- **"Pragmatic retroactive".** Mapa de verificação por-plano ancorado no que de fato shipou e foi
  live-verified (12-VERIFICATION live em prod; 13 tests + live). `nyquist_compliant` honesto: `true` onde
  tests + live cobrem, com os itens manual-only residuais listados explicitamente. **Sem fabricar test runs.**
- Formato espelha o template existente `13-VALIDATION.md` (frontmatter + Test Infrastructure + Sampling +
  Per-Task Map + Manual-Only + Sign-Off).

### Claude's Discretion
- Estrutura/quebra dos plans (operacional vs human-verify), wording do runbook, e o conteúdo exato dos
  mapas de validação ficam a critério do agente, ancorados nos artefatos das Phases 12/13.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Walkthrough patterns já provados:** `12-06-SUMMARY.md` (MEI live-verify, Chrome DevTools MCP) e
  `12-07-SUMMARY.md` (LGPD export/delete, partial/human_needed) são o molde dos runbooks.
- **Template de validação:** `.planning/phases/13-pdf-de-fatura/13-VALIDATION.md` (draft, com placeholders
  `{N}`) é o formato canônico a espelhar e finalizar.
- **Source de verdade da Phase 12:** `12-VERIFICATION.md` (`status: human_needed`, `next_action` aponta os
  walkthroughs 12-06/12-07 restantes; G-01..G-08 todos FIXED + deployed).
- **Affordances LGPD/MEI já presentes em prod:** `/conta` (Baixar meus dados, Exportar CSV, Apagar conta com
  gate type-to-`APAGAR`), `/mei/relatorio` (Exportar CSV DASN), `/extrato` (CSV).

### Established Patterns
- **Live-verify:** Chrome DevTools MCP contra `https://gestao-financeira-ebon-mu.vercel.app/` (perfil de
  browser separado, ver memória dev-env-testing-gotchas).
- **Gate destrutivo:** dialog de "Apagar conta" foca em Cancelar, botão habilita só no exato `APAGAR`.
- **SEC-01:** segredo service-role nunca no bundle servido (24 chunks escaneados no 12-07).

### Integration Points
- Nenhum código de feature novo. Saídas: 2 arquivos VALIDATION.md em `.planning/phases/{12,13}-*/`, 1
  runbook SC3 no diretório da Phase 17, e evidências live (SC1/SC2) registradas no SUMMARY/VERIFICATION.

</code_context>

<specifics>
## Specific Ideas

- **Production URL:** `https://gestao-financeira-ebon-mu.vercel.app/`
- **Commit SC1:** `2ae93fb` — `import-review-table.tsx` (+30/-3); já é ancestral do HEAD e do hotfix de
  prod `97366e5` (lazy-load pdf-parse), logo presumivelmente já no bundle servido — SC1 é confirmação.
- **SC2 gap exato:** o conteúdo do `dasn-2026.csv` (BOM/`;`/pt-BR) não foi aberto no 12-06 — é o que falta.
- **SC3 itens pendentes (12-07):** DATA-01 (inspeção do conteúdo do export bundle) + DATA-02 (delete
  destrutivo real). SEC-01 e o mecanismo do gate já verificados.
- **Dev-env hazard:** dev server aponta para o Supabase de PROD → qualquer ação destrutiva deve ser pela
  UI de produção ao vivo, sob o protocolo acima, nunca via `npm run dev`.

</specifics>

<deferred>
## Deferred Ideas

- Nenhuma ideia nova fora de escopo. Se o usuário optar por adiar/pular o delete destrutivo no momento do
  runbook (SC3), a Phase 17 fica aberta apenas nesse item (DATA-02 destructive path) — decisão tomada na
  hora da execução, não agora.

</deferred>
