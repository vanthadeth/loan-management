import { useState, type ReactNode } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@shared/app/auth'
import { dn, useBanks, useTeam } from '@shared/data/core'
import { errMsg, useLoanActions, useLoanFiles, useLoans } from '@shared/data/loans'
import { dueParts } from '@shared/data/money'
import { loanTotals } from '@shared/lib/calc'
import { fmt, fmtD, loanCode } from '@shared/lib/format'
import type { LoanStatus } from '@shared/lib/types'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Btn, Card, Chip, Collapse, Divider, Empty, IconBtn, KV, Row, Tap, Tic } from '../ui/core'
import { TextArea } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { PickBox } from '../ui/Pickers'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { FileView } from './loans/FileView'
import { SupervisorSheet } from './loans/SupervisorSheet'
import { Bar, Ring, useBorrowerName } from './parts'

const STEPS: LoanStatus[] = ['drafted', 'requested', 'approved']
type Dialog = 'submit' | 'delete' | 'return' | 'reset' | 'approve' | 'reject' | 'supervisor' | 'collector' | 'void' | 'restore' | null

/** Bold text inside a sentence. */
const B = ({ children }: { children: ReactNode }) => <T b>{children}</T>

export function LoanDetail({ loanId }: { loanId: number }) {
  const { t } = useI18n()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { can, scoped, me } = useAuth()
  const toast = useToast()
  const bname = useBorrowerName()
  const { views, voidedViews, loading, error } = useLoans()
  const team = useTeam()
  const banks = useBanks()
  const files = useLoanFiles(loanId)
  const actions = useLoanActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const title = Number.isFinite(loanId) ? loanCode(loanId) : 'Loan'

  const v = views.find((x) => x.loan.id === loanId) ?? voidedViews.find((x) => x.loan.id === loanId)
  if (!v) return <Screen title={title}><T muted>{loading ? 'Loading…' : error ?? 'Loan not found.'}</T></Screen>

  const { loan, status, terms, payments, borrower } = v
  const name = bname(borrower)
  const cur = loan.currency
  const approved = loan.status === 'approved'
  const si = STEPS.indexOf(loan.status)
  const who = (id: string | null) => (id ? dn((team.data ?? []).find((p) => p.id === id)) : null)
  const { fee, net } = loanTotals(terms)
  const collected = status.collected
  const gain = fee + status.total - loan.amount
  const bank = (banks.data ?? []).find((b) => b.id === loan.bank_account_id)
  const payText = loan.pay_method === 'bank' ? 'Bank' + (bank ? ` · ${bank.bank} ${bank.account_no}` : '')
    : loan.pay_method === 'other' ? 'Other' + (loan.pay_remarks ? ` · ${loan.pay_remarks}` : '') : 'Cash'
  const collaterals = files.data?.collaterals ?? []
  const attachments = files.data?.attachments ?? []
  const voided = !!loan.voided_at
  const mine = loan.status === 'drafted' && loan.requested_by === me?.id && can('loans.create')
  const canApprove = !voided && loan.status === 'requested' && can('loans.approve')
  const canReturn = !voided && (loan.status === 'requested' || loan.status === 'rejected') && (can('loans.create') || can('loans.approve'))
  const canVoid = !voided && can('loans.void')
  const canReset = !voided && loan.status === 'approved' && can('loans.approve') && payments.length === 0
  const next = approved && !voided ? status.rows.find((r) => r.state !== 'paid') : undefined
  const phone = (borrower?.phone ?? '').replace(/[^\d+]/g, '')
  const pct = Math.round((status.paidCount / loan.occurrences) * 100)
  const lateRate = `${Number(loan.late_fee_pct)}%`
  const lateUnit = loan.frequency === 'daily' ? 'day' : loan.frequency === 'weekly' ? 'week' : loan.frequency === 'monthly' ? 'month' : `${loan.interval_days}-day period`
  const end = status.done ? status.rows[status.rows.length - 1].paidOn : status.rows[status.rows.length - 1].due
  const balance = fee + collected + status.lateFeePaid - loan.amount
  const pay = () => router.push(`/cashflow/pay?loan=${loan.id}`)

  const move = (to: LoanStatus, done: string) => async () => {
    try {
      await actions.setStatus(loan.id, loan.status, to)
      toast(done)
      setDialog(null)
    } catch (e) {
      toast(errMsg(e))
    }
  }
  const leave = () => router.replace('/loans')

  const line = (k: string, val: string, color?: string, bold = true) => (
    <Row key={k} between style={{ paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }}>
      <T style={{ flex: 1 }}>{k}</T><T num b={bold} color={color}>{val}</T>
    </Row>
  )

  return (
    <Screen
      title={title}
      contentStyle={canApprove ? { paddingBottom: 110 } : undefined}
      overlay={canApprove ? (
        <Row style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + insets.bottom, backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hair }}>
          <Btn kind="primary" label="Approve" onPress={() => setDialog('approve')} style={{ flex: 1 }} />
          <Btn kind="danger" label="Deny" onPress={() => { setReason(''); setDialog('reject') }} style={{ flex: 1 }} />
        </Row>
      ) : null}
    >
      <Card>
        <Row between style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}><T v="eyebrow">{loanCode(loan.id)}</T><T v="h1">{name}</T></View>
          <T b num size={20}>{fmt(loan.amount, cur)}</T>
        </Row>
        {loan.status === 'rejected'
          ? <View style={{ marginVertical: 8, gap: 8 }}><Chip kind="overdue" label="Denied" />{!!loan.reject_reason && <T>Reason: {loan.reject_reason}</T>}</View>
          : (
            <Row gap={6} style={{ marginVertical: 8 }}>
              {STEPS.map((k, i) => {
                const done = i < si
                const now = i === si
                const col = done ? c.paidText : now ? c.accentText : c.muted
                return (
                  <Row key={k} gap={6} style={i < 2 ? { flex: 1 } : null}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.paid : now ? c.accent : c.surface2, borderWidth: 1, borderColor: done ? c.paid : now ? c.accent : c.line }}>
                      <T b size={12} color={done ? '#fff' : now ? c.accentInk : c.ink}>{done ? '✓' : i + 1}</T>
                    </View>
                    <T b={600} size={13} color={col}>{t(k)}</T>
                    {i < 2 && <View style={{ flex: 1, minWidth: 10, height: 2, backgroundColor: c.line }} />}
                  </Row>
                )
              })}
            </Row>
          )}
        {(mine || canReturn || canReset || canVoid) && (
          <Row gap={8} wrap>
            {mine && (
              <>
                <Btn kind="primary" label="Submit request" onPress={() => setDialog('submit')} />
                <Btn label="Edit draft" onPress={() => router.push(`/loans/new?draft=${loan.id}`)} />
                <Btn kind="danger" label="Delete draft" onPress={() => setDialog('delete')} />
              </>
            )}
            {canReturn && <Btn label="Draft" onPress={() => setDialog('return')} />}
            {canReset && <Btn label="Reset approval" onPress={() => setDialog('reset')} />}
            {canVoid && <Btn kind="danger" label="Void" onPress={() => { setReason(''); setDialog('void') }} />}
          </Row>
        )}
        <View style={{ gap: 12, marginTop: 6 }}>
          <KV label="Workflow">
            <View style={{ gap: 6, marginTop: 2 }}>
              {([['Created by', who(loan.requested_by)], ['Approved', who(loan.approved_by)]] as const).map(([k, p]) => (
                <Row key={k} gap={8} style={{ opacity: p ? 1 : 0.6 }}>
                  <Icon name="userp" size={18} />
                  <T muted style={{ minWidth: 78 }}>{k}</T><T b>{p ?? 'Pending'}</T>
                </Row>
              ))}
            </View>
          </KV>
          <Divider />
          <KV label="Repayment">{`${loan.frequency === 'custom' ? `Every ${loan.interval_days} days` : loan.frequency} × ${loan.occurrences} · ${loan.mode === 'equal' ? 'interest + principal ÷ n' : 'interest only, principal at end'}`}</KV>
          <Divider />
          <KV label="Interest">{`${loan.rate_pct}% per ${loan.rate_basis} (flat)`}</KV>
          <Divider />
          <Row gap={16}>
            {([
              ['Supervisor', who(loan.supervisor_id), !scoped && can('loans.approve') && !voided, 'supervisor'],
              ['Collector', who(loan.collector_id), can('loans.approve') && !voided, 'collector'],
            ] as const).map(([k, p, canEdit, dlg]) => (
              <Row key={k} gap={6} style={{ flex: 1 }}>
                <KV label={k} style={{ flex: 1 }}><T ell>{p ?? 'Not assigned'}</T></KV>
                {canEdit && <IconBtn name="edit" size={34} label={`Change ${k.toLowerCase()}`} bg="transparent" color={c.accent} onPress={() => setDialog(dlg)} />}
              </Row>
            ))}
          </Row>
          <Divider />
          <KV label="Late fee">{`${lateRate} per late ${lateUnit}`}</KV>
          <Divider />
          <KV label="Borrower pays by">{payText}</KV>
          <Divider />
          <KV label="Collateral">{collaterals.length ? collaterals.map((x) => x.description).join(', ') : 'None'}</KV>
        </View>
      </Card>

      {voided && (
        <Card style={{ borderColor: c.late, borderWidth: 1 }}>
          <T b color={c.late}>Voided</T>
          <T v="small" muted>{fmtD(loan.voided_at)} by {dn(team.data?.find((p) => p.id === loan.voided_by))}. Hidden from everyone else and left out of every total.</T>
          {!!loan.void_reason && <T>Reason: {loan.void_reason}</T>}
          {can('loans.void') && <Btn icon="refresh" label="Restore loan" onPress={() => setDialog('restore')} style={{ alignSelf: 'flex-start' }} />}
        </Card>
      )}

      <Tap onPress={() => router.push(`/loans/${loan.id}/contract`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
        <Tic name="doc" />
        <View style={{ flex: 1 }}><T b>Contract</T><T v="small" muted>Make the printable contract (PDF)</T></View>
        <Icon name="chev" size={16} color={c.muted} />
      </Tap>

      {next && (
        <Card>
          <T v="eyebrow">Next installment</T>
          <Row between>
            <T b num size={18}>#{next.i} · {fmt(dueParts(next).remaining + next.lateFee, cur)}</T>
            <Chip kind={next.state === 'overdue' ? 'overdue' : 'drafted'} label={next.state === 'overdue' ? `${next.lateDays}d late` : fmtD(next.due)} />
          </Row>
          {next.lateFee > 0 && <T v="small" muted>Includes a late fee of {fmt(next.lateFee, cur)} ({next.lateOccurrences} × {lateRate}).</T>}
          <Row gap={8} wrap>
            {can('payments.record') && <Btn kind="primary" label="Record payment" onPress={pay} />}
            {!!phone && <Btn icon="phone" label="Call" onPress={() => Linking.openURL('tel:' + phone)} />}
          </Row>
        </Card>
      )}

      <Collapse title="Attachments">
        {can('loans.create') && (
          <PickBox hint="Add photos or PDF files to this loan." multiple files onPick={async (picked) => {
            if (!picked.length) return
            try {
              await actions.addAttachments(loan.id, picked)
              toast(picked.length > 1 ? 'Files added' : 'File added')
            } catch (err) {
              toast(errMsg(err))
            }
          }} />
        )}
        {attachments.map((a) => {
          const col = collaterals.find((x) => x.id === a.collateral_id)
          return (
            <Row key={a.id} style={{ paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
              <View style={{ width: 38, height: 38, borderRadius: 4, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={/\.pdf$/i.test(a.file_name || a.file_path) ? 'pdf' : 'camera'} size={18} color={c.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T b ell>{col ? 'Collateral: ' + col.description : 'Attachment'}</T>
                <T v="small" muted ell>{a.file_name || a.file_path.split('/').pop()}</T>
              </View>
              <FileView path={a.file_path} />
            </Row>
          )
        })}
        {!attachments.length && <T muted>No attachments yet.</T>}
      </Collapse>

      <Card>
        <Row between>
          <T v="h2">{t('progress')}</T>
          <Row gap={8}><T v="small" muted num>{status.paidCount}/{loan.occurrences}</T><Ring p={pct} size={46} color={c.paid} stroke={6} /></Row>
        </Row>
        <Bar rows={status.rows} flagLate={approved} />
        <Row gap={14} wrap>
          {([[c.paid, 'Paid'], [c.remain, 'Remaining'], [c.late, t('overdue')]] as const).map(([col, l]) => (
            <Row key={l} gap={5}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: col }} /><T v="small" muted>{l}</T></Row>
          ))}
        </Row>
        <View>
          {line(t('loaned'), fmt(loan.amount, cur))}
          {line(t('collected'), fmt(collected, cur), c.paidText)}
          {line(t('remaining'), fmt(status.remaining, cur))}
          {approved && status.lateFeeOutstanding > 0 && line('Late fee due', fmt(status.lateFeeOutstanding, cur), c.late)}
        </View>
        <Row gap={16}>
          <KV label={t('start')} style={{ flex: 1 }}>{fmtD(loan.release_date)}</KV>
          <KV label={t('end')} style={{ flex: 1 }}>{fmtD(end) + (status.done ? '' : ' (expected)')}</KV>
        </Row>
      </Card>

      <Collapse title={t('summary')}>
        <View>
          {line(t('loaned'), '−' + fmt(loan.amount, cur), c.late, false)}
          {line(`${t('fee')} (${loan.fee_pct}%)`, '+' + fmt(fee, cur), c.paidText, false)}
          {line(t('collected'), '+' + fmt(collected, cur), c.paidText, false)}
          {status.lateFeePaid > 0 && line('Late fees', '+' + fmt(status.lateFeePaid, cur), c.paidText, false)}
          <Row between style={{ paddingVertical: 10, paddingHorizontal: 8, backgroundColor: c.surface2, borderRadius: 4, marginTop: 4 }}>
            <T b={600}>{t('balance')}</T><T b={600} num color={balance < 0 ? c.late : c.paidText}>{fmt(balance, cur)}</T>
          </Row>
          <View style={{ height: 14 }} />
          {line(t('tbc'), '+' + fmt(status.remaining, cur), c.paidText, false)}
          <Row between style={{ paddingVertical: 10, paddingHorizontal: 8, backgroundColor: c.surface2, borderRadius: 4, marginTop: 4 }}>
            <T b={600}>{t('ugl')}</T><T b={600} num color={gain < 0 ? c.late : c.paidText}>{gain >= 0 ? '+' : ''}{fmt(gain, cur)}</T>
          </Row>
        </View>
        <T v="small" muted>Service fee is deducted at release: borrower receives {fmt(net, cur)}.</T>
      </Collapse>

      <Collapse title={t('schedule')}>
        {status.rows.map((r) => <ScheduleRow key={r.i} r={r} cur={cur} rate={`${loan.rate_pct}% ${loan.rate_basis}`} lateRate={lateRate}
          onCollect={approved && !voided && can('payments.record') ? pay : undefined} />)}
        <T v="small" muted>Late fee: {lateRate} of the unpaid installment for every {lateUnit} it is late, as agreed in this contract.</T>
      </Collapse>

      <Collapse title={t('payments')}>
        {approved && !voided && can('payments.record') && <Btn sm kind="primary" label={'+ ' + t('record')} onPress={pay} style={{ alignSelf: 'flex-end' }} />}
        {[...payments].reverse().map((p) => (
          <Row key={p.id} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T b>{fmtD(p.paid_on)}</T>
              {(p.late_fee > 0 || !!p.note) && <T v="small" muted>{[p.late_fee > 0 ? `incl. ${fmt(p.late_fee, cur)} late fee` : '', p.note].filter(Boolean).join(' · ')}</T>}
            </View>
            {p.photo_path && <FileView path={p.photo_path} label="Photo" />}
            <T b num color={c.paidText}>+{fmt(p.amount, cur)}</T>
          </Row>
        ))}
        {!payments.length && <Empty>No payments yet.</Empty>}
      </Collapse>

      {dialog === 'void' && (
        <Sheet title="Void this loan?" onClose={() => setDialog(null)} action={{
          label: 'Void loan', kind: 'danger', disabled: !reason.trim(),
          onClick: async () => {
            try { await actions.voidLoan(loan.id, reason.trim()); toast('Loan voided'); setDialog(null); leave() } catch (e) { toast(errMsg(e)) }
          },
        }}>
          <T>Voiding <B>{loanCode(loan.id)}</B> ({name}) hides it from everyone, including its payments, and removes it from every total and report. It stays on record and you can restore it later.</T>
          <TextArea label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'restore' && (
        <Sheet title="Restore this loan?" onClose={() => setDialog(null)} action={{
          label: 'Restore loan',
          onClick: async () => { try { await actions.restoreLoan(loan.id); toast('Loan restored'); setDialog(null) } catch (e) { toast(errMsg(e)) } },
        }}>
          <T>Show <B>{loanCode(loan.id)}</B> again in lists and totals?</T>
        </Sheet>
      )}
      {dialog === 'submit' && (
        <Sheet title="Submit loan request?" onClose={() => setDialog(null)} action={{ label: 'Confirm and submit', onClick: move('requested', 'Loan request submitted') }}>
          <T>Submit <B>{loanCode(loan.id)}</B> for <B>{name}</B>? It will then wait for approval and can no longer be edited.</T>
        </Sheet>
      )}
      {dialog === 'return' && (
        <Sheet title="Draft?" onClose={() => setDialog(null)} action={{
          label: 'Draft',
          onClick: async () => { try { await actions.setStatus(loan.id, loan.status, 'drafted'); toast('Loan is a draft again'); setDialog(null); leave() } catch (e) { toast(errMsg(e)) } },
        }}>
          <T>Move <B>{loanCode(loan.id)}</B> for <B>{name}</B> back to a draft so it can be edited? It is private to the person who created it until it is requested again.</T>
        </Sheet>
      )}
      {dialog === 'reset' && (
        <Sheet title="Reset approval?" onClose={() => setDialog(null)} action={{ label: 'Reset approval', onClick: move('requested', 'Approval reset. The loan is requested again') }}>
          <T>Take back the approval of <B>{loanCode(loan.id)}</B> for <B>{name}</B>? It goes back to requested and has to be approved again. This is only possible before any payment is recorded.</T>
        </Sheet>
      )}
      {dialog === 'delete' && (
        <Sheet title="Delete draft?" onClose={() => setDialog(null)} action={{
          label: 'Delete draft', kind: 'danger',
          onClick: async () => { try { await actions.deleteDraft(loan.id); toast('Draft deleted'); setDialog(null); leave() } catch (e) { toast(errMsg(e)) } },
        }}>
          <T>Delete the draft <B>{loanCode(loan.id)}</B> for <B>{name}</B>? This cannot be undone.</T>
        </Sheet>
      )}
      {dialog === 'approve' && (
        <Sheet title="Approve loan?" onClose={() => setDialog(null)} action={{ label: 'Confirm approve', onClick: move('approved', 'Loan approved') }}>
          <T>Approve <B>{loanCode(loan.id)}</B> for <B>{name}</B>? <B>{fmt(net, cur)}</B> is released on <B>{fmtD(loan.release_date)}</B> after the service fee.</T>
        </Sheet>
      )}
      {dialog === 'reject' && (
        <Sheet title="Deny loan?" onClose={() => setDialog(null)} action={{
          label: 'Confirm deny', kind: 'danger', disabled: !reason.trim(),
          onClick: async () => { try { await actions.setStatus(loan.id, loan.status, 'rejected', { reject_reason: reason.trim() }); toast('Loan denied'); setDialog(null) } catch (e) { toast(errMsg(e)) } },
        }}>
          <T>Deny <B>{loanCode(loan.id)}</B> for <B>{name}</B>? It can be returned to a draft and edited afterwards.</T>
          <TextArea label="Reason (required)" value={reason} onChange={setReason} />
        </Sheet>
      )}
      {dialog === 'collector' && <SupervisorSheet kind="collector" loanId={loan.id} current={loan.collector_id} onClose={() => setDialog(null)} />}
      {dialog === 'supervisor' && <SupervisorSheet loanId={loan.id} current={loan.supervisor_id} onClose={() => setDialog(null)} />}
    </Screen>
  )
}

type Installment = ReturnType<typeof useLoans>['views'][number]['status']['rows'][number]

/** One installment; tap to see how it is made up. */
function ScheduleRow({ r, cur, rate, lateRate, onCollect }: { r: Installment; cur: 'KHR' | 'USD'; rate: string; lateRate: string; onCollect?: () => void }) {
  const c = useColors()
  const [open, setOpen] = useState(false)
  const late = r.state === 'overdue'
  const chip = r.state === 'paid' ? <Chip kind="approved" label="Paid" />
    : late ? <Chip kind="overdue" label={`${r.lateDays}d late`} />
      : r.state === 'partial' ? <Chip kind="requested" label="Partial" />
        : <Chip kind="requested" label="Pending" />
  const pair = (k: string, val: string, color?: string, top?: boolean) => (
    <Row between style={top ? { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 } : null}>
      <T size={14} color={color} b={top ? 700 : 400} style={{ flex: 1 }}>{k}</T><T size={14} b num color={color}>{val}</T>
    </Row>
  )
  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }}>
      <Tap onPress={() => setOpen(!open)} accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
        <T style={{ flex: 1 }}><T b color={late ? c.late : c.ink}>#{r.i}</T><T muted> · {fmtD(r.due)}</T></T>
        <T b num>{fmt(r.total, cur)}</T>
        {r.state === 'paid'
          ? <View accessibilityLabel="Paid" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.paidSoft, alignItems: 'center', justifyContent: 'center' }}><T b color={c.paidText}>✓</T></View>
          : onCollect && <IconBtn name="wallet" size={34} label={`Collect installment ${r.i}`} bg={c.accent} color={c.accentInk} onPress={onCollect} />}
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><Icon name="chev" size={14} color={c.muted} /></View>
      </Tap>
      {open && (
        <View style={{ gap: 8, paddingBottom: 12 }}>
          <Row between><T v="small" muted>Status</T>{chip}</Row>
          <View style={{ backgroundColor: c.surface2, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12, gap: 6 }}>
            {pair('Principal', fmt(r.principal, cur))}
            {pair(`Interest (${rate}, flat)`, fmt(r.interest, cur))}
            {r.lateFee > 0 && pair(`Late fee (${r.lateOccurrences} × ${lateRate})`, fmt(r.lateFee, cur), c.late)}
            {pair('Total', fmt(r.total + r.lateFee, cur), undefined, true)}
          </View>
        </View>
      )}
    </View>
  )
}
