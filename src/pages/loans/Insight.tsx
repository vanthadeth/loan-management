import type { LoanView } from '../../data/book'
import { fmt, loanCode } from '../../lib/format'
import { diffDays, todayIso } from '../../lib/calc'

type Level = 'ok' | 'warn' | 'bad'
interface Finding { level: Level; title: string; detail: string }

const RANK: Record<Level, number> = { bad: 0, warn: 1, ok: 2 }

/** What an admin should know about this loan, worst first. Each finding is a traffic light: green, amber, red. */
export function findings(v: LoanView, all: LoanView[], gain: number): Finding[] {
  const { loan, status, borrower, payments, voided } = v
  const cur = loan.currency
  const out: Finding[] = []
  const add = (level: Level, title: string, detail: string) => out.push({ level, title, detail })
  const today = todayIso()

  if (loan.status === 'approved') {
    const late = status.rows.filter((r) => r.state === 'overdue')
    if (status.done) add('ok', 'Fully repaid', 'Every installment has been collected.')
    else if (late.length) {
      const days = Math.max(...late.map((r) => r.lateDays))
      add(days >= 7 ? 'bad' : 'warn', `${late.length} installment${late.length > 1 ? 's' : ''} overdue`, `Oldest is ${days} day${days === 1 ? '' : 's'} late. Call the borrower or send the collector.`)
    } else add('ok', 'On schedule', `${status.paidCount} of ${loan.occurrences} installments paid, none overdue.`)

    if (status.lateFeeOutstanding > 0) add('warn', 'Late fee not collected', `${fmt(status.lateFeeOutstanding, cur)} is due. Collect it or forgive it.`)
    if (status.lateFeeWaived > 0) add('warn', 'Late fee forgiven', `${fmt(status.lateFeeWaived, cur)} of the ${fmt(status.lateFeeAccrued, cur)} charged was forgiven.`)

    const last = payments.reduce((d, p) => (p.paid_on > d ? p.paid_on : d), '')
    const period = loan.frequency === 'daily' ? 1 : loan.frequency === 'weekly' ? 7 : loan.frequency === 'monthly' ? 30 : loan.interval_days
    if (!status.done && last && diffDays(last, today) > period * 2) add('warn', 'No recent payment', `The last payment was ${diffDays(last, today)} days ago.`)

    if (!loan.collector_id) add('warn', 'No collector assigned', 'Assign someone to follow up on this loan.')
    if (!loan.supervisor_id) add('warn', 'No supervisor assigned', 'Assign someone to look after this loan.')
  }

  if (borrower) {
    if (borrower.status === 'banned') add('bad', 'Borrower is banned', 'Think twice before collecting or lending more.')
    else if (borrower.tier === 'bad') add('bad', 'Borrower rated Bad', 'Trust level is the lowest.')
    else if (borrower.tier === 'gold' || borrower.tier === 'silver') add('ok', `Borrower rated ${borrower.tier === 'gold' ? 'Gold' : 'Silver'}`, 'A trusted borrower.')
    const others = all.filter((x) => x.loan.id !== loan.id && x.loan.borrower_id === loan.borrower_id && x.active)
    const lateOthers = others.filter((x) => x.status.rows.some((r) => r.state === 'overdue'))
    if (lateOthers.length) add('bad', 'Another loan is overdue', `${lateOthers.map((x) => loanCode(x.loan.id)).join(', ')} of the same borrower ${lateOthers.length > 1 ? 'are' : 'is'} late.`)
    else if (others.length) add('ok', `${others.length} other open loan${others.length > 1 ? 's' : ''}`, `${others.map((x) => loanCode(x.loan.id)).join(', ')}, all on schedule.`)
  }

  if (voided.length) add('warn', `${voided.length} payment${voided.length > 1 ? 's' : ''} voided`, 'Check the payment history to see why.')
  if (loan.refinance_of) add('ok', `Refinances ${loanCode(loan.refinance_of)}`, 'The old balance was paid off by this loan.')
  if (loan.status === 'approved' || loan.status === 'refinanced') {
    add(gain < 0 ? 'bad' : 'ok', gain < 0 ? 'Expected loss' : 'Expected gain', `${gain >= 0 ? '+' : ''}${fmt(gain, cur)} once everything is collected${loan.amount ? ` (${Math.round((gain / loan.amount) * 100)}% of the loan)` : ''}.`)
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}

const LABEL: Record<Level, string> = { ok: 'All good', warn: 'Needs a look', bad: 'Needs action' }

/** Traffic light for the loan plus the findings: what to focus on first, then what is fine. */
export function Insight({ items }: { items: Finding[] }) {
  const worst: Level = items.reduce<Level>((w, f) => (RANK[f.level] < RANK[w] ? f.level : w), 'ok')
  const focus = items.filter((f) => f.level !== 'ok')
  const fine = items.filter((f) => f.level === 'ok')
  const row = (f: Finding) => (
    <div className="ins-row" key={f.title}>
      <i className={'dot ' + f.level} aria-hidden="true" />
      <span className="grow"><b style={{ display: 'block' }}>{f.title}</b><span className="small muted">{f.detail}</span></span>
    </div>
  )
  return (
    <section className="card">
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <i className={'light ' + worst} aria-hidden="true" />
        <div><div className="eyebrow">Insight</div><b style={{ fontSize: 18 }}>{LABEL[worst]}</b></div>
      </div>
      {focus.length > 0 && <><h3 className="wz-cap" style={{ margin: '14px 0 4px' }}>Focus on</h3>{focus.map(row)}</>}
      {fine.length > 0 && <><h3 className="wz-cap" style={{ margin: '14px 0 4px' }}>Looking good</h3>{fine.map(row)}</>}
    </section>
  )
}
