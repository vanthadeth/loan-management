import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { bname } from '@shared/data/borrowers'
import { completedOn, useLoans } from '@shared/data/loans'
import { fmtD, loanCode } from '@shared/lib/format'
import type { LoanStatus } from '@shared/lib/types'
import { useI18n } from '../lib/i18n'
import { Btn, Empty, LCard, Row } from '../ui/core'
import { DateField, Fab, SearchBar } from '../ui/Controls'
import { Screen } from '../ui/Screen'
import { T } from '../ui/Text'
import { LoanRow, Tile } from './parts'

export function Loans() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const { views, voidedViews, loading, error } = useLoans()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = views.filter((v) => v.active && (loanCode(v.loan.id) + bname(v.borrower, lang)).toLowerCase().includes(needle))
  const nDrafts = views.filter((v) => v.loan.status === 'drafted').length
  const nPending = views.filter((v) => v.loan.status === 'requested').length
  const nDone = views.filter((v) => v.done).length
  const needsApproval = can('loans.approve') && nPending > 0

  return (
    <Screen overlay={can('loans.create') ? <Fab label={t('newLoan')} onPress={() => router.push('/loans/new')} /> : null}>
      <SearchBar value={q} onChange={setQ} />
      <Row gap={14} style={{ alignItems: 'stretch' }}>
        <Tile style={{ flex: 1 }} icon="doc" label={t('drafted')} value={nDrafts} sub="Your saved drafts" onPress={() => router.push('/loans/queue/drafts')} />
        <Tile style={{ flex: 1 }} icon="checkc" label="Pending approval" value={nPending} sub="Requested, waiting for approval" dot={needsApproval} onPress={() => router.push('/loans/queue/requested')} />
      </Row>
      {error && <T muted>{error}</T>}
      <T v="eyebrow">{rows.length} active {rows.length === 1 ? 'loan' : 'loans'}</T>
      <LCard>
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!rows.length && <Empty>{loading ? 'Loading…' : 'No active loans.'}</Empty>}
      </LCard>
      {nDone > 0 && <Btn block icon="clock" label={`Loans history (${nDone})`} onPress={() => router.push('/loans/history')} style={{ marginTop: 0 }} />}
      {can('loans.void') && voidedViews.length > 0 && (
        <Btn block icon="ban" label={`Voided loans (${voidedViews.length})`} onPress={() => router.push('/loans/voided')} style={{ marginTop: 0 }} />
      )}
    </Screen>
  )
}

const QUEUES: Record<string, { title: string; status: LoanStatus; hint: string }> = {
  drafts: { title: 'Drafts', status: 'drafted', hint: 'Saved by you, not yet requested' },
  requested: { title: 'Pending approval', status: 'requested', hint: 'Requested, waiting for approval' },
}

export function LoanQueue({ kind }: { kind: string }) {
  const { t } = useI18n()
  const { can } = useAuth()
  const { views, loading, error } = useLoans()
  const queue = QUEUES[kind] ?? QUEUES.drafts
  const rows = views.filter((v) => v.loan.status === queue.status)
  return (
    <Screen title={queue.title} overlay={can('loans.create') ? <Fab label={t('newLoan')} onPress={() => router.push('/loans/new')} /> : null}>
      <T v="small" muted>{queue.hint}.</T>
      {error && <T muted>{error}</T>}
      <LCard>
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!rows.length && <Empty>{loading ? 'Loading…' : 'Nothing here right now.'}</Empty>}
      </LCard>
    </Screen>
  )
}

export function LoanHistory() {
  const { lang } = useI18n()
  const { views, loading, error } = useLoans()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = views.filter((v) => {
    if (!v.done || !(loanCode(v.loan.id) + bname(v.borrower, lang)).toLowerCase().includes(needle)) return false
    const end = completedOn(v)
    return (!from || end >= from) && (!to || end <= to)
  })
  return (
    <Screen title="Loans history">
      <SearchBar value={q} onChange={setQ} />
      <Row style={{ alignItems: 'flex-end' }}>
        <DateField label="Completed from" value={from} onChange={setFrom} style={{ flex: 1 }} />
        <DateField label="Completed to" value={to} onChange={setTo} style={{ flex: 1 }} />
      </Row>
      {(!!from || !!to) && <Btn sm icon="x" label="Clear dates" onPress={() => { setFrom(''); setTo('') }} style={{ alignSelf: 'flex-start' }} />}
      {error && <T muted>{error}</T>}
      <T v="eyebrow">{rows.length} completed {rows.length === 1 ? 'loan' : 'loans'}</T>
      <LCard>
        {rows.map((v) => <LoanRow key={v.loan.id} v={v} doneLabel={'Completed ' + fmtD(completedOn(v))} />)}
        {!rows.length && <Empty>{loading ? 'Loading…' : 'No completed loans match.'}</Empty>}
      </LCard>
    </Screen>
  )
}

/** Voided loans, newest first: visible only to people who may void loans. */
export function LoanVoided() {
  const { voidedViews, loading } = useLoans()
  return (
    <Screen title="Voided loans">
      <T v="small" muted>These loans are hidden from everyone else and left out of every total. Open one to see why it was voided or to restore it.</T>
      <LCard>
        {voidedViews.map((v) => (
          <View key={v.loan.id}>
            <LoanRow v={v} />
            {!!v.loan.void_reason && <T v="small" muted style={{ marginTop: -6, marginBottom: 10 }}>Reason: {v.loan.void_reason}</T>}
          </View>
        ))}
        {!voidedViews.length && <Empty>{loading ? 'Loading…' : 'No voided loans.'}</Empty>}
      </LCard>
    </Screen>
  )
}
