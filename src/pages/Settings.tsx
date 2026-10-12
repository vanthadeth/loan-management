import { useState } from 'react'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { applyTheme, savedTheme, useI18n, type Theme } from '../app/i18n'
import { useSettings } from '../data/core'
import { useCopy, useRun, useSaveContractTemplate, useSaveSettings } from '../data/admin'
import { checkTemplate } from '../data/contract'
import { PLACEHOLDERS, STARTER_TEMPLATE } from '../lib/contract'
import { fmt } from '../lib/format'
import { Field } from '../ui/Controls'
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
  const [khr, setKhr] = useState(String(s.late_fee_khr))
  const [usd, setUsd] = useState(String(s.late_fee_usd))
  const submit = async () => {
    const patch = { service_fee_pct: num(fee), late_fee_khr: num(khr), late_fee_usd: num(usd) }
    if (!(patch.service_fee_pct >= 0 && patch.service_fee_pct < 100) || !(patch.late_fee_khr >= 0) || !(patch.late_fee_usd >= 0)) {
      toast('Check the numbers')
      return
    }
    if (await run(() => save(patch), 'Settings saved')) onClose()
  }
  return (
    <Sheet title="System settings" onClose={onClose} action={{ onClick: submit }}>
      <div className="form wz-1col">
        <Field id="sf" label="Service fee (%)" value={fee} onChange={setFee} inputMode="decimal" />
        <Field id="sk" label="Late fee per day, KHR loans" value={khr} onChange={setKhr} inputMode="decimal" />
        <Field id="su" label="Late fee per day, USD loans" value={usd} onChange={setUsd} inputMode="decimal" />
        <p className="small muted" style={{ margin: 0 }}>Applies to new loans and to late fees from now on.</p>
      </div>
    </Sheet>
  )
}

function TemplateSheet({ current, onClose }: { current: string; onClose: () => void }) {
  const run = useRun()
  const save = useSaveContractTemplate()
  const [url, setUrl] = useState(current)
  const submit = async () => {
    const link = url.trim()
    const ok = await run(async () => {
      if (link) await checkTemplate(link) // fails with a clear message when Google will not share the doc
      await save(link)
    }, link ? 'Contract template saved' : 'Contract template removed')
    if (ok) onClose()
  }
  return (
    <Sheet title="Contract template link" onClose={onClose} action={{ onClick: submit }}>
      <div className="form wz-1col">
        <Field id="ct" label="Google Doc link" value={url} onChange={setUrl} placeholder="https://docs.google.com/document/d/…" />
        <p className="small muted" style={{ margin: 0 }}>In the Google Doc choose Share, set General access to "Anyone with the link" as Viewer, then paste the link here. Leave it empty to remove the template.</p>
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
  const [linking, setLinking] = useState(false)
  const copy = useCopy()
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
            <button className="mcta" aria-label="Edit system settings" title="Edit system settings" onClick={() => setEditing(true)}><Icon name="edit" size={17} /></button>
          )}
        </div>
        <div className="bpair">
          <section className="bt">
            <span className="bt-h">Service fee</span>
            <b className="bt-big num">{s ? `${s.service_fee_pct}%` : '—'}</b>
            <span className="small bt-sub">Deducted at release</span>
          </section>
          <section className="bt">
            <span className="bt-h">Late fee / day</span>
            <b className="bt-big num">{s ? fmt(s.late_fee_khr, 'KHR') : '—'}</b>
            <span className="small bt-sub">{s ? fmt(s.late_fee_usd, 'USD') : '—'} for USD loans</span>
          </section>
        </div>
      </div>
      <div className="bsec">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="bh" style={{ margin: 0 }}>Contract template</div>
          {can('settings.edit') && (
            <button className="mcta" aria-label="Set template link" title="Set template link" onClick={() => setLinking(true)}><Icon name="edit" size={17} /></button>
          )}
        </div>
        <section className="bt">
          <span className="bt-h"><Icon name="doc" size={18} />Google Doc</span>
          {s?.contract_template_url
            ? <a className="rlink" style={{ textDecoration: 'none' }} href={s.contract_template_url} target="_blank" rel="noopener noreferrer"><span className="grow"><b>Open the template</b></span><Icon name="chev" size={16} /></a>
            : <span className="small bt-sub">No template yet. A contract is made from it each time a loan is requested.</span>}
          {can('settings.edit') && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="btn sm" onClick={() => { void copy(STARTER_TEMPLATE, 'Starter text'); window.open('https://docs.google.com/document/create', '_blank', 'noopener') }}>
                <Icon name="plus" size={16} />Create a template
              </button>
              <button className="btn sm" onClick={() => setLinking(true)}>Set template link</button>
            </div>
          )}
          <details className="binfo">
            <summary><span>Placeholders you can use</span><Icon name="chev" size={16} /></summary>
            <p className="small muted" style={{ margin: '6px 0' }}>Type these in the Google Doc, with the double braces. Tap one to copy it. "Create a template" opens a blank Google Doc and copies a starter contract to paste in.</p>
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
      {linking && <TemplateSheet current={s?.contract_template_url ?? ''} onClose={() => setLinking(false)} />}
      {editing && s && <SettingsSheet s={s} onClose={() => setEditing(false)} />}
    </div>
  )
}
