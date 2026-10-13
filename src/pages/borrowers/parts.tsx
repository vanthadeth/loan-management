import { Icon } from '../../ui/Icon'
import { useI18n } from '../../app/i18n'
import type { Borrower } from '../../lib/types'

const ICON: Record<string, string> = { all: 'asterisk', gold: 'medal', silver: 'medal', normal: 'userp', bad: 'alert', banned: 'ban' }

/** Small icon for a trust level / filter, as used on chips and tabs. */
export function TierIcon({ kind, size }: { kind: string; size: number }) {
  return ICON[kind] ? <Icon name={ICON[kind]} size={size} /> : null
}

/** Trust level chip, or the Banned chip for banned borrowers. */
export function BorrowerChip({ b }: { b: Pick<Borrower, 'tier' | 'status'> }) {
  const { t } = useI18n()
  const kind = b.status === 'banned' ? 'banned' : b.tier
  return <span className={'chip ' + kind}><TierIcon kind={kind} size={12} />{t(kind)}</span>
}

export function TierChip({ tier }: { tier: Borrower['tier'] }) {
  const { t } = useI18n()
  return <span className={'chip ' + tier}><TierIcon kind={tier} size={12} />{t(tier)}</span>
}
