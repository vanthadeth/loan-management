import { useEffect, useMemo, useState } from 'react'
import { DateField, Field, Seg, TextArea } from '../../ui/Controls'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useI18n } from '../../app/i18n'
import { useBorrowerActions, type BorrowerFields } from '../../data/borrowers'
import { errMsg } from '../../data/loans'
import type { Borrower } from '../../lib/types'

const coord = (s: string, limit: number) => {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN
}

/** Add or edit a borrower. Trust level and ban status are changed on the borrower page, not here. */
export function BorrowerSheet({ borrower, onClose }: { borrower?: Borrower; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const actions = useBorrowerActions()
  const [f, setF] = useState({
    name: borrower?.name ?? '', name_km: borrower?.name_km ?? '', id_no: borrower?.id_no ?? '',
    dob: borrower?.dob ?? '', gender: borrower?.gender ?? 'F', phone: borrower?.phone ?? '',
    telegram: borrower?.telegram ?? '', facebook: borrower?.facebook ?? '', address: borrower?.address ?? '',
    lat: borrower?.lat != null ? String(borrower.lat) : '', lng: borrower?.lng != null ? String(borrower.lng) : '',
    note: borrower?.note ?? '',
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [showMap, setShowMap] = useState(false)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = '' }
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const fillLocation = () => {
    if (!navigator.geolocation) { toast('Location is not available on this device.'); return }
    navigator.geolocation.getCurrentPosition(
      (p) => setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => toast('Could not get your location. Allow location access and try again.'),
      { timeout: 6000, maximumAge: 60000 },
    )
  }
  const fromMap = (v: string) => {
    const m = v.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/)
    if (m) setF((s) => ({ ...s, lat: m[1], lng: m[2] }))
  }

  const save = async () => {
    const khmer = f.name_km.trim()
    if (!khmer) { toast('Enter the name in Khmer'); document.getElementById('bk')?.focus(); return }
    const lat = coord(f.lat, 90)
    const lng = coord(f.lng, 180)
    if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === null) !== (lng === null)) { toast('Check the latitude and longitude'); return }
    const fields: BorrowerFields = {
      name: f.name.trim(), name_km: khmer, gender: f.gender === 'M' ? 'M' : 'F', dob: f.dob || null, id_no: f.id_no.trim(),
      address: f.address.trim(), lat, lng, phone: f.phone.trim(), facebook: f.facebook.trim(), telegram: f.telegram.trim(), note: f.note.trim(),
    }
    try {
      if (borrower) await actions.save(borrower.id, fields, photo)
      else await actions.create(fields, photo)
      toast(borrower ? 'Borrower saved' : 'Borrower added')
      onClose()
    } catch (e) {
      toast(errMsg(e))
    }
  }

  return (
    <Sheet title={borrower ? 'Edit borrower' : t('newBorrower')} onClose={onClose} action={{ onClick: save }}>
      <div className="form two">
        <div className="field full">
          <label>Profile photo</label>
          <div className="row">
            {preview ? <span className="avatar lg" style={{ backgroundImage: `url('${preview}')` }} />
              : borrower ? <Avatar p={{ full_name: borrower.name_km || borrower.name, display_name: '', photo_path: borrower.photo_path }} size="lg" />
              : <span className="avatar lg"><Icon name="camera" size={28} /></span>}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <Icon name="camera" size={16} />Take photo
                <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
              </label>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={16} />Choose from gallery
                <input type="file" accept="image/*" hidden onChange={pick} />
              </label>
            </div>
          </div>
        </div>
        <Field id="bk" label="Name in Khmer" value={f.name_km} onChange={set('name_km')} cls="full" />
        <Field id="bn" label="Name in Latin letters (optional)" value={f.name} onChange={set('name')} cls="full" />
        <Field id="bi" label="ID card no." value={f.id_no} onChange={set('id_no')} cls="full" />
        <DateField id="bd" label="Date of birth" value={f.dob} onChange={set('dob')} />
        <Seg id="bg" label="Gender" options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} value={f.gender} onChange={set('gender')} />
        <Field id="bt" label="Contact numbers" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} cls="full" />
        <Field id="btg" label="Telegram" value={f.telegram} onChange={set('telegram')} cls="full" />
        <Field id="bf" label="Facebook" value={f.facebook} onChange={set('facebook')} cls="full" />
        <Field id="ba" label="Address" value={f.address} onChange={set('address')} cls="full" />
        <Field id="blat" label="Latitude" inputMode="decimal" value={f.lat} onChange={set('lat')} />
        <Field id="blng" label="Longitude" inputMode="decimal" value={f.lng} onChange={set('lng')} />
        <div className="full two2">
          <button className="btn locbtn" type="button" onClick={fillLocation}><Icon name="pin" size={16} /><span>Use current location</span></button>
          <button className="btn locbtn" type="button" aria-controls="bmapw" aria-expanded={showMap} onClick={() => setShowMap(!showMap)}><Icon name="pin" size={16} /><span>From Google Map</span></button>
        </div>
        {showMap && (
          <div className="field full" id="bmapw">
            <label htmlFor="bmap">Paste a Google Maps link or coordinates</label>
            <input id="bmap" type="text" placeholder="https://maps.google.com/?q=11.5564,104.9282" autoComplete="off" autoFocus onChange={(e) => fromMap(e.target.value)} />
          </div>
        )}
        <TextArea id="bnote" label="Note" value={f.note} onChange={set('note')} cls="full" />
      </div>
    </Sheet>
  )
}
