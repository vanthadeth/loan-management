import { useState, type ReactNode } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@shared/app/auth'
import { useBook } from '@shared/data/book'
import { useBorrowerActions, useBorrowerDocs } from '@shared/data/borrowers'
import { errMsg, useLoans } from '@shared/data/loans'
import { fmtD } from '@shared/lib/format'
import type { Tier } from '@shared/lib/types'
import { useI18n } from '../lib/i18n'
import { useColors } from '../lib/theme'
import { Initials } from '../ui/Avatar'
import { Btn, Card, Chip, Collapse, Empty, IconBtn, Item, KV, LCard, Row, Tabs, Tap } from '../ui/core'
import { Fab, SearchBar, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { BorrowerSheet } from './borrowers/BorrowerSheet'
import { DocumentSheet } from './borrowers/DocumentSheet'
import { FileView } from './loans/FileView'
import { BorrowerChip, LoanRow, tierIcon, useBorrowerName } from './parts'

const FILTERS = ['all', 'gold', 'silver', 'normal', 'banned']

export function Borrowers() {
  const { t } = useI18n()
  const { can } = useAuth()
  const name = useBorrowerName()
  const { data, isLoading, error } = useBook()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const needle = q.trim().toLowerCase()
  const rows = (data?.borrowers ?? []).filter((b) =>
    (filter === 'all' || b.tier === filter || b.status === filter) &&
    (b.name + b.name_km + b.phone + b.id_no).toLowerCase().includes(needle))

  return (
    <Screen title={t('borrowers')} overlay={can('borrowers.edit') ? <Fab label={t('newBorrower')} onPress={() => setAdding(true)} /> : null}>
      <SearchBar value={q} onChange={setQ} />
      <Tabs items={FILTERS.map((f) => ({ key: f, label: t(f), icon: tierIcon(f) }))} value={filter} onChange={setFilter} />
      {error && <T muted>{errMsg(error)}</T>}
      <T v="eyebrow">{rows.length} {t('borrowers')}</T>
      <LCard>
        {rows.map((b) => {
          const banned = b.status === 'banned'
          return (
            <Item key={b.id} onPress={() => router.push(`/borrowers/${b.id}`)}>
              <View style={{ opacity: banned ? 0.5 : 1 }}><Initials name={name(b)} photo={b.photo_path} /></View>
              <View style={{ flex: 1, minWidth: 0, opacity: banned ? 0.75 : 1 }}>
                <T b ell muted={banned}>{name(b)}</T>
                <T v="small" muted ell>{[b.phone, b.address.split(',').pop()?.trim()].filter(Boolean).join(' · ')}</T>
              </View>
              <BorrowerChip b={b} />
            </Item>
          )
        })}
        {!rows.length && <Empty>{isLoading ? 'Loading…' : 'No match.'}</Empty>}
      </LCard>
      {adding && <BorrowerSheet onClose={() => setAdding(false)} />}
    </Screen>
  )
}

const TIERS: Tier[] = ['normal', 'silver', 'gold']
type Dialog = null | 'edit' | 'doc' | 'status' | { tier: Tier }

/** A value with a round action button on the right (".vrow" + ".mcta"). */
function VRow({ label, value, icon, href, action }: { label: string; value: ReactNode; icon?: string; href?: string; action?: string }) {
  const c = useColors()
  return (
    <KV label={label}>
      <Row between>
        <View style={{ flex: 1, minWidth: 0 }}>{typeof value === 'string' ? <T>{value}</T> : value}</View>
        {icon && href && <IconBtn name={icon} size={34} label={action ?? label} bg={c.accentSoft} color={c.accent} onPress={() => Linking.openURL(href)} />}
      </Row>
    </KV>
  )
}

export function BorrowerDetail({ borrowerId }: { borrowerId: number }) {
  const { t } = useI18n()
  const c = useColors()
  const { can } = useAuth()
  const toast = useToast()
  const name = useBorrowerName()
  const { data, isLoading, error } = useBook()
  const { views } = useLoans()
  const docs = useBorrowerDocs(borrowerId)
  const actions = useBorrowerActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [info, setInfo] = useState(false)
  const b = data?.borrowers.find((x) => x.id === borrowerId)
  if (!b) return <Screen title="Borrower"><T muted>{isLoading ? 'Loading…' : error ? errMsg(error) : 'Borrower not found.'}</T></Screen>

  const banned = b.status === 'banned'
  const loans = views.filter((v) => v.loan.borrower_id === b.id)
  const phone = b.phone.split(/[,;/]/)[0].replace(/\s/g, '')
  const hasPlace = b.lat != null && b.lng != null
  const run = (job: () => Promise<void>, done: string) => async () => {
    try {
      await job()
      toast(done)
      setDialog(null)
    } catch (e) {
      toast(errMsg(e))
    }
  }
  const line = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair, paddingBottom: 10 }

  return (
    <Screen title={name(b)}>
      <Card>
        {can('borrowers.edit') && (
          <IconBtn name="edit" size={42} label="Edit borrower" bg={c.accent} color={c.accentInk} onPress={() => setDialog('edit')}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }} />
        )}
        <Row gap={18} style={{ paddingRight: 52, paddingVertical: 4 }}>
          <Initials name={b.name_km || b.name} photo={b.photo_path} size={96} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <T v="h1" size={27} style={{ lineHeight: 32 }}>{name(b)}</T>
            {!!b.name_km && !!b.name && <T muted>{b.name}</T>}
            <Row gap={6} wrap style={{ marginTop: 4 }}>
              <BorrowerChip b={b} />
              {!banned && <Chip kind={b.status} label={t(b.status)} />}
            </Row>
          </View>
        </Row>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, marginTop: 6 }}>
          <Tap onPress={() => setInfo(!info)} accessibilityState={{ expanded: info }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: info ? 10 : 4 }}>
            <T b>Information</T>
            <View style={{ transform: [{ rotate: info ? '90deg' : '0deg' }] }}><Icon name="chev" size={16} color={c.muted} /></View>
          </Tap>
          {info && (
            <View style={{ gap: 10 }}>
              <View style={line}><KV label="ID card no.">{b.id_no || '—'}</KV></View>
              <Row style={line}>
                <KV label="Date of birth" style={{ flex: 1 }}>{fmtD(b.dob)}</KV>
                <KV label="Gender" style={{ flex: 1 }}>
                  {b.gender ? <Row gap={6}><Icon name={b.gender === 'F' ? 'venus' : 'mars'} size={17} color={c.accent} /><T>{b.gender === 'F' ? 'Female' : 'Male'}</T></Row> : '—'}
                </KV>
              </Row>
              <View style={line}><VRow label="Contact numbers" value={b.phone || '—'} icon="phone" href={phone ? 'tel:' + phone : undefined} action="Call" /></View>
              <View style={line}><VRow label="Telegram" value={b.telegram || '—'} icon="tg" href={b.telegram ? 'https://t.me/' + b.telegram.replace('@', '') : undefined} action="Open Telegram" /></View>
              <View style={line}><VRow label="Facebook" value={b.facebook || '—'} icon="fb" href={b.facebook ? 'https://www.facebook.com/' + b.facebook : undefined} action="Open Facebook" /></View>
              <VRow label="Address" icon="pin" action="Open map" href={hasPlace ? `https://www.google.com/maps?q=${b.lat},${b.lng}` : undefined}
                value={<><T>{b.address || '—'}</T>{hasPlace && <T v="small" muted num>{b.lat}, {b.lng}</T>}</>} />
            </View>
          )}
        </View>
        {can('borrowers.ban') && <Btn block kind={banned ? 'primary' : 'danger'} label={banned ? 'Reactivate borrower' : 'Ban borrower'} onPress={() => setDialog('status')} />}
      </Card>

      <Collapse title="Documents">
        {can('borrowers.edit') && <Btn sm label="+ Add document" onPress={() => setDialog('doc')} style={{ alignSelf: 'flex-end' }} />}
        {(docs.data ?? []).map((d) => (
          <Row key={d.id} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
            <View style={{ width: 42, height: 42, borderRadius: 4, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' }}><Icon name="doc" /></View>
            <View style={{ flex: 1, minWidth: 0 }}><T b ell>{d.title}</T><T v="small" muted>{d.note || 'No note'}</T></View>
            <FileView path={d.file_path} />
          </Row>
        ))}
        {!docs.data?.length && <T muted>{docs.isLoading ? 'Loading…' : 'No documents yet.'}</T>}
      </Collapse>

      <Card style={banned ? { opacity: 0.6 } : undefined}>
        <Row gap={8}>{banned && <Icon name="lock" size={18} />}<T v="h2">Trust rating</T></Row>
        <T v="small" muted>{banned ? 'Locked while the borrower is banned.' : 'Set by staff. Normal → Silver (good customer) → Gold (trusted).'}</T>
        <View pointerEvents={banned || !can('borrowers.ban') ? 'none' : 'auto'}>
          <Seg big options={TIERS.map((x) => ({ value: x, label: t(x) }))} value={b.tier} onChange={(x) => x !== b.tier && setDialog({ tier: x as Tier })} />
        </View>
        <T>“{b.note || 'No notes yet'}”</T>
      </Card>

      <Row between>
        <T v="h2">{t('loans')}</T>
        {can('loans.create') && !banned && <Btn sm kind="primary" label={'+ ' + t('newLoan')} onPress={() => router.push(`/loans/new?borrower=${b.id}`)} />}
      </Row>
      <LCard>
        {loans.map((v) => <LoanRow key={v.loan.id} v={v} />)}
        {!loans.length && <Empty>No loans yet.</Empty>}
      </LCard>

      {dialog === 'edit' && <BorrowerSheet borrower={b} onClose={() => setDialog(null)} />}
      {dialog === 'doc' && <DocumentSheet borrowerId={b.id} onClose={() => setDialog(null)} />}
      {dialog === 'status' && (
        <Sheet title={banned ? 'Reactivate borrower?' : 'Ban borrower?'} onClose={() => setDialog(null)} action={{
          label: banned ? 'Confirm reactivate' : 'Confirm ban', kind: banned ? 'primary' : 'danger',
          onClick: run(() => actions.setStatus(b.id, banned ? 'active' : 'banned'), banned ? 'Borrower reactivated' : 'Borrower banned'),
        }}>
          <T>{banned ? 'Reactivate' : 'Ban'} <T b>{name(b)}</T>? {banned ? 'Their trust rating and new loan requests become available again.' : 'New loans cannot be requested and the trust rating is locked.'}</T>
        </Sheet>
      )}
      {typeof dialog === 'object' && dialog && (
        <Sheet title="Change trust rating?" onClose={() => setDialog(null)} action={{ label: 'Confirm change', onClick: run(() => actions.setTier(b.id, dialog.tier), 'Trust rating changed') }}>
          <T>Change <T b>{name(b)}</T> from <T b>{t(b.tier)}</T> to <T b>{t(dialog.tier)}</T>?</T>
        </Sheet>
      )}
    </Screen>
  )
}
