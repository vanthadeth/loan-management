import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { useAuth } from '@shared/app/auth'
import { useBook, useLateFeeDefault } from '@shared/data/book'
import { bname } from '@shared/data/borrowers'
import { dn, useBanks, useSettings } from '@shared/data/core'
import { useContractTemplates } from '@shared/data/contract'
import { errMsg, useCollectors, useLoanActions, useSupervisors } from '@shared/data/loans'
import { addDays, previewLoan, todayIso, type Currency, type LoanTerms, type PayMode, type RateBasis } from '@shared/lib/calc'
import { fmt, fmtD } from '@shared/lib/format'
import type { BankAccount, Loan } from '@shared/lib/types'
import type { PickedFile } from '../lib/device'
import { useI18n } from '../lib/i18n'
import { font, useColors } from '../lib/theme'
import { Initials } from '../ui/Avatar'
import { Btn, Card, Empty, Item, Row, Tap } from '../ui/core'
import { Choice, DateField, Dropdown, Field, Label, Seg, TextArea } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { PickBox } from '../ui/Pickers'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { StepHead, Wizard } from '../ui/Wizard'
import { BorrowerSheet } from './borrowers/BorrowerSheet'
import { TierChip } from './parts'

type Freq = 'Daily' | 'Weekly' | 'Monthly' | 'Custom'
type Method = Loan['pay_method']
interface Collateral { key: string; desc: string; files: PickedFile[] }

const STEPS = ['Borrower', 'Amount', 'Terms', 'Payment', 'Review']
const FREQ: Record<Exclude<Freq, 'Custom'>, [number, string]> = { Daily: [1, 'day'], Weekly: [7, 'week'], Monthly: [30, 'month'] }
const BASIS = [{ value: 'month', label: 'per month' }, { value: 'occurrence', label: 'per occurrence' }, { value: 'contract', label: 'per contract period' }]
const MAX_OCCURRENCES = 1000

const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0
const group = (s: string) => { const d = s.replace(/\D/g, ''); return d ? Number(d).toLocaleString('en-US') : '' }
const bankLabel = (b: BankAccount) => `${b.bank} · ${b.account_no} · ${b.account_name}`

/** The next three release days: Wednesdays and Fridays, starting tomorrow. */
function releaseDays() {
  const out: string[] = []
  for (let d = addDays(todayIso(), 1); out.length < 3; d = addDays(d, 1)) {
    if ([3, 5].includes(new Date(d + 'T00:00:00').getDay())) out.push(d)
  }
  return out
}

/** A number input with a unit on the right (".wz-amt"). */
function Amount({ label, value, onChange, unit, keyboard = 'decimal-pad', hint, big }: {
  label: string; value: string; onChange: (v: string) => void; unit: string; keyboard?: 'decimal-pad' | 'number-pad'; hint?: string; big?: boolean
}) {
  const c = useColors()
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Label>{label}</Label>
      <Row style={{ minHeight: big ? 60 : 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface2 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} accessibilityLabel={label}
          style={{ flex: 1, color: c.ink, fontFamily: big ? font.bold : font.regular, fontSize: big ? 26 : 15, paddingVertical: 10 }} />
        <T b={600} muted>{unit}</T>
      </Row>
      {hint && <T v="small" muted>{hint}</T>}
    </View>
  )
}

function Section({ title, step, onEdit, children }: { title: string; step?: number; onEdit?: (s: number) => void; children: ReactNode }) {
  const c = useColors()
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 9, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hair }}>
      <Row between>
        <T v="eyebrow">{title}</T>
        {onEdit && step !== undefined && <Tap onPress={() => onEdit(step)}><T b={600} size={13} color={c.accentText}>Edit</T></Tap>}
      </Row>
      {children}
    </View>
  )
}

