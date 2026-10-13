import { useMemo, useState } from 'react'
import { Image, StyleSheet, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useBanks } from '@shared/data/core'
import type { LoanView } from '@shared/data/book'
import { amountText, amountToText, dueParts, openLoans, parseAmount, symbol, useMoneyData, useRecordPayment } from '@shared/data/money'
import { allocatePayment, todayIso } from '@shared/lib/calc'
import { fmt, fmtD, loanCode } from '@shared/lib/format'
import type { BankAccount } from '@shared/lib/types'
import type { PickedFile } from '../../lib/device'
import { useI18n } from '../../lib/i18n'
import { font, useColors } from '../../lib/theme'
import { Initials } from '../../ui/Avatar'
import { Chip, Empty, Item, Row, Tap } from '../../ui/core'
import { DateField, Dropdown, Label } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { PickBox, PickedRow } from '../../ui/Pickers'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/Text'
import { useToast } from '../../ui/Toast'
import { StepHead, Wizard } from '../../ui/Wizard'
import { useBorrowerName } from '../parts'

const STEPS = ['Contract', 'Payment', 'Review']
const CASH = 'Cash (no bank account)'
const bankLabel = (b: BankAccount) => `${b.bank} · ${b.account_no} · ${b.account_name}`

const nextRow = (v: LoanView) => v.status.rows.find((r) => r.state !== 'paid')
/** Next installment plus the late fee still owed on the contract. */
const owedNow = (v: LoanView) => {
  const r = nextRow(v)
  return (r ? dueParts(r).remaining : 0) + v.status.lateFeeOutstanding
}

type Dialog = null | 'cancel' | 'confirm'

export function PayWizard() {
  const { t } = useI18n()
  const c = useColors()
  const name = useBorrowerName()
  const toast = useToast()
  const params = useLocalSearchParams<{ loan?: string }>()
  const data = useMoneyData()
  const banks = useBanks()
  const rec = useRecordPayment()
  const open = useMemo(() => openLoans(data), [data])

  const first = Number(params.loan) || null
  const [step, setStep] = useState(first ? 1 : 0)
  const [loanId, setLoanId] = useState<number | null>(first)
  const [q, setQ] = useState('')
  const [bank, setBank] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [paidOn, setPaidOn] = useState(todayIso())
  const [photo, setPhoto] = useState<PickedFile | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const view = open.find((v) => v.loan.id === loanId)
  const at = view ? step : 0
  const cur = view?.loan.currency ?? 'KHR'
  const amountValue = amount ?? (view ? amountToText(owedNow(view), cur) : '')
  const bankValue = bank ?? (view?.loan.bank_account_id ? String(view.loan.bank_account_id) : '')
  const bankOptions = [{ value: '', label: CASH }, ...(banks.data ?? []).map((b) => ({ value: String(b.id), label: bankLabel(b) }))]
  const bankText = bankOptions.find((o) => o.value === bankValue)?.label ?? CASH
  const value = parseAmount(amountValue)

  const alloc = useMemo(() => {
    if (!view || !(value > 0)) return null
    return allocatePayment(view.terms, view.payments.map((p) => ({ amount: p.amount, lateFee: p.late_fee, paidOn: p.paid_on })), value, paidOn)
  }, [view, value, paidOn])

  const pick = (id: number) => {
    if (id !== loanId) { setPhoto(null); setAmount(null); setBank(null) }
    setLoanId(id)
    setStep(1)
  }

  const valid = (n: number) => {
    if (n === 0 && !view) { toast('Select a contract first'); return false }
    if (n === 1 && view) {
      if (!(value > 0)) { toast('Enter the amount received'); return false }
      if (!paidOn) { toast('Select the date paid'); return false }
      if (paidOn > todayIso()) { toast('The payment date cannot be in the future'); return false }
      if (paidOn < view.loan.release_date) { toast('The payment date is before the loan was released'); return false }
    }
    return true
  }

  const next = () => {
    if (!valid(at)) return
    if (at === STEPS.length - 1) setDialog('confirm')
    else setStep(at + 1)
  }
  const back = () => (at > 0 ? setStep(at - 1) : setDialog('cancel'))

  const submit = async () => {
    if (!view || !alloc) return
    try {
      await rec.mutateAsync({
        loan_id: view.loan.id, bank_account_id: bankValue ? Number(bankValue) : null, amount: value,
        late_fee: alloc.lateFee, paid_on: paidOn, photo,
      })
      toast('Payment recorded')
      router.replace('/cashflow')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <>
      <Wizard steps={STEPS} at={at} back={back} next={next} backLabel={at === 0 ? t('cancel') : t('back')} nextLabel={at === STEPS.length - 1 ? t('record') : 'Next'}>
        {at === 0 && <Contracts open={open} q={q} onQ={setQ} selected={loanId} onPick={pick} loading={data.isLoading} today={data.today} />}
        {at === 1 && view && (
          <>
            <StepHead title="Payment details" hint={`${loanCode(view.loan.id)} · ${name(view.borrower)} · installment #${nextRow(view)?.i} due ${fmtD(nextRow(view)?.due)}`} />
            <Dropdown label="Receiving bank account" options={bankOptions} value={bankValue} onChange={setBank} />
            <View style={{ gap: 4 }}>
              <Label>Amount received</Label>
              <Row style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface2 }}>
                <TextInput value={amountValue} onChangeText={(v) => setAmount(amountText(v, cur))} keyboardType="decimal-pad" accessibilityLabel="Amount received"
                  style={{ flex: 1, color: c.ink, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 }} />
                <T b={600} muted>{symbol(cur)}</T>
              </Row>
              <T v="small" muted>{hint(view)}</T>
            </View>
            <DateField label="Paid on" value={paidOn} onChange={setPaidOn} />
            <PickBox label="Photo of payment transaction (optional)" hint="Screenshot or photo of the transfer" onPick={(f) => f[0] && setPhoto(f[0])} />
            {photo && <PickedRow file={photo} onRemove={() => setPhoto(null)} />}
          </>
        )}
        {at === 2 && view && alloc && (
          <>
            <StepHead title="Review and confirm" />
            <Review view={view} alloc={alloc} amount={value} paidOn={paidOn} bankText={bankText} photo={photo} onEdit={setStep} />
          </>
        )}
      </Wizard>
      {dialog === 'cancel' && (
        <Sheet title="Cancel payment?" onClose={() => setDialog(null)} action={{ label: 'Yes, cancel', onClick: () => { setDialog(null); router.replace('/cashflow') } }}>
          <T>Discard this payment record? Nothing you entered will be saved.</T>
        </Sheet>
      )}
      {dialog === 'confirm' && view && (
        <Sheet title="Record this payment?" onClose={() => setDialog(null)} action={{ label: 'Confirm and record', onClick: submit }}>
          <T>
            Record <T b>{fmt(value, cur)}</T> received for <T b>{loanCode(view.loan.id)}</T> ({name(view.borrower)}) into <T b>{bankText}</T>?
          </T>
        </Sheet>
      )}
    </>
  )
}

