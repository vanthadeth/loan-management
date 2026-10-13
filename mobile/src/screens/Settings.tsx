import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '@shared/app/auth'
import { useCopy, useRun, useSaveSettings } from '@shared/data/admin'
import { useSettings } from '@shared/data/core'
import { useContractTemplates, useTemplateActions } from '@shared/data/contract'
import { PLACEHOLDERS, STARTER_EN, STARTER_KM, STARTER_SCHEDULE_EN, STARTER_SCHEDULE_KM } from '@shared/lib/contract'
import type { AppSettings, ContractTemplate } from '@shared/lib/types'
import { hapticsOn, setHaptics } from '../lib/haptics'
import { useI18n } from '../lib/i18n'
import { useColors, useTheme, type ThemePref } from '../lib/theme'
import { Btn, Card, IconBtn, Item, Row, Tap } from '../ui/core'
import { Field, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { T } from '../ui/Text'
import { useToast } from '../ui/Toast'
import { Tile } from './parts'

const num = (v: string) => Number(v.replace(/[^\d.]/g, ''))
const NEW_DOC = 'https://docs.google.com/document/create'

function SettingsSheet({ s, onClose }: { s: AppSettings; onClose: () => void }) {
  const toast = useToast()
  const run = useRun()
  const save = useSaveSettings()
  const [fee, setFee] = useState(String(s.service_fee_pct))
  const [late, setLate] = useState(String(s.late_fee_pct))
  const submit = async () => {
    const patch = { service_fee_pct: num(fee), late_fee_pct: num(late) }
    if (!(patch.service_fee_pct >= 0 && patch.service_fee_pct < 100) || !(patch.late_fee_pct >= 0 && patch.late_fee_pct <= 100)) {
      toast('Check the numbers')
      return
    }
    if (await run(() => save(patch), 'Settings saved')) onClose()
  }
  return (
    <Sheet title="System settings" onClose={onClose} action={{ onClick: submit }}>
      <Field label="Service fee (%)" value={fee} onChange={setFee} inputMode="decimal" />
      <Field label="Late fee (% of the unpaid installment, per late payment period)" value={late} onChange={setLate} inputMode="decimal" />
      <T v="small" muted>Applies to new loans and to late fees from now on.</T>
    </Sheet>
  )
}

function TemplateSheet({ template, onClose }: { template?: ContractTemplate; onClose: () => void }) {
  const run = useRun()
  const toast = useToast()
  const actions = useTemplateActions()
  const [name, setName] = useState(template?.name ?? '')
  const [lang, setLang] = useState<'km' | 'en'>(template?.lang ?? 'km')
  const [kind, setKind] = useState<'contract' | 'schedule'>(template?.kind ?? 'contract')
  const [url, setUrl] = useState(template?.url ?? '')
  const submit = async () => {
    if (!name.trim()) { toast('Give the template a name'); return }
    if (!url.trim()) { toast('Paste the Google Doc link'); return }
    // saving checks that Google will share the document, and says why when it will not
    const ok = await run(() => actions.save({ id: template?.id, name: name.trim(), url: url.trim(), lang, kind }), 'Contract template saved')
    if (ok) onClose()
  }
  return (
    <Sheet title={template ? 'Edit contract template' : 'Add contract template'} onClose={onClose} action={{ onClick: submit }}>
      <Field label="Name" value={name} onChange={setName} placeholder={kind === 'schedule' ? 'e.g. Repayment schedule' : 'e.g. Standard loan contract'} />
      <Seg label="Type" options={[{ value: 'contract', label: 'Contract' }, { value: 'schedule', label: 'Payment schedule (annex)' }]} value={kind} onChange={(v) => setKind(v as 'contract' | 'schedule')} />
      <Seg label="Language" options={[{ value: 'km', label: 'Khmer' }, { value: 'en', label: 'English' }]} value={lang} onChange={(v) => setLang(v as 'km' | 'en')} />
      <Field label="Google Doc link" value={url} onChange={setUrl} placeholder="https://docs.google.com/document/d/…" autoCapitalize="none" />
      <T v="small" muted>In the Google Doc choose Share, set General access to "Anyone with the link" as Viewer, then paste the link here. For a Khmer contract every field is filled in Khmer: digits, dates, currency and amounts in words.</T>
    </Sheet>
  )
}

const Heading = ({ label, right }: { label: string; right?: React.ReactNode }) => {
  const c = useColors()
  return (
    <Row style={{ paddingTop: 12 }}>
      <T v="eyebrow">{label}</T>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.hair }} />
      {right}
    </Row>
  )
}

