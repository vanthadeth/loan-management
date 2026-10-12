import { useState } from 'react'
import { Dropdown } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { dn, useTeam } from '../../data/core'
import { errMsg, useLoanActions, useSupervisors } from '../../data/loans'

/** Reassign who manages a loan. Only people who approve loans and are not limited to their own loans see this. */
export function SupervisorSheet({ loanId, current, onClose }: { loanId: number; current: string | null; onClose: () => void }) {
  const toast = useToast()
  const actions = useLoanActions()
  const supervisors = useSupervisors()
  const team = useTeam()
  const [value, setValue] = useState(current ?? '')
  // keep the current supervisor selectable even if their role changed since
  const people = supervisors.some((p) => p.id === current) ? supervisors : [...supervisors, ...(team.data ?? []).filter((p) => p.id === current)]
  const options = [{ value: '', label: 'Not assigned' }, ...people.map((p) => ({ value: p.id, label: dn(p) }))]
  const save = async () => {
    try {
      await actions.setSupervisor(loanId, value || null)
      toast('Supervisor updated')
      onClose()
    } catch (e) {
      toast(errMsg(e))
    }
  }
  return (
    <Sheet title="Loan supervisor" onClose={onClose} action={{ onClick: save }}>
      <div className="form wz-1col">
        <Dropdown id="svp" label="Supervisor" options={options} value={value} onChange={setValue} />
        <p className="small muted" style={{ margin: 0 }}>Only this supervisor, and admins, can manage the loan.</p>
      </div>
    </Sheet>
  )
}
