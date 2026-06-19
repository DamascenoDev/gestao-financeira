import { z } from 'zod'

/**
 * Standalone Zod schema for a category keyword (KW-01), mirroring the `name`
 * field of category.ts (trim/min1/max60). The keyword action takes a raw string
 * arg (not a FormData/object), so this is a bare string schema. pt-BR messages
 * are LOCKED in 19-UI-SPEC §Copywriting Contract.
 *
 * NOTE: this validates the RAW input length. The action then runs
 * normalizeDescriptor on it before persisting — an input that normalizes to ''
 * is treated as the empty-validation error by the action, not here.
 */
export const keywordSchema = z
  .string()
  .trim()
  .min(1, 'Informe uma palavra-chave.')
  .max(60, 'Use até 60 caracteres.')

export type KeywordInput = z.infer<typeof keywordSchema>
