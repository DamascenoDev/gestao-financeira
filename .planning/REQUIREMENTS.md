# Requirements: Gestão Financeira Pessoal — Milestone v1.7

**Defined:** 2026-06-21
**Milestone:** v1.7 "Abastecimento de ponta-a-ponta + UX da grid"
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das confirmações — junto com a aderência às metas.

## v1.7 Requirements

Requisitos deste milestone. Cada um mapeia para uma fase do roadmap. Estende o módulo Carro (v1.2) reusando `AbastecimentoForm`, `src/actions/abastecimentos.ts` e as views `v_abastecimento_consumo`/`v_carro_resumo`.

### Registro de Abastecimento

- [ ] **CAR-07**: O usuário registra um abastecimento direto da lista `/carros` (botão "Novo abastecimento" por carro), sem precisar abrir a página de detalhe.
- [ ] **CAR-08**: Ao registrar um abastecimento manual (antes da fatura), o usuário pode marcá-lo como **parcelado**, informando o número de parcelas e o valor total.

### Vínculo Fatura ↔ Abastecimento

- [ ] **CAR-09**: Ao subir uma fatura, o sistema sugere vincular um lançamento a um abastecimento pré-registrado quando o valor do lançamento casa (à vista = valor total; parcelado = ~valor total ÷ nº de parcelas).
- [ ] **CAR-10**: O usuário confirma ou descarta a sugestão de vínculo na grid de revisão de importação (sem auto-commit); ao confirmar, o lançamento fica vinculado ao abastecimento e o `carro_id` é etiquetado no lançamento.
- [ ] **CAR-11**: Um abastecimento parcelado casa uma parcela por fatura ao longo dos meses; cada parcela confirmada é registrada sem recontar o custo (sem double-count no consumo nem no gasto total do carro).

### Consumo

- [ ] **CAR-12**: O relatório de consumo (km/l e R$/km) reflete tanto os abastecimentos registrados manualmente quanto os vinculados à fatura; o km/l é calculado apenas com litros + odômetro (não exige a fatura para existir).

### Categoria Combustível

- [ ] **FUEL-01**: Existe uma categoria default "Combustível" (kind `consumo`) para todos os usuários; ao confirmar o vínculo lançamento↔abastecimento, a categoria "Combustível" é sugerida/aplicada ao lançamento.

### UX da Importação

- [ ] **UX-01**: Criar uma palavra-chave inline na grid de importação preserva a posição de scroll da página (não reseta para o topo após salvar).

## v2 Requirements

Reconhecidos, fora deste milestone.

### Abastecimento

- **CAR-13**: Lembrete/projeção de parcelas futuras de um abastecimento parcelado ainda não totalmente vinculadas (quantas faltam casar).
- **CAR-14**: Edição/relink de custo de um abastecimento já criado (hoje o relink de transação no update está fora de escopo desde v1.2).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Match automático sem confirmação (auto-vincular) | Filosofia do projeto é human-in-the-loop, sem auto-commit; vínculo por valor é sugestão e o usuário confirma. |
| Match por descrição/merchant do lançamento de combustível | v1.7 casa por valor (à vista/parcela), que é sinal forte e simples; matching textual fica para depois se necessário. |
| OCR de cupom de posto / leitura de nota de abastecimento | Fora de escopo (mesmo motivo do no-OCR de PDF); entrada é manual + vínculo por valor. |
| Relatório de consumo novo (re-desenho) | km/l + R$/km já existem (v1.2); v1.7 só os alimenta com os novos registros, sem nova view de relatório. |
| Botão de abastecimento no Extrato | Decisão do usuário: acesso rápido fica na lista `/carros`; Extrato não recebe o botão neste milestone. |

## Traceability

Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAR-07 | Phase 27 | Pending |
| CAR-08 | Phase 27 | Pending |
| CAR-09 | Phase 28 | Pending |
| CAR-10 | Phase 28 | Pending |
| CAR-11 | Phase 28 | Pending |
| CAR-12 | Phase 28 | Pending |
| FUEL-01 | Phase 26 | Pending |
| UX-01 | Phase 25 | Pending |

**Coverage:**
- v1.7 requirements: 8 total
- Mapped to phases: 8 (Phase 25: UX-01 · Phase 26: FUEL-01 · Phase 27: CAR-07/CAR-08 · Phase 28: CAR-09/CAR-10/CAR-11/CAR-12)
- Unmapped: 0 ✅

---
*Requirements defined: 2026-06-21*
*Last updated: 2026-06-21 — roadmap created (Phases 25–28); traceability 8/8 mapped, 0 órfãos.*
