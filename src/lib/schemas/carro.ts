import { z } from 'zod'

/**
 * Shared Zod schema for carros (form + action), mirroring reserva.ts. The carro
 * is the unit a lançamento can be tagged to (Phase 9) and an abastecimento belongs
 * to (Phase 10). `apelido` is the friendly name shown in lists/selectors; modelo,
 * placa, ano and combustivel_padrao are optional descriptive metadata. The
 * combustivel options are a fixed set per 08-CONTEXT. (CAR-01 / T-08-07)
 */

/** The current year + 1 — a sane upper bound for `ano` (next model-year cars exist). */
const MAX_ANO = new Date().getFullYear() + 1

/** Create/edit a carro: apelido required, everything else optional. */
export const carroSchema = z.object({
  apelido: z.string().trim().min(1, 'Informe o apelido').max(60),
  modelo: z.string().trim().max(80).optional(),
  placa: z.string().trim().max(10).optional(),
  // A non-integer/junk `ano` (NaN from `Number("abc")`, or a decimal like 20.5)
  // surfaces the friendly "Informe um ano válido" rather than Zod's default
  // number/integer message; only a genuine out-of-range INTEGER yields
  // "Ano inválido" (WR-02). `.int()` carries the invalid-number message because
  // NaN fails the integer check first.
  ano: z
    .number({ message: 'Informe um ano válido' })
    .int('Informe um ano válido')
    .min(1900, 'Ano inválido')
    .max(MAX_ANO, 'Ano inválido')
    .optional(),
  combustivel_padrao: z
    .enum(['Flex', 'Gasolina', 'Etanol', 'Diesel', 'GNV'])
    .optional(),
})

export type CarroInput = z.infer<typeof carroSchema>