/** Label on the left, value on the right (".lr"); `strong` and `sub` lines as on the web. */
function Lr({ k, v, kind }: { k: string; v: string; kind?: 'strong' | 'sub' }) {
  return (
    <Row between style={{ paddingVertical: kind === 'sub' ? 3 : 6, paddingLeft: kind === 'sub' ? 14 : 0 }}>
      <T size={kind === 'sub' ? 13 : 15} muted={kind !== 'strong'} style={{ flex: 1 }}>{k}</T>
      <T num size={kind === 'sub' ? 13 : 15} b={kind === 'strong' ? 700 : 600} right style={{ flexShrink: 1 }}>{v}</T>
    </Row>
  )
}

/** Small tile of the review step (".wzt"). */
function Mini({ k, v, sub, wide }: { k: string; v: string; sub?: string; wide?: boolean }) {
  const c = useColors()
  return (
    <View style={{ width: wide ? '100%' : '48%', flexGrow: 1, backgroundColor: c.surface2, borderRadius: 8, padding: 12, gap: 2 }}>
      <T v="small" muted>{k}</T>
      <T b num>{v || '—'}</T>
      {sub && <T v="small" muted>{sub}</T>}
    </View>
  )
}

export function NewLoan() {
  const { t } = useI18n()
  const c = useColors()
  const { can, me, scoped } = useAuth()
  const toast = useToast()
  const params = useLocalSearchParams<{ draft?: string; borrower?: string }>()
  const { data: book } = useBook()
  const { data: settings } = useSettings()
  const banks = useBanks().data ?? []
  const supervisors = useSupervisors()
  const collectors = useCollectors()
  const actions = useLoanActions()
  const draftId = Number(params.draft) || null
  const scroller = useRef<ScrollView>(null)

  const [step, setStep] = useState(0)
  const [registering, setRegistering] = useState(false)
  const contractReady = (useContractTemplates().data ?? []).some((x) => x.kind === 'contract')
  const [dialog, setDialog] = useState<null | 'cancel' | 'submit'>(null)
  const [borrowerId, setBorrowerId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [currency, setCurrency] = useState<Currency>('KHR')
  const [amount, setAmount] = useState('1,000,000')
  const [fee, setFee] = useState<string | null>(null)
  const [release, setRelease] = useState(() => releaseDays()[0])
  const [rate, setRate] = useState('17')
  const [basis, setBasis] = useState<RateBasis>('contract')
  const [occ, setOcc] = useState('60')
  const [freq, setFreq] = useState<Freq>('Daily')
  const [days, setDays] = useState('30')
  const [mode, setMode] = useState<PayMode>('equal')
  const [supervisor, setSupervisor] = useState('')
  const [collector, setCollector] = useState('')
  const [late, setLate] = useState<string | null>(null)
  const [method, setMethod] = useState<Method | null>(null)
  const [bankId, setBankId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [hasCollateral, setHasCollateral] = useState(false)
  const [collaterals, setCollaterals] = useState<Collateral[]>([])
  const lateDefault = Number(useLateFeeDefault())

  // editing a draft: fill the form from the saved loan once
  const loaded = useRef(false)
  useEffect(() => {
    if (!book || !draftId || loaded.current) return
    const d = book.loans.find((x) => x.id === draftId && x.status === 'drafted')
    loaded.current = true
    if (!d) return
    const b = book.borrowers.find((x) => x.id === d.borrower_id)
    /* eslint-disable react-hooks/set-state-in-effect -- one-time fill from the saved draft */
    setBorrowerId(d.borrower_id); setQuery(b ? bname(b) : ''); setCurrency(d.currency)
    setAmount(group(String(d.amount))); setFee(String(d.fee_pct)); setRelease(d.release_date)
    setRate(String(d.rate_pct)); setBasis(d.rate_basis); setOcc(String(d.occurrences))
    setFreq(({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' } as const)[d.frequency])
    setDays(String(d.interval_days)); setMode(d.mode); setSupervisor(d.supervisor_id ?? ''); setCollector(d.collector_id ?? '')
    setLate(String(d.late_fee_pct)); setMethod(d.pay_method); setBankId(d.bank_account_id ? String(d.bank_account_id) : '')
    setRemarks(d.pay_remarks); setStep(4)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [book, draftId])

  // a borrower chosen on the borrower page: skip the first step
  const preselect = useRef(params.borrower ?? null)
  useEffect(() => {
    if (!book || preselect.current === null) return
    const b = book.borrowers.find((x) => x.id === Number(preselect.current) && x.status === 'active')
    preselect.current = null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time preselection
    if (b) { setBorrowerId(b.id); setQuery(bname(b)); setStep(1) }
  }, [book])
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }) }, [step])

  const title = draftId ? 'Edit draft' : t('newLoan')
  if (!can('loans.create')) return <Screen title={title}><T muted>You are not allowed to request loans.</T></Screen>

  const borrower = book?.borrowers.find((b) => b.id === borrowerId)
  const feeText = fee ?? (settings ? String(Number(settings.service_fee_pct)) : '')
  const lateText = late ?? lateDefault.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const effMethod: Method = method ?? (banks.length ? 'bank' : 'cash')
  const bank = banks.find((b) => String(b.id) === bankId) ?? banks[0]
  const khrPerUsd = Number(settings?.khr_per_usd) || 4000
  const sym = currency === 'USD' ? '$' : '៛'

  const n = Math.min(MAX_OCCURRENCES, Math.max(1, Math.round(num(occ)) || 1))
  const intervalDays = freq === 'Custom' ? Math.max(1, Math.round(num(days)) || 1) : FREQ[freq][0]
  const unit = freq === 'Custom' ? `${intervalDays} days` : FREQ[freq][1]
  const terms: LoanTerms = {
    amount: num(amount), currency, feePct: num(feeText), ratePct: num(rate), rateBasis: basis, occurrences: n,
    frequency: freq.toLowerCase() as Loan['frequency'], intervalDays, mode, releaseDate: release || todayIso(), lateFeePct: num(lateText),
  }
  const p = previewLoan(terms)
  const lateLabel = `${terms.lateFeePct}% per late ${freq === 'Custom' ? `${intervalDays}-day period` : freq === 'Daily' ? 'day' : freq === 'Weekly' ? 'week' : 'month'}`
  const equal = mode === 'equal'
  const first = p.rows[0]
  const installment = equal ? first.total : first.interest
  const feeLabel = `Service fee (${terms.feePct}%, deducted)`
  const collectorName = collector ? dn(collectors.find((s) => s.id === collector)) : 'Not assigned'
  const supervisorName = scoped ? dn(me) : supervisor ? dn(supervisors.find((s) => s.id === supervisor)) : 'Not assigned'
  const needle = query.trim().toLowerCase()
  const matches = (book?.borrowers ?? []).filter((b) => b.status === 'active' && (!needle || (b.name + b.name_km + b.phone + b.id_no).toLowerCase().includes(needle)))
  const collateralText = !hasCollateral ? 'None'
    : collaterals.map((x, i) => x.desc.trim() || 'Collateral ' + (i + 1)).join(', ') + (collaterals.length > 1 ? ` (${collaterals.length} items)` : '')
      + (collaterals.some((x) => x.files.length) ? ` · ${collaterals.reduce((s, x) => s + x.files.length, 0)} file(s)` : '')

  /** The message to show when a step is not ready, or null. */
  const problem = (s: number) => {
    if (s === 0 && !borrower) return 'Select a borrower first'
    if (s === 1 && !(terms.amount > 0)) return 'Enter a loan amount'
    if (s === 1 && !(terms.feePct >= 0 && terms.feePct < 100)) return 'The service fee must be between 0 and 100%'
    if (s === 1 && !release) return 'Choose a release date'
    if (s === 2 && (!(num(occ) >= 1) || num(occ) > MAX_OCCURRENCES || !(terms.ratePct >= 0))) return 'Check interest rate and occurrences'
    return null
  }
  const next = () => {
    const msg = problem(step)
    if (msg) { toast(msg); return }
    if (step === STEPS.length - 1) setDialog('submit')
    else setStep(step + 1)
  }

  const switchCurrency = (cur: string) => {
    if (cur === currency) return
    const raw = Number(amount.replace(/\D/g, ''))
    if (cur === 'USD' && raw >= 10000) setAmount(group(String(Math.round(raw / khrPerUsd))))
    else if (cur === 'KHR' && raw > 0 && raw < 10000) setAmount(group(String(raw * khrPerUsd)))
    setCurrency(cur as Currency)
    setLate(null)
  }
  const changeQuery = (v: string) => {
    setQuery(v)
    if (borrower && bname(borrower).toLowerCase() !== v.trim().toLowerCase()) setBorrowerId(null)
  }
  const stepOcc = (d: number) => setOcc(String(Math.min(MAX_OCCURRENCES, Math.max(1, (Math.round(num(occ)) || 1) + d))))
  const setCollateral = (key: string, patch: Partial<Collateral>) => setCollaterals((cs) => cs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const newCollateral = (): Collateral => ({ key: Crypto.randomUUID(), desc: '', files: [] })
  const toggleCollateral = (yes: boolean) => {
    setHasCollateral(yes)
    if (yes && !collaterals.length) setCollaterals([newCollateral()])
  }

  /** Saves the loan as a draft (kept private, can be edited) or submits it as a request. */
  const submit = async (asDraft = false) => {
    const failed = [0, 1, 2].map(problem).find(Boolean)
    if (failed || !borrower) { toast(failed ?? 'Select a borrower first'); setDialog(null); return }
    try {
      const input = {
        loan: {
          borrower_id: borrower.id, supervisor_id: scoped ? (me?.id ?? null) : supervisor || null, collector_id: collector || null, currency, amount: terms.amount,
          fee_pct: terms.feePct, late_fee_pct: terms.lateFeePct, rate_pct: terms.ratePct, rate_basis: basis,
          frequency: freq.toLowerCase() as Loan['frequency'], interval_days: intervalDays, occurrences: n, mode, release_date: terms.releaseDate,
          pay_method: effMethod, bank_account_id: effMethod === 'bank' && bank ? bank.id : null, pay_remarks: effMethod === 'other' ? remarks.trim() : '',
        },
        collaterals: hasCollateral ? collaterals.map((x, i) => ({ description: x.desc.trim() || 'Collateral ' + (i + 1), files: x.files })) : [],
      }
      let id: number
      let warning: string | null
      if (draftId) {
        ({ warning } = await actions.saveDraft(draftId, input))
        id = draftId
        if (!asDraft) await actions.setStatus(id, 'drafted', 'requested')
      } else {
        ({ id, warning } = await actions.create(input, asDraft))
      }
      const what = asDraft ? 'Draft saved' : 'Loan request submitted'
      toast(warning ? `${what}, but the collateral was not fully saved: ${warning}` : what)
      setDialog(null)
      // a draft goes to its page; a request goes straight to the printable contract when a template is set up
      router.replace(contractReady && !asDraft ? `/loans/${id}/contract` : `/loans/${id}`)
    } catch (e) {
      toast(errMsg(e))
    }
  }

  const breakdown = (
    <>
      <Lr k="Loan amount" v={fmt(terms.amount, currency)} />
      <Lr k={feeLabel} v={'−' + fmt(p.fee, currency)} />
      <Lr k="Borrower receives" v={fmt(p.net, currency)} kind="strong" />
      <Lr k={`Total interest (~${p.interestPct}%)`} v={fmt(p.interest, currency)} />
      <Lr k="Late fee" v={lateLabel} />
      {equal ? (
        <>
          <Lr k="Installment" v={fmt(installment, currency)} />
          <Lr k="Principal" v={fmt(first.principal, currency)} kind="sub" />
          <Lr k="Interest" v={fmt(first.interest, currency)} kind="sub" />
        </>
      ) : (
        <>
          <Lr k="Interest payment" v={fmt(installment, currency)} />
          <Lr k="Principal due at the end" v={fmt(terms.amount, currency)} kind="sub" />
        </>
      )}
      <Lr k="Total to collect" v={fmt(p.total, currency)} kind="strong" />
    </>
  )

  const last = step === STEPS.length - 1
  return (
    <Screen title={title} scroll={false}>
      <Wizard steps={STEPS} at={step} scrollRef={scroller}
        back={() => (step === 0 ? setDialog('cancel') : setStep(step - 1))} backLabel={step === 0 ? t('cancel') : t('back')}
        next={next} nextLabel={last ? 'Submit request' : 'Next'}>
        {step === 0 && (
          <>
            <StepHead title="Who is borrowing?" hint="Search by name, phone or ID card number, or pick an active borrower." />
            <Row style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface2 }}>
              <Icon name="search" size={18} color={c.muted} />
              <TextInput value={query} onChangeText={changeQuery} placeholder="Search borrower…" placeholderTextColor={c.muted} autoCorrect={false} accessibilityLabel="Search borrower"
                style={{ flex: 1, color: c.ink, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 }} />
            </Row>
            <View>
              <T v="eyebrow" style={{ marginBottom: 4 }}>{needle ? 'Results' : 'Active borrowers'}</T>
              {matches.map((b) => (
                <Item key={b.id} onPress={() => { setBorrowerId(b.id); setQuery(bname(b)); setStep(1) }}
                  style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider, backgroundColor: b.id === borrowerId ? c.accentSoft : 'transparent' }}>
                  <Initials name={bname(b)} photo={b.photo_path} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T b ell>{bname(b)}</T>
                    <T v="small" muted ell>{[b.phone, b.id_no].filter(Boolean).join(' · ')}</T>
                  </View>
                  <TierChip tier={b.tier} />
                </Item>
              ))}
              {!matches.length && (book ? (
                <Card style={{ alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="userp" size={22} color={c.accentInk} /></View>
                  <T b center>{needle ? 'No borrower matches your search' : 'No borrowers yet'}</T>
                  <T v="small" muted center>{can('borrowers.edit') ? 'Register the borrower first, then pick them here.' : 'Ask someone with permission to register the borrower first.'}</T>
                  {can('borrowers.edit') && <Btn kind="primary" icon="plus" label="Register borrower" onPress={() => setRegistering(true)} />}
                </Card>
              ) : <Empty>Loading…</Empty>)}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <StepHead title="How much?" />
            <Row style={{ alignItems: 'flex-end' }}>
              <Amount label="Loan amount" value={amount} onChange={(v) => setAmount(group(v))} unit={sym} keyboard="number-pad" />
              <Seg label="Currency" options={['KHR', 'USD']} value={currency} onChange={switchCurrency} style={{ width: 150 }} />
            </Row>
            <Amount label="Service fee (deducted upfront)" value={feeText} onChange={setFee} unit="%"
              hint={`Service fee ${fmt(p.fee, currency)} · borrower receives ${fmt(p.net, currency)}`} />
            <DateField label="Release date" value={release} onChange={setRelease} />
            <Row gap={8} wrap>
              {releaseDays().map((d) => {
                const on = release === d
                return (
                  <Tap key={d} onPress={() => setRelease(d)} accessibilityState={{ selected: on }}
                    style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? c.accent : c.surface2 }}>
                    <T b={600} size={13} color={on ? c.accentInk : c.ink}>{fmtD(d)}</T>
                  </Tap>
                )
              })}
            </Row>
          </>
        )}

        {step === 2 && (
          <>
            <StepHead title="Interest and repayment" />
            <Amount label="Interest rate" value={rate} onChange={setRate} unit="%" />
            <Choice label="Interest applies" options={BASIS} value={basis} onChange={(v) => setBasis(v as RateBasis)} />
            <View style={{ gap: 4 }}>
              <Label>Number of occurrences</Label>
              <Row style={{ borderRadius: 10, backgroundColor: c.surface2, padding: 4 }}>
                <Btn label="−" onPress={() => stepOcc(-1)} style={{ width: 48 }} />
                <TextInput value={occ} onChangeText={(v) => setOcc(v.replace(/\D/g, ''))} keyboardType="number-pad" accessibilityLabel="Number of occurrences"
                  style={{ flex: 1, textAlign: 'center', color: c.ink, fontFamily: font.bold, fontSize: 18 }} />
                <Btn label="+" onPress={() => stepOcc(1)} style={{ width: 48 }} />
              </Row>
            </View>
            <Seg label="Payback frequency" options={['Daily', 'Weekly', 'Monthly', 'Custom']} value={freq} onChange={(v) => setFreq(v as Freq)} />
            {freq === 'Custom' && <Field label="Days between payments" inputMode="decimal" value={days} onChange={setDays} />}
            <Seg label="How they pay" options={[{ value: 'equal', label: 'Interest and principal' }, { value: 'interest', label: 'Interest only' }]} value={mode} onChange={(v) => setMode(v as PayMode)} />
            {scoped
              ? <View style={{ gap: 4 }}><Label>Supervisor</Label><T><T b>{dn(me)}</T><T v="small" muted> (you)</T></T></View>
              : <Dropdown label="Supervisor" options={[{ value: '', label: 'Not assigned' }, ...supervisors.map((s) => ({ value: s.id, label: dn(s) }))]} value={supervisor} onChange={setSupervisor} />}
            <Dropdown label="Collector" options={[{ value: '', label: 'Not assigned' }, ...collectors.map((s) => ({ value: s.id, label: dn(s) }))]} value={collector} onChange={setCollector} />
            <Amount label="Late fee (%)" value={lateText} onChange={setLate} unit="%"
              hint="Percent of the unpaid installment, charged for every payment period it stays late. Defaults from Settings; change it for this contract." />
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="small" muted>{equal ? 'Installment' : 'Interest payment'}</T>
              <View style={{ alignItems: 'flex-end' }}>
                <T b num size={28} style={{ letterSpacing: -0.5, lineHeight: 34 }}>{fmt(installment, currency)}</T>
                <T v="small" muted>per {unit} × {n}</T>
              </View>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <StepHead title="Payment and collateral" />
            <Seg label="Borrower pays by" options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'other', label: 'Other' }]} value={effMethod} onChange={(v) => setMethod(v as Method)} />
            {effMethod === 'bank' && (banks.length
              ? <Dropdown label="Receiving bank account" options={banks.map((b) => ({ value: String(b.id), label: bankLabel(b) }))} value={String(bank?.id ?? '')} onChange={setBankId} />
              : <View style={{ gap: 4 }}><Label>Receiving bank account</Label><T v="small" muted>No bank account yet. Add one in Profile.</T></View>)}
            {effMethod === 'other' && <TextArea label="Remarks" value={remarks} onChange={setRemarks} placeholder="e.g. paid through a relative, goods in kind…" />}
            <Seg label="Collateral" options={['No', 'Yes']} value={hasCollateral ? 'Yes' : 'No'} onChange={(v) => toggleCollateral(v === 'Yes')} />
            {hasCollateral && (
              <>
                {collaterals.map((x, i) => (
                  <Card key={x.key}>
                    <Row between>
                      <T b>Collateral {i + 1}</T>
                      {collaterals.length > 1 && <Tap onPress={() => setCollaterals((cs) => cs.filter((y) => y.key !== x.key))}><T b={600} size={13} color={c.accentText}>Remove</T></Tap>}
                    </Row>
                    <Field label="Description" placeholder="e.g. Motorbike, registration card" value={x.desc} onChange={(v) => setCollateral(x.key, { desc: v })} />
                    {x.files.map((f, j) => (
                      <Row key={j} style={{ backgroundColor: c.surface2, borderRadius: 99, paddingLeft: 12, paddingRight: 4, paddingVertical: 2 }}>
                        <T v="small" ell style={{ flex: 1 }}>{f.name}</T>
                        <Tap onPress={() => setCollateral(x.key, { files: x.files.filter((_, k) => k !== j) })} accessibilityLabel={'Remove ' + f.name} style={{ padding: 6 }}>
                          <Icon name="x" size={16} color={c.muted} />
                        </Tap>
                      </Row>
                    ))}
                    <PickBox hint="Attachments: documents or photos" multiple files onPick={(f) => setCollateral(x.key, { files: [...x.files, ...f] })} />
                  </Card>
                ))}
                <Btn label="+ Add collateral" onPress={() => setCollaterals((cs) => [...cs, newCollateral()])} />
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <StepHead title="Review and submit" />
            {borrower && (
              <Section title="Borrower" step={0} onEdit={setStep}>
                <Row gap={14}>
                  <Initials name={bname(borrower)} photo={borrower.photo_path} size={64} />
                  <View style={{ flex: 1, gap: 6 }}><T b size={18}>{bname(borrower)}</T><TierChip tier={borrower.tier} /></View>
                </Row>
              </Section>
            )}
            <Section title="Loan" step={1} onEdit={setStep}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Mini k="Loan amount" v={fmt(terms.amount, currency)} wide />
                <Mini k={equal ? 'Installment' : 'Interest payment'} v={fmt(installment, currency)} sub={`per ${unit} × ${n}`} wide />
                <Mini k="Release date" v={fmtD(release)} wide />
                <Mini k="How they pay" v={equal ? 'Interest and principal' : 'Interest only'} wide />
                <Mini k="Interest" v={terms.ratePct + '%'} sub={BASIS.find((b) => b.value === basis)?.label} />
                <Mini k="Occurrences" v={String(n)} sub={freq === 'Custom' ? `Every ${intervalDays} days` : freq} />
                <Mini k="Service fee" v={terms.feePct + '%'} />
                <Mini k="Late fee" v={lateLabel} />
                <Mini k="Supervisor" v={supervisorName} />
                <Mini k="Collector" v={collectorName} />
              </View>
            </Section>
            <Section title="Payment and collateral" step={3} onEdit={setStep}>
              <Lr k="Borrower pays by" v={effMethod === 'bank' ? 'Bank' + (bank ? ' · ' + bankLabel(bank) : '') : effMethod === 'other' ? 'Other' + (remarks.trim() ? ' · ' + remarks.trim() : '') : 'Cash'} />
              <Lr k="Collateral" v={collateralText} />
            </Section>
            <Section title="Loan breakdown">{breakdown}</Section>
            <Btn label="Save draft" onPress={() => { const m = [0, 1, 2].map(problem).find(Boolean); if (m) toast(m); else return submit(true) }} />
          </>
        )}
      </Wizard>

      {dialog === 'cancel' && (
        <Sheet title="Cancel new loan?" onClose={() => setDialog(null)} action={{ label: 'Yes, cancel', onClick: () => { setDialog(null); router.replace('/loans') } }}>
          <T>Discard this loan request? Nothing you entered will be saved.</T>
        </Sheet>
      )}
      {dialog === 'submit' && borrower && (
        <Sheet title="Submit loan request?" onClose={() => setDialog(null)} action={{ label: 'Confirm and submit', onClick: () => submit() }}>
          <T>Submit a loan request of <T b>{fmt(terms.amount, currency)}</T> for <T b>{bname(borrower)}</T>? The borrower receives <T b>{fmt(p.net, currency)}</T> after the service fee.</T>
        </Sheet>
      )}
      {registering && <BorrowerSheet onClose={() => setRegistering(false)} />}
    </Screen>
  )
}
