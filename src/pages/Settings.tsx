import { useState } from 'react'
import { useAuth } from '../app/auth'
import { usePageTitle } from '../app/Layout'
import { applyTheme, savedTheme, useI18n, type Theme } from '../app/i18n'
import { useSettings } from '../data/core'
import { useRun, useSaveSettings } from '../data/admin'
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

export function Settings() {
  const { can } = useAuth()
  const { lang, setLang } = useI18n()
  const settings = useSettings()
  const [theme, setTheme] = useState<Theme>(savedTheme())
  const [editing, setEditing] = useState(false)
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
      {editing && s && <SettingsSheet s={s} onClose={() => setEditing(false)} />}
    </div>
  )
}
