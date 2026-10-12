import { useState } from 'react'
import { Sheet } from '../../ui/Sheet'
import { DateField, Field, Seg } from '../../ui/Controls'
import { useToast } from '../../ui/Toast'
import { useI18n } from '../../app/i18n'
import { amountText, parseAmount, useAddFund } from '../../data/money'
import { fmt } from '../../lib/format'
import { todayIso, type Currency } from '../../lib/calc'

/** Add fund / Withdraw fund sheet. `available` is the current balance per currency, used to stop over-withdrawing. */
export function FundSheet({ currency, available, onClose }: {
  currency: Currency; available: Record<Currency, number>; onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const add = useAddFund()
  const [kind, setKind] = useState<'add' | 'withdraw'>('add')
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState<Currency>(currency)
  const [note, setNote] = useState('')

  const save = async () => {
    const n = parseAmount(amount)
    if (!(n > 0)) { toast('Enter the amount'); return }
    if (!date) { toast('Select the date'); return }
    if (date > todayIso()) { toast('The date cannot be in the future'); return }
    if (kind === 'withdraw' && n > available[cur] + 0.005) { toast(`Not enough funds. Available: ${fmt(available[cur], cur)}`); return }
    try {
      await add.mutateAsync({ kind, currency: cur, amount: n, txn_date: date, note: note.trim() })
      toast(kind === 'add' ? 'Fund added' : 'Fund withdrawn')
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Sheet title={kind === 'add' ? t('addFund') : 'Withdraw fund'} onClose={onClose}
      action={{ label: kind === 'add' ? t('addFund') : 'Withdraw', onClick: save }}>
      <div className="form wz-1col">
        <Seg id="fk" label="Type" options={[{ value: 'add', label: 'Add' }, { value: 'withdraw', label: 'Withdraw' }]} value={kind} onChange={(v) => setKind(v as 'add' | 'withdraw')} />
        <DateField id="fd" label="Date" value={date} onChange={setDate} />
        <div className="wz-amtrow fundrow">
          <Field id="fa" label="Amount" value={amount} inputMode="decimal" onChange={(v) => setAmount(amountText(v, cur))} />
          <Seg id="fc" label="Currency" options={['KHR', 'USD']} value={cur} onChange={(v) => { setCur(v as Currency); setAmount('') }} />
        </div>
        <Field id="fn" label="Note" value={note} onChange={setNote} />
      </div>
    </Sheet>
  )
}