function hint(v: LoanView) {
  const r = nextRow(v)
  if (!r) return ''
  const cur = v.loan.currency
  const inst = dueParts(r).remaining
  const lf = v.status.lateFeeOutstanding
  return `Installment ${fmt(inst, cur)}` + (lf > 0 ? ` + late fee ${fmt(lf, cur)} (${r.lateDays} days)` : '')
    + ` = ${fmt(inst + lf, cur)}. Partial and early payments are allowed.`
}

function Contracts({ open, q, onQ, selected, onPick, loading, today }: {
  open: LoanView[]; q: string; onQ: (v: string) => void; selected: number | null; onPick: (id: number) => void; loading: boolean; today: string
}) {
  const c = useColors()
  const name = useBorrowerName()
  const needle = q.trim().toLowerCase()
  const list = (needle
    ? open.filter((v) => `${loanCode(v.loan.id)} ${v.borrower?.name ?? ''} ${v.borrower?.name_km ?? ''}`.toLowerCase().includes(needle))
    : open.filter((v) => (nextRow(v)?.due ?? '9') <= today))
    .sort((a, b) => ((nextRow(a)?.due ?? '') < (nextRow(b)?.due ?? '') ? -1 : 1))
  return (
    <>
      <StepHead title="Which contract?" hint="Search by contract number or borrower. Contracts with an installment due today or overdue are listed first." />
      <Row style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface2 }}>
        <Icon name="search" size={18} color={c.muted} />
        <TextInput value={q} onChangeText={onQ} placeholder="Search contract or borrower…" placeholderTextColor={c.muted} autoCorrect={false} accessibilityLabel="Search contract"
          style={{ flex: 1, color: c.ink, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 }} />
      </Row>
      <View>
        <T v="eyebrow" style={{ marginBottom: 4 }}>{needle ? 'Results' : 'Due today and overdue'}</T>
        {list.map((v) => {
          const r = nextRow(v)
          if (!r) return null
          const late = r.lateDays
          const sel = v.loan.id === selected
          return (
            <Item key={v.loan.id} onPress={() => onPick(v.loan.id)}
              style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider, backgroundColor: sel ? c.accentSoft : 'transparent', paddingHorizontal: sel ? 8 : 0, borderRadius: sel ? 6 : 0 }}>
              <Initials name={name(v.borrower)} photo={v.borrower?.photo_path} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T b ell>{name(v.borrower)}</T>
                <T v="small" muted>{loanCode(v.loan.id)} · installment #{r.i}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T b num>{fmt(owedNow(v), v.loan.currency)}</T>
                {late > 0 ? <T v="small" b={600} color={c.late}>{late}d late</T>
                  : r.due === today ? <T v="small" b={600} color={c.late}>Due today</T>
                    : <T v="small" muted>Due {fmtD(r.due)}</T>}
              </View>
            </Item>
          )
        })}
        {list.length === 0 && <Empty>{loading ? 'Loading…' : needle ? 'No outstanding contract found.' : 'No installment is due today.'}</Empty>}
      </View>
    </>
  )
}

