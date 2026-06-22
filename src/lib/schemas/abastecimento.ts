import { z } from 'zod'

import { COMBUSTIVEL_OPTIONS } from '@/lib/schemas/carro'

/**
 * Shared Zod schema for abastecimentos (form + action), mirroring carro.ts /
 * reserva.ts. An abastecimento always belongs to a carro and records a fuel-up:
 * the odometer, the volume (litros — a VOLUME, never money/centavos), whether the
 * tank was filled (the tanque-cheio consumption method, D3), and the fuel type.
 *
 * The security-critical invariant is the cost-source rule, now spanning THREE
 * states (D-05). The parcelado branch mirrors the relaxed `abastecimentos_cost_xor`
 * CHECK from migration 0039 (defense in depth). The à-vista branch is INTENTIONALLY
 * STRICTER than the 0039 CHECK (WR-01): migration 0039 relaxes the à-vista path to
 * `not (transaction_id is null and amount_cents is null)` — i.e. at least one source,
 * explicitly allowing BOTH transaction_id AND amount_cents present (the "attach-later
 * with both present" case). This schema instead requires EXACTLY ONE à-vista source
 * (single-source-only), because vincular-fatura / attach-later is Phase 28. Do NOT
 * "fix" the DB or this schema to match the wrong side: the divergence is deliberate
 * until Phase 28 wires attach-later, at which point the à-vista branch here should be
 * relaxed to match the CHECK.
 *   1. À-VISTA por fatura: transactionId present, no amountCents, no valorTotalCents.
 *   2. À-VISTA manual:     amountCents present, no transactionId, no valorTotalCents.
 *   3. PARCELADO:          valorTotalCents present + parcelasTotal > 1, and BOTH
 *      transactionId and amountCents absent (the parcela tx links live in the
 *      `abastecimento_parcelas` junction, never on the abastecimento row itself).
 *
 * Parcelado is detected by `parcelasTotal !== undefined && parcelasTotal > 1`.
 * À-VISTA convention (followed by the 27-02 action): in an à-vista state
 * `parcelasTotal` is treated as ABSENT or `1` — both mean "não-parcelado", exactly
 * as the 0039 CHECK treats `parcelas_total` null-or-1. An à-vista row therefore
 * keeps the original XOR (exactly one of transactionId/amountCents) AND must NOT
 * carry valorTotalCents, so the two cost models never bleed into each other.
 *
 * The combustivel enum is shared with carro.ts via COMBUSTIVEL_OPTIONS — a single
 * source so a carro's `combustivel_padrao` and an abastecimento's `combustivel`
 * can never diverge. preco_litro is NEVER part of this schema: it is derived for
 * display only (consumo.ts), never entered or stored. (CAR-03 / T-10-04)
 */

const COST_SOURCE_MESSAGE =
  'Informe exatamente uma fonte de custo: lançamento da fatura ou valor manual.'

export const abastecimentoSchema = z
  .object({
    carroId: z.string().uuid('Carro inválido'),
    // Civil date pinned SP at the app edge; the DB column is `date`.
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    odometroKm: z
      .number({ message: 'Informe um odômetro válido' })
      .int('Informe um odômetro válido')
      .positive('O odômetro deve ser maior que zero'),
    // litros is a VOLUME (numeric), NOT money — never centavos. Decimals allowed.
    litros: z
      .number({ message: 'Informe os litros' })
      .positive('Os litros devem ser maiores que zero'),
    tanqueCheio: z.boolean(),
    // Optional/nullable; constrained to the SAME enum as carro.ts (no drift).
    combustivel: z.enum(COMBUSTIVEL_OPTIONS).nullish(),
    // Cost source — an exclusive pair enforced by the XOR refine below.
    transactionId: z.string().uuid('Lançamento inválido').optional(),
    amountCents: z
      .number({ message: 'Valor monetário inválido' })
      .int('Valor monetário inválido')
      .positive('Valor monetário inválido')
      .optional(),
    // Parcelado cost-of-record (D-09): integer centavos, positive — mirrors the
    // 0039 CHECK `valor_total_cents > 0`. Money is ALWAYS positive cents.
    valorTotalCents: z
      .number({ message: 'Valor total inválido' })
      .int('Valor total inválido')
      .positive('Valor total inválido')
      .optional(),
    // Parcela count (D-07): integer in [2, 24]. > 1 marks the row as parcelado;
    // the ceiling bars absurd input while staying inside the 0039 `parcelas_total > 1`.
    parcelasTotal: z
      .number({ message: 'Número de parcelas inválido' })
      .int('Número de parcelas inválido')
      .min(2, 'O parcelamento deve ter ao menos 2 parcelas')
      .max(24, 'O parcelamento deve ter no máximo 24 parcelas')
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasTx = data.transactionId !== undefined
    const hasAmount = data.amountCents !== undefined
    const hasValorTotal = data.valorTotalCents !== undefined
    // Parcelado is detected by parcelasTotal > 1 (absent or 1 = à-vista). Note the
    // field bound above already rejects parcelasTotal === 1 outright, so any row that
    // reaches here with parcelasTotal defined has parcelasTotal >= 2.
    const isParcelado = data.parcelasTotal !== undefined && data.parcelasTotal > 1

    if (isParcelado) {
      // PARCELADO: valorTotalCents present, BOTH transactionId/amountCents absent.
      if (!hasValorTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o valor total do parcelamento.',
          path: ['valorTotalCents'],
        })
      }
      if (hasTx) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Um abastecimento parcelado não pode ter lançamento da fatura.',
          path: ['transactionId'],
        })
      }
      if (hasAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Um abastecimento parcelado não pode ter valor manual.',
          path: ['amountCents'],
        })
      }
    } else {
      // À-VISTA: exactly one of transactionId/amountCents, and NO valorTotalCents.
      // WR-03: the "exactly one source" violation is source-neutral, so publish it at
      // a neutral `cost` path rather than `amountCents`. Otherwise the form would
      // render the cost-source message under whichever single control happens to read
      // `errors.amountCents` (e.g. the fatura picker), and a stale `amountCents` error
      // would linger on a now-hidden control after a tab switch.
      if (hasTx === hasAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: COST_SOURCE_MESSAGE,
          path: ['cost'],
        })
      }
      if (hasValorTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Um abastecimento à vista não pode ter valor total de parcelamento.',
          path: ['valorTotalCents'],
        })
      }
    }
  })

export type AbastecimentoInput = z.infer<typeof abastecimentoSchema>
