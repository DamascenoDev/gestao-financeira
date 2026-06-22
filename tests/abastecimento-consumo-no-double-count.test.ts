// 28-W4-05 (CAR-12, P26 D-05 carry-forward): a fase 28 NÃO cria SQL novo de
// relatório. As views km/l + R$/km são da P26 (0029/0039, security_invoker). CAR-12 é
// VERIFICAÇÃO honesta de que, ao ALIMENTAR essas views com as linhas que o Plano 03
// vincula (à-vista: abastecimentos.transaction_id + transactions.carro_id; parcelado:
// linhas em abastecimento_parcelas), as invariantes de custo se mantêm:
//
//   1. Sem double-count no parcelado (P26 D-05, held-out): vincular as N parcelas em
//      `abastecimento_parcelas` NUNCA recompõe `valor_total_cents`. O custo do
//      parcelado em v_abastecimento_consumo / v_carro_resumo é SEMPRE `valor_total_cents`
//      contado UMA vez — vinculando 0, 1, 2 ou 3 parcelas o custo é o mesmo (o nº de
//      parcelas vinculadas é o parâmetro held-out; o custo nas views é a invariante).
//      Isso é estrutural: a junção `abastecimento_parcelas` NÃO alimenta o custo da view
//      (o cost CASE lê `valor_total_cents` do próprio abastecimento, 0039 L161/L198).
//   2. à-vista coalesce sem double-count (carry-forward): vincular um lançamento à-vista
//      (set `transaction_id`, a tx com seu PRÓPRIO amount_cents real) faz a view usar
//      coalesce(t.amount_cents, a.amount_cents) — o REAL ganha pro custo UMA vez, nunca
//      esperado+real somados (0039 L162).
//   3. km/l só litros + odômetro (CAR-12): km_por_litro = Δodômetro ÷ Σlitros e NÃO muda
//      ao vincular/desvincular parcelas (o custo não entra no km/l); um abastecimento SEM
//      nenhuma fatura vinculada ainda produz km_por_litro não-null (não exige a fatura).
//   4. manuais + vinculados ambos no consumo: um carro com um abastecimento manual (sem
//      vínculo) E um vinculado aparece com AMBOS refletidos nas views (gasto agregado em
//      v_carro_resumo considera os dois via transactions.carro_id).
//
// NÃO escreve nenhum SQL novo de view — só exercita as views existentes da P26.
//
// Clone do harness createUser/userClient/serviceClient de carro-consumo.test.ts
// (security_invoker scopes per caller; afterAll deleta os users). Roda contra
// `supabase start` (stack Docker local apenas).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }

// Carro 1 (parcelado held-out): abertura à-vista + fechamento PARCELADO (parcelas_total=3,
// valor_total_cents set, transaction_id null, amount_cents null — a única forma legal sob
// o CHECK relaxado da 0039). Δkm = +500. O custo do intervalo deve ser valor_total_cents
// UMA vez, qualquer que seja o nº de parcelas vinculadas na junção.
let carroParceladoId: string
let abParceladoId: string

// Carro 2 (à-vista coalesce): abertura à-vista + fechamento à-vista com amount_cents
// ESPERADO, depois vinculado a uma tx cujo amount_cents REAL difere. A view usa o real
// via coalesce — UMA vez.
let carroAvistaId: string
let abAvistaCloseId: string

// Carro 3 (manual + vinculado): um abastecimento manual (tx tagged carro_id, sem vínculo
// reverso) e o fechamento à-vista vinculado — ambos refletidos no gasto agregado.
let carroMixId: string

// ── Parcelado fixture (held-out) ───────────────────────────────────────────────
const PARCELADO_VALOR_TOTAL_C = 60000 // cents — custo total do combustível parcelado
const PARCELADO_LITROS = 40 // litros do fechamento parcelado
const PARCELADO_DELTA_KM = 500 // 40000 → 40500
// Cada parcela vinculada tem seu próprio cash-flow (NÃO entra no custo da view). Valor
// escolhido para que NENHUM múltiplo (1×, 2×, 3×) nem (V + n×cash) colida com V — assim
// qualquer "vazamento" da junção para o custo seria detectado, não mascarado por acaso.
const PARCELA_CASH_C = 17000 // 3 × 17000 = 51000 ≠ 60000; nem V+n×cash nem n×cash batem em V

