import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { useI18n } from '../app/i18n'
import { bname } from '../data/borrowers'
import { useLoans } from '../data/loans'
import { dueParts } from '../data/money'
import type { Currency } from '../lib/calc'
import { fmt, loanCode } from '../lib/format'
import { buildToday, type Item } from '../data/today'
import { Icon } from '../ui/Icon'

function Group({ title, icon, items, empty, nav }: { title: string; icon: string; items: Item[]; empty: string; nav: (to: string) => void }) {
  return (
    <section>
      <div className="bh" style={{ paddingTop: 8 }}>
        <Icon name={icon} size={16} /> {title} <span className="muted">· {items.length}</span>
      </div>
      <div className="lcard">
        {items.map((x) => (
          <button type="button" className="item" key={x.key} onClick={() => nav(`/loans/${x.v.loan.id}`)}>
            <span className="grow">
              <span className="row between">
                <b className="ell">{bname(x.v.borrower)}</b>
                {x.amount !== undefined && <b className="num">{fmt(x.amount, x.v.loan.currency)}</b>}
              </span>
              <span className="small muted" style={x.tone ? { color: 'var(--warn)' } : undefined}>{loanCode(x.v.loan.id)} · {x.main}{x.sub ? ` · ${x.sub}` : ''}</span>
            </span>
            <Icon name="chev" size={16} />
          </button>
        ))}
        {!items.length && <p className="muted small" style={{ margin: 0, padding: '12px 14px' }}>{empty}</p>}
      </div>
    </section>
  )
}

/** A to-do list for the day: what to collect, what is late, what needs approval and what to release. */
export function Today() {
  const { t } = useI18n()
  const { can } = useAuth()
  const nav = useNavigate()
  const { views, loading, error } = useLoans()
  usePageTitle('Today')
  const { late, dueToday, dueSoon, pending, release } = buildToday(views)
  const sum = (xs: Item[], c: Currency) => xs.filter((x) => x.v.loan.currency === c).reduce((s, x) => s + (x.amount ?? 0), 0)
  const toCollect = (['KHR', 'USD'] as Currency[]).map((c) => [c, sum(dueToday, c) + sum(late, c)] as const).filter(([, n]) => n > 0)
  const nothing = !late.length && !dueToday.length && !dueSoon.length && !(can('loans.approve') && pending.length) && !release.length

  return (
    <>
      <div className="bento lqs">
        <div className="bt lq">
          <span className="bt-h"><Icon name="clock" size={18} />To collect</span>
          <b className="bt-big num">{dueToday.length + late.length}</b>
          <span className="small bt-sub">{toCollect.length ? toCollect.map(([c, n]) => fmt(n, c)).join(' · ') : 'Nothing due'}</span>
        </div>
        <div className="bt lq">
          <span className="bt-h"><Icon name="alert" size={18} />{t('overdue')}</span>
          <b className="bt-big num">{late.length}</b>
          <span className="small bt-sub">{late.length ? 'Follow up today' : 'All on time'}</span>
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && nothing && <p className="muted">Nothing to do today.</p>}
      {<Group title="Late payments" icon="alert" items={late} empty="No late payments." nav={nav} />}
      <Group title="Due today" icon="clock" items={dueToday} empty="Nothing due today." nav={nav} />
      {dueSoon.length > 0 && <Group title="Due in the next 3 days" icon="cal" items={dueSoon} empty="" nav={nav} />}
      {can('loans.approve') && <Group title="Waiting for approval" icon="checkc" items={pending} empty="No loans waiting." nav={nav} />}
      <Group title="Loans to release" icon="wallet" items={release} empty="No approved loans waiting for release." nav={nav} />
    </>
  )
}
