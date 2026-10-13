import { useState } from 'react'
import { Dropdown, TextArea } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useAuth } from '../../app/auth'
import { useBanks } from '../../data/core'
import { likeOf, type LoanView } from '../../data/book'
import { amountText, amountToText, parseAmount, symbol, useRecordPayment } from '../../data/money'
import { earlyPayoffQuote, roundMoney, todayIso } from '../../lib/calc'
import { fmt } from '../../lib/format'

/** Pay the loan off early: the unpaid principal plus the prepayment fee, no future interest (R-PAY-5). */
export function EarlyPayoff({ view, onClose }: { view: LoanView; onClose: () => void }) {
  const toast = useToast()
  const { can } = useAuth()
  const banks = useBanks()
  const rec = useRecordPayment()
  const { loan, terms, payments } = view
  const cur = loan.currency
  const today = todayIso()
  const q = earlyPayoffQuote(terms, payments.map(likeOf), today, Number(loan.prepay_fee_pct ?? 0))
  const canWaive = can('payments.waive_fee')
  const [feeText, setFeeText] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [bank, setBank] = useState(loan.bank_account_id ? String(loan.bank_account_id) : '')
  const feeIn = canWaive && feeText !== null ? Math.min(Math.max(parseAmount(feeText), 0), q.fee) : q.fee
  const fee = roundMoney(feeIn, cur)
  const waived = roundMoney(q.fee - fee, cur)
  const total = q.principal + fee
  const options = [{ value: '', label: 'Cash (no bank account)' }, ...(banks.data ?? []).map((b) => ({ value: String(b.id), label: `${b.bank} · ${b.account_no} · ${b.account_name}` }))]

  const save = async () => {
    if (!q.eligible) { toast(q.reason); return }
    if (waived > 0 && !reason.trim()) { toast('Give a reason for waiving the fee'); return }
    try {
      await rec.mutateAsync({
        loan_id: loan.id, bank_account_id: bank ? Number(bank) : null, amount: total, late_fee: 0, late_fee_waived: 0, paid_on: today,
        photo: null, note: 'Early payoff', prepay_fee: fee, prepay_fee_waived: waived, interest_waived: q.interestDropped, waive_reason: waived > 0 ? reason.trim() : undefined,
      })
      toast('Loan paid off')
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const row = (k: string, v: string, strong = false) => <div className="lr"><span>{k}</span><b className="num" style={strong ? { fontSize: 18 } : undefined}>{v}</b></div>
  return (
    <Sheet title="Early payoff" onClose={onClose} action={q.eligible ? { label: 'Record early payoff', onClick: save } : undefined}>
      {!q.eligible ? <p style={{ margin: 0 }}>{q.reason}</p> : (
        <div className="form wz-1col">
          <div className="ls-t">
            {row('Unpaid principal', fmt(q.principal, cur))}
            {row('Future interest', 'not charged')}
            {row(`Prepayment fee (${q.feePct}%)`, fmt(q.fee, cur))}
            {waived > 0 && row('Fee waived', '−' + fmt(waived, cur))}
            {row('To receive today', fmt(total, cur), true)}
          </div>
          {q.fee > 0 && (
            <div className="field">
              <label htmlFor="epf">Prepayment fee collected</label>
              <div className="wz-amt">
                <input id="epf" inputMode="decimal" autoComplete="off" disabled={!canWaive} value={feeText ?? amountToText(q.fee, cur)} onChange={(e) => setFeeText(amountText(e.target.value, cur))} />
                <span>{symbol(cur)}</span>
              </div>
              <p className="small muted">{canWaive ? 'You can collect less than the fee or nothing; the rest is waived with a reason.' : 'Only an admin can waive any of this fee.'}</p>
            </div>
          )}
          {waived > 0 && <TextArea id="epr" label="Reason for waiving (required)" value={reason} onChange={setReason} />}
          <Dropdown id="epb" label="Receiving bank account" options={options} value={bank} onChange={setBank} />
          <p className="small muted" style={{ margin: 0 }}>This closes every remaining installment. {fmt(q.interestDropped, cur)} of interest not yet due is not charged.</p>
        </div>
      )}
    </Sheet>
  )
}
