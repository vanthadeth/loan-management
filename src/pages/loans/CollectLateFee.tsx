import { useState } from 'react'
import { Dropdown } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useBanks } from '../../data/core'
import { likeOf, type LoanView } from '../../data/book'
import { amountText, amountToText, parseAmount, symbol, useRecordPayment } from '../../data/money'
import { settleLateFee, todayIso } from '../../lib/calc'
import { fmt } from '../../lib/format'
import { LateFeeBreakdown } from './LateFee'

/** Settle the late fee on its own: take anything from 0 up to what is due; the rest is forgiven. */
export function CollectLateFee({ view, onClose }: { view: LoanView; onClose: () => void }) {
  const toast = useToast()
  const banks = useBanks()
  const rec = useRecordPayment()
  const { loan, terms, payments, status } = view
  const cur = loan.currency
  const today = todayIso()
  const due = status.lateFeeOutstanding
  const [text, setText] = useState(amountToText(due, cur))
  const [bank, setBank] = useState(loan.bank_account_id ? String(loan.bank_account_id) : '')
  const history = payments.map(likeOf)
  const s = settleLateFee(terms, history, parseAmount(text), today)
  const options = [{ value: '', label: 'Cash (no bank account)' }, ...(banks.data ?? []).map((b) => ({ value: String(b.id), label: `${b.bank} · ${b.account_no} · ${b.account_name}` }))]

  const save = async () => {
    if (!(s.due > 0)) { toast('There is no late fee due'); return }
    try {
      await rec.mutateAsync({
        loan_id: loan.id, bank_account_id: s.lateFee > 0 && bank ? Number(bank) : null, amount: s.lateFee,
        late_fee: s.lateFee, late_fee_waived: s.lateFeeWaived, paid_on: today, photo: null, note: loan.written_off_at ? 'Recovery' : undefined,
      })
      toast(s.lateFee > 0 ? 'Late fee collected' : 'Late fee forgiven')
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Sheet title="Late fee" onClose={onClose} action={{ label: s.lateFee > 0 ? 'Collect' : 'Forgive late fee', onClick: save }}>
      <div className="form wz-1col">
        <div className="field">
          <label htmlFor="clf">Late fee collected</label>
          <div className="wz-amt">
            <input id="clf" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(amountText(e.target.value, cur))} />
            <span>{symbol(cur)}</span>
          </div>
          <p className="small muted">
            Late fee due {fmt(due, cur)}. Take anything from 0 up to that; the rest is forgiven.
            {s.lateFeeWaived > 0 && <> <b>{fmt(s.lateFeeWaived, cur)} forgiven.</b></>}
          </p>
        </div>
        {s.lateFee > 0 && <Dropdown id="clb" label="Receiving bank account" options={options} value={bank} onChange={setBank} />}
        <LateFeeBreakdown status={status} cur={cur} />
      </div>
    </Sheet>
  )
}
