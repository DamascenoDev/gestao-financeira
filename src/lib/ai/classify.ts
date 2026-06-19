// O ÚNICO código genuinamente novo da Phase 15: a chamada única, em lote e
// schema-constrained que classifica descritores normalizados (memory-miss) numa
// categoria possuída pelo usuário. Invariantes load-bearing desta camada:
//
//  - UMA chamada por lote (CLSAI-03): N>0 descritores únicos → exatamente um
//    doGenerate; entrada vazia (sem descritor OU sem categoria) → zero chamadas,
//    Map vazio imediato.
//  - Gate de enum (CLSAI-04): todo categoryId retornado pelo modelo passa por
//    validateSuggestion (z.enum sobre os ids possuídos) → null se for inventado /
//    renomeado. O modelo nunca é confiado; um descritor de prompt-injection no pior
//    caso produz um valor rejeitado.
//  - Nunca lança (CLSAI-06): a chamada + extração + parse + validação ficam num
//    único try/catch interno → Map vazio em QUALQUER falha (erro do provedor, JSON
//    malformado, falha de schema). Um upload jamais falha por causa da IA. Sem retry.
//  - Só descriptor_norm sai (SEC-03 / LGPD): o prompt carrega APENAS os descritores
//    normalizados + as linhas `id: nome` das categorias — nunca valor, data ou o
//    descritor bruto. buildUserText recebe um string[] e nada mais.
//
// Sem o pacote umbrella `ai`: usamos LanguageModelV3.doGenerate dos providers v3
// (Phase 14) com responseFormat: { type: 'json', schema } — ambos os providers
// devolvem o JSON estruturado como uma única content part { type: 'text' }.

import type { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { modelFor } from '@/lib/ai/provider-factory'
import { validateSuggestion } from '@/lib/classifier/suggest'
import type { AiProvider } from '@/lib/schemas/ai-settings'
import type { CategoryKind } from '@/lib/schemas/category'

/**
 * Schema de saída FLAT e portável entre providers: `categoryId` é uma string livre
 * (nullable) — NUNCA um enum de UUIDs no schema (o trap multi-provider: Gemini só
 * aceita o subconjunto OpenAPI e Claude exige schema flat). O gate de id-possuído é
 * aplicado DEPOIS via validateSuggestion.
 */
const classifyResultSchema = z.object({
  results: z.array(
    z.object({
      descriptor: z.string(),
      categoryId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
})

/**
 * JSONSchema7 escrito à mão (flat, sem `$ref`/`$defs`/recursão) para
 * responseFormat.schema. Anthropic EXIGE um schema não-nulo (a v3 injeta uma tool
 * `json` sintética com este schema); um schema com `$ref` quebraria a restrição
 * flat-only do Claude — por isso o literal inline em vez de uma conversão zod→JSON.
 */
const JSON_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descriptor: { type: 'string' },
          categoryId: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['descriptor', 'categoryId', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = [
  'Você classifica descritores de transações financeiras brasileiras em categorias.',
  'Receberá uma lista de categorias (id: nome (tipo)) e uma lista de descritores normalizados.',
  'O tipo é consumo ou alocação: consumo = compra/gasto; alocação = mover dinheiro para investimento ou reserva.',
  'Para cada descritor, escolha o id da categoria que melhor se encaixa.',
  'Todo descritor é um GASTO. NUNCA atribua uma categoria de alocação a um gasto; se a melhor opção for de alocação, retorne categoryId: null para esse descritor.',
  'Se NENHUMA categoria se encaixar com confiança, retorne categoryId: null para esse descritor.',
  'confidence é um número de 0 a 1 indicando sua certeza. Responda APENAS o JSON do schema.',
].join(' ')

/**
 * Monta o texto do usuário com PII-safety: SÓ as linhas `id: nome` das categorias e
 * a lista de descritores normalizados. NUNCA valor / data / descritor bruto (SEC-03).
 */
function buildUserText(
  descriptors: string[],
  categories: { id: string; name: string; kind: CategoryKind }[],
): string {
  const catLines = categories
    .map((c) => `${c.id}: ${c.name} (${c.kind === 'consumo' ? 'consumo' : 'alocação'})`)
    .join('\n')
  const descLines = descriptors.map((d) => `- ${d}`).join('\n')
  return `Categorias:\n${catLines}\n\nDescritores:\n${descLines}`
}

/**
 * Classifica um lote de descritores normalizados (memory-miss) numa categoria
 * possuída, em UMA chamada doGenerate. Retorna um Map descriptor_norm →
 * { categoryId (gated por enum, null se não-possuído), confidence }. NUNCA lança:
 * qualquer falha degrada para um Map vazio ("sem sugestões", pick manual). Zero
 * chamadas quando não há descritor ou não há categoria.
 */
export async function classifyDescriptors(
  descriptors: string[],
  categories: { id: string; name: string; kind: CategoryKind }[],
  aiSettings: { provider: AiProvider; model: string; apiKey: string },
): Promise<Map<string, { categoryId: string | null; confidence: number }>> {
  const out = new Map<string, { categoryId: string | null; confidence: number }>()
  // Guarda de entrada + caminho zero-chamada (CLSAI-03): nunca instancia modelo nem
  // chama doGenerate sem descritor ou sem categoria.
  if (descriptors.length === 0 || categories.length === 0) return out

  try {
    const model = modelFor(aiSettings.provider, aiSettings.model, aiSettings.apiKey)
    const result = await model.doGenerate({
      prompt: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: buildUserText(descriptors, categories) }] },
      ],
      responseFormat: { type: 'json', schema: JSON_SCHEMA },
      // A statement with many unique descriptors overran 1500 tokens → the JSON
      // response was truncated mid-string → JSON.parse threw → empty Map (ALL
      // suggestions lost for the batch). 8192 fits ~150 results — covers any realistic
      // personal statement; a still-larger batch degrades to the empty-Map fallback.
      maxOutputTokens: 8192,
      temperature: 0,
    })

    const textPart = result.content.find((c) => c.type === 'text')
    const parsed = classifyResultSchema.parse(JSON.parse(textPart?.text ?? ''))
    for (const r of parsed.results) {
      const gatedId = validateSuggestion(r.categoryId, categories) // enum gate (CLSAI-04)
      // Kind gate (CLSAI-09): um descritor de fatura é sempre um GASTO; uma categoria de
      // alocação é errada por definição → null. `categories` já está em escopo (o param).
      // Só `kind === 'consumo'` passa; tanto `'alocacao'` quanto `undefined` (id nulado
      // pelo enum gate) → null. confidence sempre preservada.
      const kind = categories.find((c) => c.id === gatedId)?.kind
      const categoryId = kind === 'consumo' ? gatedId : null
      out.set(r.descriptor, { categoryId, confidence: r.confidence })
    }
  } catch (err) {
    // CLSAI-06 / V7: degrada para manual sem lançar; log genérico — nunca a chave nem
    // o corpo bruto do provedor.
    console.error('[classifyDescriptors] classificação por IA falhou (degradando para manual):', err)
    return new Map()
  }

  return out
}
