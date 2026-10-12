import { useState } from 'react'
import { Dropdown } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/Text'
import { useToast } from '../../ui/Toast'
import { dn, useTeam } from '@shared/data/core'
import { errMsg, useCollectors, useLoanActions, useSupervisors } from '@shared/data/loans'

/** Reassign who manages a loan. Only people who approve loans and are not limited to their own loans see this. */
export function SupervisorSheet({ loanId, current, onClose, kind = 'supervisor' }: { loanId: number; current: string | null; onClose: () => void; kind?: 'supervisor' | 'collector' }) {
  const toast = useToast()
  const actions = useLoanActions()
  const supervisors = useSupervisors()
  const collectors = useCollectors()
  const choices = kind === 'collector' ? collectors : supervisors
  const word = kind === 'collector' ? 'Collector' : 'Supervisor'
  const team = useTeam()
  const [value, setValue] = useState(current ?? '')
  // keep the current supervisor selectable even if their role changed since
  const people = choices.some((p) => p.id === current) ? choices : [...choices, ...(team.data ?? []).filter((p) => p.id === current)]
  const options = [{ value: '', label: 'Not assigned' }, ...people.map((p) => ({ value: p.id, label: dn(p) }))]
  const save = async () => {
    try {
      await (kind === 'collector' ? actions.setCollector : actions.setSupervisor)(loanId, value || null)
      toast(`${word} updated`)
      onClose()
    } catch (e) {
      toast(errMsg(e))
    }
  }
  return (
    <Sheet title={`Loan ${word.toLowerCase()}`} onClose={onClose} action={{ onClick: save }}>
      <Dropdown label={word} options={options} value={value} onChange={setValue} />
      <T v="small" muted>{kind === 'collector' ? 'The person who collects the payments on this loan.' : 'Only this supervisor, and admins, can manage the loan.'}</T>
    </Sheet>
  )
}
