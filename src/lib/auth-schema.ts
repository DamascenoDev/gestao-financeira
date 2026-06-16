import { z } from 'zod'

/**
 * Single source of truth for auth credential validation.
 * Shared by the react-hook-form Zod resolver (client) AND the Server Actions
 * (server) so the validation contract cannot drift between form and action.
 */
export const authSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
})

export type AuthInput = z.infer<typeof authSchema>
