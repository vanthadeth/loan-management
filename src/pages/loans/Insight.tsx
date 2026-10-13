import type { LoanView } from '../../data/book'
import type { Discrepancy } from '../../data/audit'
import { fmt, loanCode } from '../../lib/format'
import { diffDays, todayIso } from '../../lib/calc'

type Level = 'ok' | 'warn' | 'bad'
type Scope = 'loan' | 'borrower'
interface Finding { scope: Scope; level: Level; title: string; detail: string }

const RANK: Record<Level, number> = { bad: 0, warn: 1, ok: 2 }

/** What an admin should know about this loan, worst first. Each finding is a traffic light: green, amber, red. */
export function findings(v: LoanView, all: LoanView[], gain: number, books?: Discrepancy[]): Finding[] {
  const { loan, status, borrower, payments, voided } = v
  const cur = loan.currency
  const out: Finding[] = []
  const add = (level: Level, title: string, detail: string, scope: Scope = 'loan') => out.push({ scope, level, title, detail })
  const addB = (level: Level, title: string, detail: string) => add(level, title, detail, 'borrower')
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
    if (borrower.status === 'banned') addB('bad', 'Borrower is banned', 'Think twice before collecting or lending more.')
    else if (borrower.tier === 'bad') addB('bad', 'Rated Bad', 'Trust level is the lowest.')
    else if (borrower.tier === 'gold' || borrower.tier === 'silver') addB('ok', `Rated ${borrower.tier === 'gold' ? 'Gold' : 'Silver'}`, 'A trusted borrower.')
    const mine = all.filter((x) => x.loan.borrower_id === loan.borrower_id && !x.loan.voided_at && (x.loan.status === 'approved' || x.loan.status === 'refinanced'))
    const others = mine.filter((x) => x.loan.id !== loan.id && x.active)
    const lateOthers = others.filter((x) => x.status.rows.some((r) => r.state === 'overdue'))
    if (lateOthers.length) addB('bad', 'Another loan is overdue', `${lateOthers.map((x) => loanCode(x.loan.id)).join(', ')} ${lateOthers.length > 1 ? 'are' : 'is'} late.`)
    else if (others.length) addB('ok', `${others.length} other open loan${others.length > 1 ? 's' : ''}`, `${others.map((x) => loanCode(x.loan.id)).join(', ')}, all on schedule.`)
    // track record over every loan of this borrower: installments that were paid after their due date
    const rows = mine.flatMap((x) => x.status.rows).filter((r) => r.state === 'paid')
    const lateRows = rows.filter((r) => r.lateDays > 0)
    if (rows.length >= 3) {
      const share = Math.round((lateRows.length / rows.length) * 100)
      addB(share >= 50 ? 'bad' : share >= 25 ? 'warn' : 'ok', share >= 25 ? 'Often pays late' : 'Pays on time', `${lateRows.length} of ${rows.length} installments paid across ${mine.length} loan${mine.length > 1 ? 's' : ''} came after the due date.`)
    }
    const owed = new Map<string, number>()
    others.concat(mine.filter((x) => x.loan.id === loan.id && x.active)).forEach((x) => owed.set(x.loan.currency, (owed.get(x.loan.currency) ?? 0) + x.status.remaining))
    if (owed.size) addB('ok', 'Owes in total', [...owed].map(([c, n]) => fmt(n, c as typeof cur)).join(' + ') + ' left to collect across the open loans.')
  }

  // the database's own records checked against each other (R-SNAP-4); undefined while loading or not available
  if (books) {
    if (books.length === 0) add('ok', 'Books agree', 'Schedule, payments, allocations and snapshots match.')
    else add('bad', 'Books do not agree', books.map((b) => `${b.check_name}: expected ${b.expected}, found ${b.actual}`).join('; '))
  }
  if (voided.length) add('warn', `${voided.length} payment${voided.length > 1 ? 's' : ''} voided`, 'Check the payment history to see why.')
  if (loan.refinance_of) add('ok', `Refinances ${loanCode(loan.refinance_of)}`, 'The old balance was paid off by this loan.')
  if (loan.status === 'approved' || loan.status === 'refinanced') {
    add(gain < 0 ? 'bad' : 'ok', gain < 0 ? 'Expected loss' : 'Expected gain', `${gain >= 0 ? '+' : ''}${fmt(gain, cur)} once everything is collected${loan.amount ? ` (${Math.round((gain / loan.amount) * 100)}% of the loan)` : ''}.`)
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}

const LABEL: Record<Level, string> = { ok: 'All good', warn: 'Needs a look', bad: 'Needs action' }

/** Traffic light for this loan and this borrower, then each finding: what to focus on first, then what is fine. */
export function Insight({ items, borrowerName }: { items: Finding[]; borrowerName: string }) {
  const worst: Level = items.reduce<Level>((w, f) => (RANK[f.level] < RANK[w] ? f.level : w), 'ok')
  const row = (f: Finding) => (
    <div className="ins-row" key={f.title}>
      <i className={'dot ' + f.level} aria-hidden="true" />
      <span className="grow"><b style={{ display: 'block' }}>{f.title}</b><span className="small muted">{f.detail}</span></span>
    </div>
  )
  const group = (scope: Scope, title: string) => {
    const list = items.filter((f) => f.scope === scope)
    return list.length > 0 && <section className="card"><h3 className="wz-cap" style={{ margin: '0 0 4px' }}>{title}</h3>{list.map(row)}</section>
  }
  return (
    <>
      <section className="card">
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <i className={'light ' + worst} aria-hidden="true" />
          <div><div className="eyebrow">Insight</div><b style={{ fontSize: 18 }}>{LABEL[worst]}</b></div>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>This loan and {borrowerName}, nothing else. Worst first.</p>
      </section>
      {group('loan', 'This loan')}
      {group('borrower', `Borrower · ${borrowerName}`)}
    </>
  )
}
