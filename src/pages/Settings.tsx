import { useState } from 'react'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { applyTheme, savedTheme, useI18n, type Theme } from '../app/i18n'
import { useSettings } from '../data/core'
import { useCopy, useRun, useSaveSettings } from '../data/admin'
import { useContractTemplates, useTemplateActions } from '../data/contract'
import { PLACEHOLDERS, STARTER_EN, STARTER_KM, STARTER_SCHEDULE_EN, STARTER_SCHEDULE_KM } from '../lib/contract'
import type { ContractTemplate } from '../lib/types'
import { Field, Seg } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import type { AppSettings } from '../lib/types'

const THEMES: [Theme, string, string][] = [['light', 'sun', 'Light'], ['dark', 'theme', 'Dark'], ['auto', 'auto', 'Auto']]
const num = (v: string) => Number(v.replace(/[^\d.]/g, ''))

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
      <div className="form wz-1col">
        <Field id="sf" label="Service fee (%)" value={fee} onChange={setFee} inputMode="decimal" />
        <Field id="sk" label="Late fee (% of the unpaid installment, per late payment period)" value={late} onChange={setLate} inputMode="decimal" />
        <p className="small muted" style={{ margin: 0 }}>Applies to new loans and to late fees from now on.</p>
      </div>
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
      <div className="form wz-1col">
        <Field id="tn" label="Name" value={name} onChange={setName} placeholder={kind === 'schedule' ? 'e.g. Repayment schedule' : 'e.g. Standard loan contract'} />
        <Seg id="tk" label="Type" options={[{ value: 'contract', label: 'Contract' }, { value: 'schedule', label: 'Payment schedule (annex)' }]} value={kind} onChange={(v) => setKind(v as 'contract' | 'schedule')} />
        <Seg id="tl" label="Language" options={[{ value: 'km', label: 'Khmer' }, { value: 'en', label: 'English' }]} value={lang} onChange={(v) => setLang(v as 'km' | 'en')} />
        <Field id="tu" label="Google Doc link" value={url} onChange={setUrl} placeholder="https://docs.google.com/document/d/…" />
        <p className="small muted" style={{ margin: 0 }}>In the Google Doc choose Share, set General access to "Anyone with the link" as Viewer, then paste the link here. For a Khmer contract every field is filled in Khmer: digits, dates, currency and amounts in words.</p>
      </div>
    </Sheet>
  )
}