// ── à-vista coalesce fixture ───────────────────────────────────────────────────
const AVISTA_LITROS = 40 // litros do fechamento à-vista
const AVISTA_DELTA_KM = 500 // 50000 → 50500
const AVISTA_ESPERADO_C = 30000 // amount_cents ESPERADO no abastecimento (estimado)
const AVISTA_REAL_C = 27000 // amount_cents REAL da tx vinculada — a view usa ESTE (coalesce)

async function createUser(prefix: string): Promise<{ id: string; jwt: string }> {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`
  const password = 'test-password-123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const signIn = userClient('', config)
  const { data: session, error: signInErr } = await signIn.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) throw new Error(`signIn failed: ${signInErr?.message}`)
  return { id: data.user.id, jwt: session.session.access_token }
}

/** Insere uma transação e devolve seu id (o lançamento da fatura que vira parcela / à-vista). */
async function seedTx(
  jwt: string,
  userId: string,
  amountCents: number,
  description: string,
): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('transactions')
    .insert({ user_id: userId, amount_cents: amountCents, occurred_on: '2026-06-15', description })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTx failed: ${error?.message}`)
  return data.id as string
}

/** Lê o custo do intervalo do carro parcelado (sempre 1 intervalo no fixture). */
async function readParceladoCusto(jwt: string): Promise<number> {
  const a = userClient(jwt, config)
  const { data, error } = await a
    .from('v_abastecimento_consumo')
    .select('km_rodados, litros_intervalo, custo_intervalo_cents, km_por_litro')
    .eq('carro_id', carroParceladoId)
  if (error) throw new Error(`read v_abastecimento_consumo failed: ${error.message}`)
  expect((data ?? []).length).toBe(1)
  return Number(data![0]!.custo_intervalo_cents)
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ab-consumo-ndc-a')

  const a = userClient(userA.jwt, config)

  // ── Carro 1 (parcelado held-out): abertura à-vista + fechamento PARCELADO ────────
  const { data: parc, error: parcErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'HB20 Parcelado' })
    .select('id')
    .single()
  if (parcErr || !parc) throw new Error(`seed parcelado carro failed: ${parcErr?.message}`)
  carroParceladoId = parc.id

  const { error: openErr } = await a.from('abastecimentos').insert({
    user_id: userA.id,
    carro_id: carroParceladoId,
    occurred_on: '2026-06-01',
    odometro_km: 40000, // abertura full tank — sem intervalo anterior
    litros: 30,
    tanque_cheio: true,
    amount_cents: 18000,
  })
  if (openErr) throw new Error(`seed parcelado opening failed: ${openErr.message}`)

  const { data: abParc, error: abParcErr } = await a
    .from('abastecimentos')
    .insert({
      user_id: userA.id,
      carro_id: carroParceladoId,
      occurred_on: '2026-06-15',
      odometro_km: 40500, // +500 km, fechamento PARCELADO — fonte do custo
      litros: PARCELADO_LITROS,
      tanque_cheio: true,
      parcelas_total: 3,
      valor_total_cents: PARCELADO_VALOR_TOTAL_C,
    })
    .select('id')
    .single()
  if (abParcErr || !abParc) throw new Error(`seed parcelado closing failed: ${abParcErr?.message}`)
  abParceladoId = abParc.id

  // ── Carro 2 (à-vista coalesce): abertura à-vista + fechamento à-vista com ESPERADO ──
  const { data: av, error: avErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Civic Avista' })
    .select('id')
    .single()
  if (avErr || !av) throw new Error(`seed avista carro failed: ${avErr?.message}`)
  carroAvistaId = av.id

  const { error: avOpenErr } = await a.from('abastecimentos').insert({
    user_id: userA.id,
    carro_id: carroAvistaId,
    occurred_on: '2026-07-01',
    odometro_km: 50000, // abertura full tank
    litros: 30,
    tanque_cheio: true,
    amount_cents: 18000,
  })
  if (avOpenErr) throw new Error(`seed avista opening failed: ${avOpenErr.message}`)

  const { data: abAv, error: abAvErr } = await a
    .from('abastecimentos')
    .insert({
      user_id: userA.id,
      carro_id: carroAvistaId,
      occurred_on: '2026-07-15',
      odometro_km: 50500, // +500 km, fechamento à-vista com amount_cents ESPERADO
      litros: AVISTA_LITROS,
      tanque_cheio: true,
      amount_cents: AVISTA_ESPERADO_C,
    })
    .select('id')
    .single()
  if (abAvErr || !abAv) throw new Error(`seed avista closing failed: ${abAvErr?.message}`)
  abAvistaCloseId = abAv.id

  // ── Carro 3 (manual + vinculado): manual tagueado + fechamento à-vista vinculável ──
  const { data: mix, error: mixErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol Mix' })
    .select('id')
    .single()
  if (mixErr || !mix) throw new Error(`seed mix carro failed: ${mixErr?.message}`)
  carroMixId = mix.id

  // Abastecimento manual: registrado à mão (sem vínculo reverso). Seu gasto é tagueado
  // por uma transação com carro_id — exatamente o que v_carro_resumo.gasto_total agrega.
  const { error: mixOpenErr } = await a.from('abastecimentos').insert({
    user_id: userA.id,
    carro_id: carroMixId,
    occurred_on: '2026-08-01',
    odometro_km: 60000,
    litros: 30,
    tanque_cheio: true,
    amount_cents: 18000,
  })
  if (mixOpenErr) throw new Error(`seed mix opening failed: ${mixOpenErr.message}`)

  // tx manual tagueada (gasto manual no carro — NÃO é vínculo reverso, é cadastro direto)
  const { error: mixManualTxErr } = await a.from('transactions').insert({
    user_id: userA.id,
    amount_cents: 18000,
    occurred_on: '2026-08-01',
    description: 'abastecimento manual',
    carro_id: carroMixId,
  })
  if (mixManualTxErr) throw new Error(`seed mix manual tx failed: ${mixManualTxErr.message}`)
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('CAR-12 (1): parcelado custo contado UMA vez nas views, qualquer que seja o nº de parcelas vinculadas (P26 D-05)', () => {
  it('vincular 1, depois 2, depois 3 parcelas em abastecimento_parcelas NÃO altera o custo (= valor_total_cents)', async () => {
    const a = userClient(userA.jwt, config) // RLS-active (security_invoker scopes to A)

    // Baseline: ZERO parcelas vinculadas → o custo já é valor_total_cents (o cost CASE lê
    // do próprio abastecimento, não da junção).
    expect(await readParceladoCusto(userA.jwt)).toBe(PARCELADO_VALOR_TOTAL_C)

    // Vincula incrementalmente 3 parcelas (cada uma = uma linha na junção + uma tx com seu
    // próprio cash-flow), exatamente como o link-write do Plano 03 faria. Após CADA passo
    // o custo na view continua valor_total_cents — UMA vez, nunca 2V/3V.
    for (const parcelaNum of [1, 2, 3]) {
      const txId = await seedTx(userA.jwt, userA.id, PARCELA_CASH_C, `parcela ${parcelaNum}/3`)
      const { error: linkErr } = await a.from('abastecimento_parcelas').insert({
        user_id: userA.id,
        abastecimento_id: abParceladoId,
        transaction_id: txId,
        parcela_num: parcelaNum,
      })
      expect(linkErr).toBeNull()

      // Held-out: parcelasVinculadas variou (1→2→3), o custo na view é a INVARIANTE.
      const custo = await readParceladoCusto(userA.jwt)
      expect(custo).toBe(PARCELADO_VALOR_TOTAL_C)
      // Nunca um múltiplo do nº de parcelas (a junção NÃO recompõe valor_total_cents).
      expect(custo).not.toBe(PARCELADO_VALOR_TOTAL_C + parcelaNum * PARCELA_CASH_C)
      expect(custo).not.toBe(parcelaNum * PARCELA_CASH_C)
    }

    // E o agregado de v_carro_resumo também conta o custo do intervalo UMA vez no preço/litro.
    const { data: resumo, error: resErr } = await a
      .from('v_carro_resumo')
      .select('preco_litro_medio_cents, km_por_litro_medio')
      .eq('carro_id', carroParceladoId)
    expect(resErr).toBeNull()
    expect((resumo ?? []).length).toBe(1)
    // preço/litro médio = Σcusto_intervalo ÷ Σlitros = 60000 / 40 = 1500 cents/L (UMA vez).
    expect(Number(resumo![0]!.preco_litro_medio_cents)).toBeCloseTo(
      PARCELADO_VALOR_TOTAL_C / PARCELADO_LITROS,
      4,
    )
  })
})

describe('CAR-12 (2): à-vista vinculado usa o REAL via coalesce, sem double-count', () => {
  it('vincular um lançamento à-vista conta amount_cents REAL UMA vez (coalesce real over esperado)', async () => {
    const a = userClient(userA.jwt, config)

    // Antes do vínculo: o custo é o ESPERADO (amount_cents do abastecimento).
    const before = await a
      .from('v_abastecimento_consumo')
      .select('custo_intervalo_cents')
      .eq('carro_id', carroAvistaId)
    expect(before.error).toBeNull()
    expect((before.data ?? []).length).toBe(1)
    expect(Number(before.data![0]!.custo_intervalo_cents)).toBe(AVISTA_ESPERADO_C)

    // Vincula um lançamento real (a tx com seu PRÓPRIO amount_cents) — espelha o link
    // à-vista do Plano 03: update abastecimentos.transaction_id.
    const txRealId = await seedTx(userA.jwt, userA.id, AVISTA_REAL_C, 'lançamento à-vista real')
    const { error: linkErr } = await a
      .from('abastecimentos')
      .update({ transaction_id: txRealId })
      .eq('id', abAvistaCloseId)
    expect(linkErr).toBeNull()

    // Depois do vínculo: a view usa coalesce(t.amount_cents, a.amount_cents) → o REAL,
    // UMA vez. NÃO é esperado+real somados (90000) nem o esperado (30000).
    const after = await a
      .from('v_abastecimento_consumo')
      .select('custo_intervalo_cents')
      .eq('carro_id', carroAvistaId)
    expect(after.error).toBeNull()
    expect((after.data ?? []).length).toBe(1)
    const custo = Number(after.data![0]!.custo_intervalo_cents)
    expect(custo).toBe(AVISTA_REAL_C) // o real, uma vez
    expect(custo).not.toBe(AVISTA_ESPERADO_C + AVISTA_REAL_C) // não somado (double-count)
    expect(custo).not.toBe(AVISTA_ESPERADO_C) // o real prevaleceu sobre o esperado
  })
})

describe('CAR-12 (3): km/l usa SÓ litros + odômetro — estável sob vínculo e existente sem fatura', () => {
  it('km_por_litro = Δodômetro ÷ Σlitros, idêntico antes/depois de vincular parcelas (o custo não entra)', async () => {
    const a = userClient(userA.jwt, config)
    // O carro parcelado já teve 3 parcelas vinculadas (it 1). km/l deve ser Δkm ÷ litros,
    // NÃO afetado pela presença/ausência das parcelas na junção.
    const { data, error } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, litros_intervalo, km_por_litro')
      .eq('carro_id', carroParceladoId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
    const row = data![0]!
    expect(Number(row.km_rodados)).toBe(PARCELADO_DELTA_KM)
    expect(Number(row.litros_intervalo)).toBe(PARCELADO_LITROS)
    // km/l = 500 / 40 = 12.5 — derivado SÓ de litros + odômetro.
    expect(Number(row.km_por_litro)).toBeCloseTo(PARCELADO_DELTA_KM / PARCELADO_LITROS, 4)
  })

  it('um abastecimento SEM nenhuma fatura vinculada ainda produz km_por_litro não-null', async () => {
    const a = userClient(userA.jwt, config)
    // Semeia um carro novo cujos fills têm amount_cents (estimativa manual) mas SEM
    // transaction_id e SEM parcelas — ou seja, NENHUMA fatura vinculada. (O CHECK
    // abastecimentos_cost_xor exige amount_cents OU transaction_id no à-vista: "sem fatura
    // vinculada" = transaction_id null, custo só pela estimativa manual.) O km/l vem SÓ de
    // litros + odômetro e existe mesmo sem fatura.
    const { data: carro, error: carroErr } = await a
      .from('carros')
      .insert({ user_id: userA.id, apelido: 'Sem Fatura' })
      .select('id')
      .single()
    expect(carroErr).toBeNull()
    const carroSemFaturaId = carro!.id

    const { error: abErr } = await a.from('abastecimentos').insert([
      {
        user_id: userA.id,
        carro_id: carroSemFaturaId,
        occurred_on: '2026-09-01',
        odometro_km: 70000,
        litros: 30,
        tanque_cheio: true,
        amount_cents: 18000, // estimativa manual; transaction_id null = sem fatura vinculada
      },
      {
        user_id: userA.id,
        carro_id: carroSemFaturaId,
        occurred_on: '2026-09-15',
        odometro_km: 70600, // +600 km, 40 L → 15 km/l, SEM nenhuma fatura vinculada
        litros: 40,
        tanque_cheio: true,
        amount_cents: 24000, // estimativa manual; sem transaction_id, sem parcelas
      },
    ])
    expect(abErr).toBeNull()

    // Garante que NENHUM fill deste carro tem fatura vinculada (transaction_id null) nem
    // parcelas na junção — o km/l abaixo existe sem nenhuma fatura.
    const { data: fills } = await a
      .from('abastecimentos')
      .select('id, transaction_id, parcelas_total')
      .eq('carro_id', carroSemFaturaId)
    expect((fills ?? []).every((f) => f.transaction_id === null && f.parcelas_total === null)).toBe(
      true,
    )

    const { data, error } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, km_por_litro, reais_por_km, custo_intervalo_cents')
      .eq('carro_id', carroSemFaturaId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
    const row = data![0]!
    // km/l existe SEM fatura vinculada: 600 / 40 = 15 — derivado SÓ de litros + odômetro.
    expect(row.km_por_litro).not.toBeNull()
    expect(Number(row.km_por_litro)).toBeCloseTo(600 / 40, 4)
    expect(Number(row.km_rodados)).toBe(600)
  })
})

describe('CAR-12 (4): manuais + vinculados ambos refletidos no consumo agregado', () => {
  it('um carro com abastecimento manual E um vinculado mostra AMBOS no gasto de v_carro_resumo', async () => {
    const a = userClient(userA.jwt, config)

    // Estado inicial: só o gasto manual (a tx tagueada do beforeAll).
    const baseline = await a
      .from('v_carro_resumo')
      .select('gasto_total_cents')
      .eq('carro_id', carroMixId)
    expect(baseline.error).toBeNull()
    expect((baseline.data ?? []).length).toBe(1)
    const gastoManual = Number(baseline.data![0]!.gasto_total_cents)
    expect(gastoManual).toBe(18000) // só o manual até aqui

    // Agora vincula um abastecimento (à-vista): a tx ganha carro_id (sync do Plano 03) e
    // entra no gasto agregado — JUNTO do manual, ambos refletidos.
    const txVinculadaId = await seedTx(userA.jwt, userA.id, 25000, 'fatura vinculada')
    const { error: tagErr } = await a
      .from('transactions')
      .update({ carro_id: carroMixId }) // sync de carro_id que o link-write faz
      .eq('id', txVinculadaId)
    expect(tagErr).toBeNull()

    const after = await a
      .from('v_carro_resumo')
      .select('gasto_total_cents')
      .eq('carro_id', carroMixId)
    expect(after.error).toBeNull()
    expect((after.data ?? []).length).toBe(1)
    // AMBOS no consumo agregado: manual (18000) + vinculado (25000) = 43000.
    expect(Number(after.data![0]!.gasto_total_cents)).toBe(18000 + 25000)
  })
})