function Review({ view, alloc, amount, paidOn, bankText, photo, onEdit }: {
  view: LoanView; alloc: ReturnType<typeof allocatePayment>; amount: number; paidOn: string; bankText: string
  photo: PickedFile | null; onEdit: (step: number) => void
}) {
  const c = useColors()
  const name = useBorrowerName()
  const cur = view.loan.currency
  const applied = alloc.toInstallments - alloc.above
  const row = (k: string, v: string, x: '' | 'strong' | 'sub' = '') => (
    <Row key={k} between style={{ paddingVertical: x === 'sub' ? 4 : 8, paddingLeft: x === 'sub' ? 14 : 0 }}>
      <T muted={x !== 'strong'} size={x === 'sub' ? 13 : 15} style={{ flex: 1 }}>{k}</T>
      <T num b={x === 'strong' ? 700 : 600} size={x === 'sub' ? 13 : 15} style={{ flexShrink: 1 }} right>{v}</T>
    </Row>
  )
  const box = { backgroundColor: c.surface, borderRadius: 9, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }
  return (
    <>
      <View style={box}>
        <Row between><T v="eyebrow">This payment</T><Tap onPress={() => onEdit(1)}><T b={600} size={13} color={c.accentText}>Edit</T></Tap></Row>
        {row('Contract', `${loanCode(view.loan.id)} · ${name(view.borrower)}`)}
        {row('Receiving account', bankText)}
        {row('Paid on', fmtD(paidOn))}
        {row('Amount received', fmt(amount, cur), 'strong')}
        {alloc.lateFee > 0 && row('Late fee settled', fmt(alloc.lateFee, cur), 'sub')}
        {row('Applied to installments', fmt(applied, cur), 'sub')}
        {alloc.above > 0.005 && row('Above the contract balance', fmt(alloc.above, cur), 'sub')}
        {row('Balance after payment', fmt(Math.max(alloc.balanceAfter, 0), cur), 'strong')}
        {photo && <Image source={{ uri: photo.uri }} style={{ marginTop: 12, width: '100%', height: 180, borderRadius: 6 }} resizeMode="cover" />}
      </View>
      <View style={box}>
        <T v="eyebrow">Installment schedule</T>
        {alloc.after.rows.map((r, i) => {
          const was = alloc.before.rows[i]
          const state = was.state === 'paid' ? 'paid' : r.state === 'paid' ? 'now' : r.paidAmount > 0 ? 'part' : r.state === 'overdue' ? 'late' : 'up'
          const hit = state === 'now' || (state === 'part' && r.paidAmount > was.paidAmount + 0.005)
          return (
            <Row key={r.i} style={{ paddingVertical: 9, paddingHorizontal: 6, borderRadius: 5, backgroundColor: hit ? c.paidSoft : 'transparent', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T><T b>#{r.i}</T><T muted> · {fmtD(r.due)}</T></T>
                {state === 'part' && <T v="small" muted>{fmt(r.paidAmount, cur)} paid · {fmt(r.total - r.paidAmount, cur)} left</T>}
              </View>
              <T b num>{fmt(r.total, cur)}</T>
              {state === 'paid' && <Chip kind="approved" label="Paid" />}
              {state === 'now' && <Chip kind="approved" label="Paid now" />}
              {state === 'part' && <Chip kind="requested" label="Partial" />}
              {state === 'late' && <Chip kind="overdue" label="Overdue" />}
              {state === 'up' && <T v="small" muted>Upcoming</T>}
            </Row>
          )
        })}
      </View>
    </>
  )
}