export function Settings() {
  const { can } = useAuth()
  const { lang, setLang } = useI18n()
  const settings = useSettings()
  const [theme, setTheme] = useState<Theme>(savedTheme())
  const [editing, setEditing] = useState(false)
  const [tplSheet, setTplSheet] = useState<null | { template?: ContractTemplate }>(null)
  const [removing, setRemoving] = useState<ContractTemplate | null>(null)
  const templates = useContractTemplates()
  const tplActions = useTemplateActions()
  const copy = useCopy()
  const run = useRun()
  usePageTitle('Settings')
  const s = settings.data

  return (
    <div className="bento">
      <div className="bsec">
        <div className="bh">Preferences</div>
        <div className="bpair">
          <section className="bt">
            <span className="bt-h">Language</span>
            <div className="seg bseg" role="group" aria-label="Language">
              <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              <button aria-pressed={lang === 'km'} onClick={() => setLang('km')}>ខ្មែរ</button>
            </div>
          </section>
          <section className="bt">
            <span className="bt-h">Theme</span>
            <div className="seg bseg" role="group" aria-label="Theme">
              {THEMES.map(([k, icon, name]) => (
                <button key={k} aria-pressed={theme === k} aria-label={name} title={name} onClick={() => { setTheme(k); applyTheme(k) }}>
                  <Icon name={icon} size={17} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="bsec">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="bh" style={{ margin: 0 }}>System settings</div>
          {can('settings.edit') && s && (
            <button className="mcta" style={{ background: "none", border: 0, cursor: "pointer" }} aria-label="Edit system settings" title="Edit system settings" onClick={() => setEditing(true)}><Icon name="edit" size={17} /></button>
          )}
        </div>
        <div className="bpair">
          <section className="bt">
            <span className="bt-h">Service fee</span>
            <b className="bt-big num">{s ? `${s.service_fee_pct}%` : '—'}</b>
            <span className="small bt-sub">Deducted at release</span>
          </section>
          <section className="bt">
            <span className="bt-h">Late fee</span>
            <b className="bt-big num">{s ? `${s.late_fee_pct}%` : '—'}</b>
            <span className="small bt-sub">Per late payment period</span>
          </section>
        </div>
      </div>
      <div className="bsec">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="bh" style={{ margin: 0 }}>Contract templates</div>
          {can('settings.edit') && (
            <button className="mcta" aria-label="Add contract template" title="Add contract template" onClick={() => setTplSheet({})}><Icon name="plus" size={17} /></button>
          )}
        </div>
        <section className="bt">
          <span className="bt-h"><Icon name="doc" size={18} />Google Docs</span>
          {(templates.data ?? []).length ? (
            <div className="lcard">
              {(templates.data ?? []).map((t) => (
                <div className="item" key={t.id} style={{ cursor: 'default' }}>
                  <a className="grow" style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }} href={t.url} target="_blank" rel="noopener noreferrer">
                    <b className="ell" style={{ display: 'block' }}>{t.name}</b>
                    <span className="small muted">{t.kind === 'schedule' ? 'Payment schedule' : 'Contract'} · {t.lang === 'km' ? 'Khmer' : 'English'} · open in Google Docs</span>
                  </a>
                  {can('settings.edit') && (
                    <>
                      <button className="mcta" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setTplSheet({ template: t })}><Icon name="edit" size={16} /></button>
                      <button className="mcta" aria-label={`Remove ${t.name}`} title="Remove" onClick={() => setRemoving(t)}><Icon name="x" size={16} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="small bt-sub">No template yet. Add a contract template, and optionally a separate payment schedule template, and a contract can be made for every loan.</span>
          )}
          {can('settings.edit') && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="btn sm" onClick={() => { void copy(STARTER_KM, 'Khmer starter text'); window.open('https://docs.google.com/document/create', '_blank', 'noopener') }}>
                <Icon name="plus" size={16} />Create Khmer template
              </button>
              <button className="btn sm" onClick={() => { void copy(STARTER_EN, 'English starter text'); window.open('https://docs.google.com/document/create', '_blank', 'noopener') }}>
                Create English template
              </button>
              <button className="btn sm" onClick={() => { void copy(STARTER_SCHEDULE_KM, 'Khmer schedule starter text'); window.open('https://docs.google.com/document/create', '_blank', 'noopener') }}>
                Create schedule template
              </button>
              <button className="btn sm" onClick={() => { void copy(STARTER_SCHEDULE_EN, 'English schedule starter text'); window.open('https://docs.google.com/document/create', '_blank', 'noopener') }}>
                English schedule
              </button>
              <button className="btn sm" onClick={() => setTplSheet({})}>Add link</button>
            </div>
          )}
          <details className="binfo">
            <summary><span>Placeholders you can use</span><Icon name="chev" size={16} /></summary>
            <p className="small muted" style={{ margin: '6px 0' }}>Type these in the Google Doc, with the double braces. Tap one to copy it. "Create Khmer template" opens a blank Google Doc and copies a starter contract to paste in. In a Khmer template every value is filled in Khmer, in an English template in English. To force a language whatever the template, add _km or _en: {'{{amount_km}}'} is always Khmer, {'{{amount_en}}'} always English (it works on every placeholder below, including the schedule ones).</p>
            <div className="lcard">
              {PLACEHOLDERS.map(([k, d]) => (
                <button key={k} className="item" onClick={() => void copy(`{{${k}}}`, 'Placeholder')}>
                  <span className="grow"><b className="ell" style={{ display: 'block' }}>{`{{${k}}}`}</b><span className="small muted">{d}</span></span>
                  <Icon name="copy" size={16} />
                </button>
              ))}
            </div>
          </details>
        </section>
      </div>
      {tplSheet && <TemplateSheet template={tplSheet.template} onClose={() => setTplSheet(null)} />}
      {removing && (
        <Sheet title="Remove template?" onClose={() => setRemoving(null)} action={{ label: 'Remove', cls: 'danger', onClick: async () => { await run(() => tplActions.remove(removing.id), 'Template removed'); setRemoving(null) } }}>
          <p style={{ margin: '0 0 6px' }}>Remove <b>{removing.name}</b> from the list? The Google Doc itself is not deleted.</p>
        </Sheet>
      )}
      {editing && s && <SettingsSheet s={s} onClose={() => setEditing(false)} />}
    </div>
  )
}
