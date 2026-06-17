import { z } from 'zod'

import { COMBUSTIVEL_OPTIONS } from '@/lib/schemas/carro'

/**
 * Shared Zod schema for abastecimentos (form + action), mirroring carro.ts /
 * reserva.ts. An abastecimento always belongs to a carro and records a fuel-up:
 * the odometer, the volume (litros — a VOLUME, never money/centavos), whether the
 * tank was filled (the tanque-cheio consumption method, D3), and the fuel type.
 *
 * The security-critical invariant is the cost-source XOR (D2): the cost comes from
 * EXACTLY ONE source — a linked fatura transaction (transactionId) OR a manual
 * value (amountCents, integer centavos) — never both, never neither. This mirrors
 * the DB `abastecimentos_cost_xor` CHECK from migration 0027 (defense in depth).
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
  })
  .superRefine((data, ctx) => {
    const hasTx = data.transactionId !== undefined
    const hasAmount = data.amountCents !== undefined
    // XOR: exactly one cost source — fail on both present OR both absent.
    if (hasTx === hasAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: COST_SOURCE_MESSAGE,
        path: ['amountCents'],
      })
    }
  })

export type AbastecimentoInput = z.infer<typeof abastecimentoSchema>
