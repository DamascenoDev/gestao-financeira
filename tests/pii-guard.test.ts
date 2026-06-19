// 6-W0-08 (SEC-01 / SEC-03 / Pitfall 6) — PII→AI egress guard. Keeps the classifier
// path PII-safe now that Phase 15 WIRES the real call: (a) the only AI deps are the
// BYOK providers Gemini + Claude (no `ai` umbrella, DeepSeek stays OUT — deferred),
// and (b) the payload that actually egresses to the model carries ONLY the normalized
// descriptor — never the amount, date, or raw descriptor. The PII contract is now
// enforced by inspecting the sent prompt (the wired call egresses descriptor_norm and
// nothing else), not by the absence of a call. If someone wires the LLM such that
// amount/date/raw start leaking into the prompt, (b) goes RED — an LGPD/SEC-03
// regression.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

const CATEGORIES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Mercado', kind: 'consumo' as const },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Transporte', kind: 'consumo' as const },
]

const FAKE_SETTINGS = { provider: 'gemini' as const, model: 'm', apiKey: 'k' }

// Spy doGenerate so the test can inspect the EXACT prompt the wired call sends. The
// provider factory is mocked so no real provider is instantiated and no key egresses.
const doGenerate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: JSON.stringify({ results: [] }) }],
  finishReason: 'stop',
  usage: { inputTokens: 1, outputTokens: 1 },
})
vi.mock('@/lib/ai/provider-factory', () => ({
  modelFor: vi.fn(() => ({ doGenerate })),
}))

import { classifyDescriptors } from '@/lib/ai/classify'

describe('PII→AI egress guard (SEC-03 / 6-W0-08)', () => {
  it('AI deps are limited to the BYOK provider set (no `ai` umbrella, no DeepSeek)', () => {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const aiDeps = Object.keys(deps)
      .filter((d) => d === 'ai' || d.startsWith('@ai-sdk'))
      .sort()
    // v1.4 BYOK (Phase 14) intentionally installs Gemini + Claude. The `ai` umbrella is
    // NOT a dependency (providers are instantiated directly per BYOK key), and DeepSeek
    // stays OUT (deferred — json_object gap + model-id churn). This catches an accidental
    // re-add of the umbrella or a non-approved provider from wiring the call.
    expect(aiDeps).toEqual(['@ai-sdk/anthropic', '@ai-sdk/google'])
  })

  it('classify sends ONLY descriptor_norm to the model — no amount/date/raw PII', async () => {
    await classifyDescriptors(['padaria sao joao'], CATEGORIES, FAKE_SETTINGS)
    const sent = JSON.stringify(doGenerate.mock.calls[0]?.[0]?.prompt)
    // The descriptor_norm IS sent (it must — it's the classification input)…
    expect(sent).toContain('padaria sao joao')
    // …but NO PII field crosses the boundary: no currency, no dd/mm/yyyy date, and no
    // amount / occurred_on / descriptor_raw key from the row shape.
    expect(sent).not.toMatch(/R\$|\d{2}\/\d{2}\/\d{4}|amount|occurred_on|descriptor_raw/)
  })
})
