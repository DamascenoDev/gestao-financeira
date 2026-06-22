---
status: complete
phase: 27-registro-r-pido-abastecimento-parcelado
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md]
started: 2026-06-22T11:39:00Z
updated: 2026-06-22T12:40:56Z
---

## Current Test

[testing complete]

## Tests

### 1. Registro rápido pela lista /carros (form manual-only na face do card)
expected: Botão "Novo abastecimento" visível na face do card (não no menu ⋯); abre form manual-only (Manual | Parcelado, sem "Da fatura"); salvar um manual à-vista → toast sucesso + aparece no histórico.
result: pass

### 2. Registro parcelado + preview "valor por parcela" ao vivo
expected: Na aba "Parcelado": informar valor total (ex. 600,00) e nº de parcelas (ex. 6) → aparece o preview "valor por parcela" ao vivo e correto (R$ 100,00); apagar o valor ou o nº de parcelas faz o preview sumir. Salvar um parcelado válido → toast de sucesso e o abastecimento aparece no histórico.
result: issue
reported: "Parcelado está certo, mas ao salvar o abastecimento não tem nenhuma exibição de histórico"
severity: major
note: O input e o preview do parcelado funcionam ("parcelado está certo"). O problema é a visibilidade pós-save — após salvar, nada aparece. Contexto p/ diagnose: a LISTA /carros não hospeda histórico por design (D-01/27-04); o histórico vive no detalhe /carros/[id]. Além disso, um parcelado não cria transaction (transaction_id/amount_cents NULL), então não soma em v_carro_resumo.gasto_total_cents (que agrega transactions.carro_id) — o custo parcelado vive em valor_total_cents e é contado só na view de consumo (0039). Verificar: (a) o parcelado aparece no histórico do detalhe /carros/[id]; (b) algum KPI da lista reflete o parcelado, ou nada muda visualmente após salvar pela lista.

### 3. Validação dos limites de parcelas (2–24)
expected: Na aba "Parcelado", informar nº de parcelas = 1 ou = 25 e tentar salvar → o submit falha com mensagem de validação (a faixa aceita é 2 a 24). Um valor dentro da faixa (ex. 2 a 24) passa.
result: pass

### 4. CR-01 — Editar um abastecimento parcelado PRESERVA o parcelamento
expected: Abrir "Editar" num abastecimento parcelado já salvo (test 2). O form abre JÁ na aba "Parcelado" com o valor total e o nº de parcelas pré-preenchidos (NÃO na aba Manual com o total jogado como valor à-vista). Salvar sem mudar nada → continua parcelado, com o mesmo valor total e nº de parcelas; NÃO vira um à-vista manual e NÃO perde as parcelas. (Antes do fix isto silenciosamente convertia o parcelado em à-vista manual = perda de dado.)
result: pass
note: Verificado ao vivo no detalhe /carros/[id] após o usuário navegar pelo apelido. CR-01 confirmado — edição de parcelado preserva o parcelamento (form abre na aba Parcelado pré-preenchida, salva sem downgrade para à-vista).

