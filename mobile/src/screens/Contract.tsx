import { useMemo, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { dn, useBanks, useTeam } from '@shared/data/core'
import { pickTemplate, useContractTemplates, useTemplateHtml } from '@shared/data/contract'
import { errMsg, useLoanFiles, useLoans } from '@shared/data/loans'
import type { ContractInput } from '@shared/lib/contract'
import { loanCode } from '@shared/lib/format'
import { ContractView, type FilledDoc } from '../contract/ContractView'
import { printHtml, sharePdf, shareText } from '../lib/share'
import { Btn, Card, Row } from '../ui/core'
import { Dropdown } from '../ui/Controls'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'

const BUILT_IN = '0'

export function Contract({ loanId }: { loanId: number }) {
  const toast = useToast()
  const { can } = useAuth()
  const { views, loading } = useLoans()
  const files = useLoanFiles(loanId)
  const team = useTeam()
  const banks = useBanks()
  const templates = useContractTemplates()
  const params = useLocalSearchParams<{ t?: string; s?: string }>()
  const all = templates.data ?? []
  const contracts = all.filter((x) => x.kind === 'contract')
  const schedules = all.filter((x) => x.kind === 'schedule')
  const chosen = pickTemplate(contracts, params.t ?? null)
  // the schedule annex: a separate template when one exists, otherwise the built-in annex from {{schedule}}
  const sParam = params.s ?? null
  const sched = sParam === BUILT_IN ? undefined : pickTemplate(schedules, sParam)
  const tpl = useTemplateHtml(chosen?.url)
  const stpl = useTemplateHtml(sched?.url)
  const [doc, setDoc] = useState<FilledDoc | null>(null)
  const [sdoc, setSdoc] = useState<FilledDoc | null>(null)
  const title = 'Contract'

  const v = views.find((x) => x.loan.id === loanId)
  const input = useMemo<ContractInput | null>(() => {
    if (!v || !v.borrower || !files.data) return null
    const bank = banks.data?.find((b) => b.id === v.loan.bank_account_id)
    const co = team.data?.find((p) => p.id === v.loan.collector_id)
    const sv = team.data?.find((p) => p.id === v.loan.supervisor_id)
    return {
      loanId, terms: v.terms, frequency: v.loan.frequency, payMethod: v.loan.pay_method,
      bank: bank ?? null, payRemarks: v.loan.pay_remarks,
      borrower: v.borrower, collaterals: files.data.collaterals.map((x) => x.description),
      supervisor: dn(sv), collector: dn(co),
      collectorName: { km: co?.full_name ?? '', latin: co?.name_latin ?? '' },
      supervisorName: { km: sv?.full_name ?? '', latin: sv?.name_latin ?? '' },
    }
  }, [v, files.data, banks.data, team.data, loanId])

  if (!v) return <Screen title={title}><T muted>{loading ? 'Loading…' : 'Loan not found.'}</T></Screen>
  if (templates.isLoading || tpl.loading || stpl.loading) return <Screen title={title}><T muted>Preparing the contract…</T></Screen>
  if (!chosen) {
    return (
      <Screen title={title}>
        <Card>
          <T v="h2">No contract template yet</T>
          <T muted>{can('settings.edit') ? 'Add a contract template from a Google Doc in Settings, then come back here.' : 'Ask an admin to set up the contract template in Settings.'}</T>
          {can('settings.edit') && <Btn kind="primary" icon="doc" label="Open Settings" onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />}
        </Card>
      </Screen>
    )
  }
  const err = tpl.error ?? stpl.error
  if (err) {
    return (
      <Screen title={title}>
        <Card>
          <T v="h2">Could not read the template</T>
          <T muted>{err}</T>
          <Btn icon="refresh" label="Try again" onPress={() => { void tpl.refetch(); void stpl.refetch() }} style={{ alignSelf: 'flex-start' }} />
        </Card>
      </Screen>
    )
  }

  const code = loanCode(loanId)
  const go = (t?: string, s?: string | null) => router.setParams({ t: t ?? params.t, s: s ?? sParam ?? undefined })
  const label = (x: { name: string; lang: string; is_default: boolean }) => `${x.name} (${x.lang === 'km' ? 'Khmer' : 'English'})${x.is_default ? ' · default' : ''}`
  const safely = (job: () => Promise<unknown>) => async () => { try { await job() } catch (e) { toast(errMsg(e)) } }
  return (
    <Screen title={title}>
      {contracts.length > 1 && (
        <Dropdown label="Contract template" options={contracts.map((x) => ({ value: String(x.id), label: label(x) }))} value={String(chosen.id)} onChange={(val) => go(val)} />
      )}
      {schedules.length > 0 && (
        <Dropdown label="Payment schedule template" options={[...schedules.map((x) => ({ value: String(x.id), label: label(x) })), { value: BUILT_IN, label: 'Built-in annex (from {{schedule}})' }]}
          value={sched ? String(sched.id) : BUILT_IN} onChange={(val) => go(undefined, val)} />
      )}
      <Row gap={8} wrap>
        <Btn kind="primary" icon="download" label="Download PDF" disabled={!doc}
          onPress={safely(async () => { if (doc) await sharePdf(`${code}-contract.pdf`, doc.print, doc.page) })} />
        {sdoc && <Btn icon="download" label="Schedule PDF" onPress={safely(() => sharePdf(`${code}-schedule.pdf`, sdoc.print, sdoc.page))} />}
        <Btn icon="doc" label="Contract (.doc)" disabled={!doc} onPress={safely(async () => { if (doc) await shareText(`${code}-contract.doc`, doc.word, 'application/msword', 'com.microsoft.word.doc') })} />
        {sdoc && <Btn icon="doc" label="Schedule (.doc)" onPress={safely(() => shareText(`${code}-schedule.doc`, sdoc.word, 'application/msword', 'com.microsoft.word.doc'))} />}
        <Btn label="Print contract" disabled={!doc} onPress={safely(async () => { if (doc) await printHtml(doc.print) })} />
        {sdoc && <Btn label="Print schedule" onPress={safely(() => printHtml(sdoc.print))} />}
      </Row>
      <T v="small" muted>Made from "{chosen.name}"{sched ? ` and the schedule template "${sched.name}"` : ''} with this loan's details. Any {'{{placeholder}}'} still showing in the text is not recognised; check its spelling in the template.</T>
      {doc && <T v="small" muted>Page: {doc.page.name}, {Math.round(doc.page.wMm)} × {Math.round(doc.page.hMm)} mm</T>}
      {input && tpl.html && <ContractView label="Contract" html={tpl.html} input={input} lang={chosen.lang} annexPage={!sched} onReady={setDoc} />}
      {input && stpl.html && sched && <ContractView label="Payment schedule" html={stpl.html} input={input} lang={sched.lang} annexPage={false} onReady={setSdoc} />}
    </Screen>
  )
}

export default function ContractRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Contract loanId={Number(id)} />
}
