import { Icon } from '../../ui/Icon'
import { fmt, fmtD } from '../../lib/format'
import type { Currency, scheduleStatus } from '../../lib/calc'

type Status = ReturnType<typeof scheduleStatus>

/**
 * How the late fee was worked out: one line per late period (the unpaid principal when it started × the
 * contract's %), then what was already collected or forgiven, and what is still due.
 */
export function LateFeeBreakdown({ status, cur, open = false, title = 'How the late fee is worked out' }: {
  status: Status; cur: Currency; open?: boolean; title?: string
}) {
  if (!status.lateLines.length) return null
  return (
    <details className="binfo" open={open}>
      <summary><span>{title}</span><Icon name="chev" size={16} /></summary>
      <div className="tblwrap">
        <table className="num lfee">
          <tbody>
            {status.lateLines.map((l) => (
              <tr key={l.from}>
                <td>
                  <span style={{ display: 'block' }}>Late from {fmtD(l.from)}</span>
                  <span className="small muted">#{l.installment} overdue · {l.pct}% × {fmt(l.owed, cur)} unpaid principal</span>
                </td>
                <td className="r">{fmt(l.fee, cur)}</td>
              </tr>
            ))}
            <tr className="sum"><td>Late fee charged</td><td className="r">{fmt(status.lateFeeAccrued, cur)}</td></tr>
            {status.lateFeePaid > 0 && <tr><td>Already collected</td><td className="r">−{fmt(status.lateFeePaid, cur)}</td></tr>}
            {status.lateFeeWaived > 0 && <tr><td>Forgiven</td><td className="r">−{fmt(status.lateFeeWaived, cur)}</td></tr>}
            <tr className="sum"><td><b>Late fee due</b></td><td className="r"><b>{fmt(status.lateFeeOutstanding, cur)}</b></td></tr>
          </tbody>
        </table>
      </div>
    </details>
  )
}