export function Settings() {
  const c = useColors()
  const { can } = useAuth()
  const { lang, setLang } = useI18n()
  const { pref, setPref } = useTheme()
  const settings = useSettings()
  const [buzz, setBuzz] = useState(hapticsOn())
  const [editing, setEditing] = useState(false)
  const [tplSheet, setTplSheet] = useState<null | { template?: ContractTemplate }>(null)
  const [removing, setRemoving] = useState<ContractTemplate | null>(null)
  const [showKeys, setShowKeys] = useState(false)
  const templates = useContractTemplates()
  const tplActions = useTemplateActions()
  const copy = useCopy()
  const run = useRun()
  const s = settings.data
  const starter = async (text: string, label: string) => { await copy(text, label); await WebBrowser.openBrowserAsync(NEW_DOC) }

  return (
    <Screen title="Settings">
      <Heading label="Preferences" />
      <Tile label="Language">
        <Seg options={[{ value: 'en', label: 'EN' }, { value: 'km', label: 'ខ្មែរ' }]} value={lang} onChange={(v) => setLang(v as 'en' | 'km')} />
      </Tile>
      <Tile label="Theme">
        <Seg options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }]} value={pref} onChange={(v) => setPref(v as ThemePref)} />
      </Tile>
      <Tile label="Haptic feedback" sub="A short vibration on taps.">
        <Seg options={['On', 'Off']} value={buzz ? 'On' : 'Off'} onChange={(v) => { setBuzz(v === 'On'); setHaptics(v === 'On') }} />
      </Tile>

      <Heading label="System settings" right={can('settings.edit') && s ? <IconBtn name="edit" size={34} label="Edit system settings" bg="transparent" color={c.accent} onPress={() => setEditing(true)} /> : null} />
      <Row gap={14} style={{ alignItems: 'stretch' }}>
        <Tile style={{ flex: 1 }} label="Service fee" sub="Deducted at release"><T b num size={22}>{s ? `${s.service_fee_pct}%` : '—'}</T></Tile>
        <Tile style={{ flex: 1 }} label="Late fee" sub="Per late payment period"><T b num size={22}>{s ? `${s.late_fee_pct}%` : '—'}</T></Tile>
      </Row>

      <Heading label="Contract templates" right={can('settings.edit') ? <IconBtn name="plus" size={34} label="Add contract template" bg={c.accentSoft} color={c.accent} onPress={() => setTplSheet({})} /> : null} />
      <Card>
        <Row gap={10}><Icon name="doc" size={18} color={c.muted} /><T b size={12.5} muted>Google Docs</T></Row>
        {(templates.data ?? []).length ? (
          <>
            {([['contract', 'Contract'], ['schedule', 'Payment schedule']] as const).map(([kind, title]) => {
              const list = (templates.data ?? []).filter((x) => x.kind === kind)
              return (
                <View key={kind} style={{ gap: 2 }}>
                  <T v="eyebrow" style={{ marginTop: 6 }}>{title}</T>
                  {list.length ? list.map((x) => (
                    <Row key={x.id} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair }}>
                      <Tap onPress={() => WebBrowser.openBrowserAsync(x.url)} style={{ flex: 1, minWidth: 0 }}>
                        <T b ell>{x.name}{x.is_default ? <T v="small" muted> · Default</T> : null}</T>
                        <T v="small" muted>{x.lang === 'km' ? 'Khmer' : 'English'} · open in Google Docs</T>
                      </Tap>
                      {can('settings.edit') && (
                        <>
                          <IconBtn name="star" size={34} bg="transparent" color={x.is_default ? c.gold : c.muted}
                            label={x.is_default ? `${x.name} is the default` : `Make ${x.name} the default`}
                            onPress={() => { if (!x.is_default) void run(() => tplActions.makeDefault(x.id, x.kind), 'Default template set') }} />
                          <IconBtn name="edit" size={34} bg={c.accentSoft} color={c.accent} label={`Edit ${x.name}`} onPress={() => setTplSheet({ template: x })} />
                          <IconBtn name="x" size={34} bg={c.accentSoft} color={c.accent} label={`Remove ${x.name}`} onPress={() => setRemoving(x)} />
                        </>
                      )}
                    </Row>
                  )) : <T v="small" muted>None yet{kind === 'schedule' ? '. Contracts then use the built-in annex.' : '.'}</T>}
                </View>
              )
            })}
            <T v="small" muted>The default of each type is selected when you open a contract. You can pick another template there.</T>
          </>
        ) : (
          <T v="small" muted>No template yet. Add a contract template, and optionally a separate payment schedule template, and a contract can be made for every loan.</T>
        )}
        {can('settings.edit') && (
          <Row gap={8} wrap>
            <Btn sm icon="plus" label="Create Khmer template" onPress={() => starter(STARTER_KM, 'Khmer starter text')} />
            <Btn sm label="Create English template" onPress={() => starter(STARTER_EN, 'English starter text')} />
            <Btn sm label="Create schedule template" onPress={() => starter(STARTER_SCHEDULE_KM, 'Khmer schedule starter text')} />
            <Btn sm label="English schedule" onPress={() => starter(STARTER_SCHEDULE_EN, 'English schedule starter text')} />
            <Btn sm label="Add link" onPress={() => setTplSheet({})} />
          </Row>
        )}
        <Tap onPress={() => setShowKeys(!showKeys)} accessibilityState={{ expanded: showKeys }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
          <T b>Placeholders you can use</T>
          <View style={{ transform: [{ rotate: showKeys ? '90deg' : '0deg' }] }}><Icon name="chev" size={16} color={c.muted} /></View>
        </Tap>
        {showKeys && (
          <>
            <T v="small" muted>Type these in the Google Doc, with the double braces. Tap one to copy it. "Create Khmer template" opens a blank Google Doc and copies a starter contract to paste in. In a Khmer template every value is filled in Khmer, in an English template in English. To force a language whatever the template, add _km or _en: {'{{amount_km}}'} is always Khmer, {'{{amount_en}}'} always English (it works on every placeholder below, including the schedule ones).</T>
            {PLACEHOLDERS.map(([k, d]) => (
              <Item key={k} onPress={() => void copy(`{{${k}}}`, 'Placeholder')} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hair, paddingVertical: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}><T b ell>{`{{${k}}}`}</T><T v="small" muted>{d}</T></View>
                <Icon name="copy" size={16} color={c.muted} />
              </Item>
            ))}
          </>
        )}
      </Card>
      {tplSheet && <TemplateSheet template={tplSheet.template} onClose={() => setTplSheet(null)} />}
      {removing && (
        <Sheet title="Remove template?" onClose={() => setRemoving(null)} action={{ label: 'Remove', kind: 'danger', onClick: async () => { await run(() => tplActions.remove(removing.id, removing.kind), 'Template removed'); setRemoving(null) } }}>
          <T>Remove <T b>{removing.name}</T> from the list? The Google Doc itself is not deleted.</T>
        </Sheet>
      )}
      {editing && s && <SettingsSheet s={s} onClose={() => setEditing(false)} />}
    </Screen>
  )
}
