'use client'

import * as React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * PeriodTabs (UI-SPEC §1) — the Mensal / Anual (YTD) toggle on the dashboard. The two
 * panels are server-rendered (passed in as children) so both adherence views are read
 * RLS-scoped on the server; this client wrapper only owns the active-tab state. Mensal
 * is the default. Both panels share the same row layout for visible consistency
 * (BUD-03).
 */
export function PeriodTabs({
  mensalLabel,
  anualLabel,
  mensal,
  anual,
}: {
  mensalLabel: string
  anualLabel: string
  mensal: React.ReactNode
  anual: React.ReactNode
}) {
  return (
    <Tabs defaultValue="mensal" className="w-full">
      <TabsList>
        <TabsTrigger value="mensal">{mensalLabel}</TabsTrigger>
        <TabsTrigger value="anual">{anualLabel}</TabsTrigger>
      </TabsList>
      <TabsContent value="mensal" className="pt-4">
        {mensal}
      </TabsContent>
      <TabsContent value="anual" className="pt-4">
        {anual}
      </TabsContent>
    </Tabs>
  )
}
