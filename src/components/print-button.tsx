'use client'

import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * PrintButton — triggers the browser print dialog for the DASN report. The print
 * stylesheet (globals.css @media print) hides the shell/nav/actions and renders the
 * report card + disclaimer on white. (UI-SPEC §4 print affordance)
 */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden />
      Imprimir
    </Button>
  )
}