### 5. WR-03 — Mensagem de erro de custo no lugar certo
expected: Forçar um erro de fonte de custo (ex. na aba "Da fatura" do detalhe /carros/[id], submeter sem escolher lançamento). A mensagem de erro de custo aparece UMA vez abaixo das abas (área neutra), não duplicada/presa sob um controle escondido; trocar de aba não deixa um erro velho preso na aba anterior.
result: pass
note: Verificado ao vivo após resolução do falso-alarme do custo parcelado (gap 2 = stale render, resolvido). Mensagem de erro de custo renderiza no lugar certo (área neutra sob as abas, uma vez, sem ficar presa ao trocar de aba). Usuário confirmou "pass".

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "O usuário consegue chegar ao histórico de abastecimentos (e à ação Editar) de um carro a partir da lista /carros."
  status: failed
  reason: "User reported (test 2): 'Parcelado está certo, mas ao salvar o abastecimento não tem nenhuma exibição de histórico'. User clarified (test 4): 'Não tem botão ou card clicável para abrir o detalhe do carro em /carros/[id], não achei esse link em lugar nenhum'."
  severity: major
  test: 2
  root_cause: "Discoverability gap, NÃO bug de rota nem de render. O histórico de abastecimentos + a ação Editar vivem SÓ no detalhe /carros/[id] (AbastecimentoHistory montado em src/app/(app)/carros/[id]/page.tsx:378). A lista /carros não hospeda histórico por design (D-01/27-04) e um parcelado não cria transaction, então não move os KPIs de v_carro_resumo — após salvar pela lista nada muda visualmente. O único caminho da lista para o detalhe é o apelido do carro, renderizado como <Link href={/carros/[id]}> com APENAS hover:underline (src/components/carro-card.tsx:102) — sem botão/affordance, indescobrível. Phase 27 tornou o registro-pela-lista primário e amplificou essa lacuna pré-existente (link existe desde Phase 11). A correção CR-01 (editar parcelado) está corretamente conectada no detalhe, mas é inalcançável pela UI."
  artifacts:
    - path: "src/components/carro-card.tsx"
      issue: "Único link para o detalhe /carros/[id] é o apelido com hover:underline (L102) — sem affordance de clique; o botão 'Novo abastecimento' (L177+) registra mas não leva ao histórico."
    - path: "src/app/(app)/carros/page.tsx"
      issue: "Lista mostra só KPIs (v_carro_resumo); parcelado salvo não altera gasto_total_cents (parcelado sem transaction) → zero feedback visual pós-save na lista."
  missing:
    - "Affordance de navegação clara da lista /carros para o detalhe /carros/[id] (card clicável inteiro, ou botão 'Ver detalhes/Histórico') para que histórico + Editar sejam alcançáveis."
    - "Opcional: feedback pós-save na lista (ex. toast já existe; considerar link 'ver no histórico') já que a lista não exibe o registro."
  debug_session: ""  # Diagnosed inline during UAT — no separate debug session

- truth: "Um abastecimento parcelado mostra seu custo (valor total) no histórico do detalhe /carros/[id], como um manual mostra o seu."
  status: resolved-not-a-defect
  resolution: "FALSO ALARME — render stale do Next dev server. Após restart do dev server + hard-refresh, o custo do parcelado passou a exibir corretamente ('funcionou'). Migração 0039 já estava aplicada em PROD ('a 39 já estava em prod antes'). Análise estática já havia confirmado a cadeia de código correta de ponta a ponta; o sintoma era cache/chunk antigo do dev após o fast-forward dos commits de fix de hoje. Sem mudança de código necessária."
  severity: major
  test: 5
  root_cause: "EM ABERTO — análise estática NÃO encontrou bug no código-fonte. Cadeia verificada correta de ponta a ponta: (1) abastecimentoSchema EXIGE valorTotalCents no parcelado (superRefine L92-100) → um toast VERDE só ocorre se valorTotalCents passou; (2) abastecimentoWriteFields grava valor_total_cents = input.valorTotalCents (actions L86); (3) create E update fazem revalidatePath('/carros/[id]') (L168-169, L243-244); (4) o detalhe page.tsx L233-236 computa custo = valor_total_cents do parcelado, e toEdit (abastecimento-history L111-115) lê o MESMO campo com a MESMA lógica isParcelado. CONTRADIÇÃO-CHAVE: o test 4 PASSOU com o form de Editar PRÉ-PREENCHIDO com o valor total — isso prova que row.valor_total_cents era NÃO-null e que o detalhe rodou o código atual; logo a coluna de custo deveria mostrar o mesmo valor. Suspeita principal: render/cache stale do Next dev (client Router Cache de uma visita anterior ao detalhe, ou chunk antigo) OU estado de dados/migração específico no Supabase PROD — NÃO um defeito de código. Confirmar com hard-refresh/restart do dev server antes de tratar como bug."
  artifacts:
    - path: "src/app/(app)/carros/[id]/page.tsx"
      issue: "L233-236 custo parcelado = valor_total_cents (correto); query L89 seleciona o campo (correto). Sem defeito aparente — verificar dado em runtime/PROD."
  missing:
    - "Re-confirmar em runtime: hard-refresh do detalhe (Ctrl+Shift+R) e/ou restart do dev server; se persistir, inspecionar a row no Supabase (valor_total_cents/parcelas_total reais) — dev server aponta p/ PROD."
    - "Verificar se a migração 0039 (colunas valor_total_cents/parcelas_total + CHECK abastecimentos_cost_xor) está aplicada no Supabase PROD."
  debug_session: ""  # Pendente — rodar diagnose se persistir após recheck de runtime
