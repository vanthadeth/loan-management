import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { useBanks } from '../data/core'
import { BANK_NAMES, useBankActions, useRun } from '../data/admin'
import { Dropdown, Field } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import type { BankAccount } from '../lib/types'

type Dialog = { kind: 'form'; bank?: BankAccount } | { kind: 'delete'; bank: BankAccount }

function BankSheet({ bank, onClose, onDelete }: { bank?: BankAccount; onClose: () => void; onDelete: () => void }) {
  const toast = useToast()
  const run = useRun()
  const actions = useBankActions()
  const [name, setName] = useState(bank && BANK_NAMES.includes(bank.bank) ? bank.bank : bank ? 'Other' : BANK_NAMES[0])
  const [holder, setHolder] = useState(bank?.account_name ?? '')
  const [no, setNo] = useState(bank?.account_no ?? '')
  const save = async () => {
    if (!holder.trim()) { toast('Enter the account name'); return }
    if (!no.trim()) { toast('Enter the account number'); return }
    if (await run(() => actions.save(bank?.id ?? null, { bank: name, account_name: holder.trim(), account_no: no.trim() }), 'Bank account saved')) onClose()
  }
  return (
    <Sheet title={bank ? 'Edit bank account' : 'Add bank account'} onClose={onClose} action={{ onClick: save }}>
      <div className="form wz-1col">
        <Dropdown id="kb" label="Bank" options={BANK_NAMES} value={name} onChange={setName} />
        <Field id="kn" label="Account name" value={holder} onChange={setHolder} />
        <Field id="kc" label="Account number" value={no} onChange={setNo} />
        {bank && <button type="button" className="btn danger blockbtn" onClick={onDelete}>Delete account</button>}
      </div>
    </Sheet>
  )
}

export function Banks() {
  const { can } = useAuth()
  const banks = useBanks()
  const actions = useBankActions()
  const run = useRun()
  const [dlg, setDlg] = useState<Dialog | null>(null)
  usePageTitle('Bank accounts')
  if (!can('banks.manage')) return <Navigate to="/more" replace />
  const list = banks.data ?? []
  return (
    <div className="bsec">
      <div className="row between" style={{ alignItems: 'center', marginBottom: 8 }}>
        <div className="bh" style={{ margin: 0 }}>Receiving bank accounts</div>
        <button className="btn sm primary" onClick={() => setDlg({ kind: 'form' })}><Icon name="plus" size={16} />Add account</button>
      </div>
      <div className="lcard">
        {list.map((b) => (
          <div className="item" style={{ cursor: 'default' }} key={b.id}>
            <span className="tic in"><Icon name="wallet" size={18} /></span>
            <span className="grow">
              <b className="ell" style={{ display: 'block' }}>{b.bank}</b>
              <span className="small muted">{b.account_name} · {b.account_no}</span>
            </span>
            <button className="icon-btn" aria-label={`Edit ${b.bank}`} onClick={() => setDlg({ kind: 'form', bank: b })}><Icon name="edit" size={18} /></button>
          </div>
        ))}
        {banks.isLoading && <p className="muted">Loading…</p>}
        {banks.isError && <p className="muted">Could not load bank accounts.</p>}
        {banks.isSuccess && list.length === 0 && <p className="muted">No bank accounts yet.</p>}
      </div>
      {dlg?.kind === 'form' && (
        <BankSheet key={dlg.bank?.id ?? 'new'} bank={dlg.bank} onClose={() => setDlg(null)} onDelete={() => dlg.bank && setDlg({ kind: 'delete', bank: dlg.bank })} />
      )}
      {dlg?.kind === 'delete' && (
        <Sheet title="Delete bank account?" onClose={() => setDlg(null)} action={{
          label: 'Delete', cls: 'danger',
          onClick: async () => { if (await run(() => actions.remove(dlg.bank.id), 'Bank account deleted')) setDlg(null) },
        }}>
          <p style={{ margin: '0 0 6px' }}>Delete <b>{dlg.bank.bank} · {dlg.bank.account_no}</b>? An account already used by a loan or payment cannot be deleted.</p>
        </Sheet>
      )}
    </div>
  )
}
