import { useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '@shared/app/auth'
import { BANK_NAMES, useBankActions, useRun } from '@shared/data/admin'
import { useBanks } from '@shared/data/core'
import type { BankAccount } from '@shared/lib/types'
import { useColors } from '../lib/theme'
import { Btn, Empty, IconBtn, Item, LCard, Row, Tic } from '../ui/core'
import { Dropdown, Field } from '../ui/Controls'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'

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
      <Dropdown label="Bank" options={BANK_NAMES} value={name} onChange={setName} />
      <Field label="Account name" value={holder} onChange={setHolder} autoCapitalize="words" />
      <Field label="Account number" value={no} onChange={setNo} inputMode="numeric" />
      {bank && <Btn block kind="danger" label="Delete account" onPress={onDelete} />}
    </Sheet>
  )
}

export function Banks() {
  const c = useColors()
  const { can } = useAuth()
  const banks = useBanks()
  const actions = useBankActions()
  const run = useRun()
  const [dlg, setDlg] = useState<Dialog | null>(null)
  if (!can('banks.manage')) return <Screen title="Bank accounts"><T muted>You do not have access to bank accounts.</T></Screen>
  const list = banks.data ?? []
  return (
    <Screen title="Bank accounts">
      <Row between>
        <T v="eyebrow">Receiving bank accounts</T>
        <Btn sm kind="primary" icon="plus" label="Add account" onPress={() => setDlg({ kind: 'form' })} />
      </Row>
      <LCard>
        {list.map((b) => (
          <Item key={b.id}>
            <Tic name="wallet" />
            <View style={{ flex: 1, minWidth: 0 }}><T b ell>{b.bank}</T><T v="small" muted>{b.account_name} · {b.account_no}</T></View>
            <IconBtn name="edit" label={`Edit ${b.bank}`} color={c.accent} onPress={() => setDlg({ kind: 'form', bank: b })} />
          </Item>
        ))}
        {banks.isLoading && <Empty>Loading…</Empty>}
        {banks.isError && <Empty>Could not load bank accounts.</Empty>}
        {banks.isSuccess && list.length === 0 && <Empty>No bank accounts yet.</Empty>}
      </LCard>
      {dlg?.kind === 'form' && (
        <BankSheet key={dlg.bank?.id ?? 'new'} bank={dlg.bank} onClose={() => setDlg(null)} onDelete={() => dlg.bank && setDlg({ kind: 'delete', bank: dlg.bank })} />
      )}
      {dlg?.kind === 'delete' && (
        <Sheet title="Delete bank account?" onClose={() => setDlg(null)} action={{
          label: 'Delete', kind: 'danger',
          onClick: async () => { if (await run(() => actions.remove(dlg.bank.id), 'Bank account deleted')) setDlg(null) },
        }}>
          <T>Delete <T b>{dlg.bank.bank} · {dlg.bank.account_no}</T>? An account already used by a loan or payment cannot be deleted.</T>
        </Sheet>
      )}
    </Screen>
  )
}
