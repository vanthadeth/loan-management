import { useState } from 'react'
import { Image, Platform, View } from 'react-native'
import * as Location from 'expo-location'
import { useBorrowerActions, type BorrowerFields } from '@shared/data/borrowers'
import { errMsg } from '@shared/data/loans'
import type { Borrower } from '@shared/lib/types'
import type { PickedFile } from '../../lib/device'
import { useI18n } from '../../lib/i18n'
import { pickPhotos } from '../../lib/pick'
import { useColors } from '../../lib/theme'
import { Avatar } from '../../ui/Avatar'
import { Btn, Row } from '../../ui/core'
import { DateField, Field, Label, Seg, TextArea } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const coord = (s: string, limit: number) => {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN
}

/** Add or edit a borrower. Trust level and ban status are changed on the borrower page, not here. */
export function BorrowerSheet({ borrower, onClose }: { borrower?: Borrower; onClose: () => void }) {
  const { t } = useI18n()
  const c = useColors()
  const toast = useToast()
  const actions = useBorrowerActions()
  const [f, setF] = useState({
    name: borrower?.name ?? '', name_km: borrower?.name_km ?? '', id_no: borrower?.id_no ?? '',
    dob: borrower?.dob ?? '', gender: borrower?.gender ?? 'F', phone: borrower?.phone ?? '',
    telegram: borrower?.telegram ?? '', facebook: borrower?.facebook ?? '', address: borrower?.address ?? '',
    lat: borrower?.lat != null ? String(borrower.lat) : '', lng: borrower?.lng != null ? String(borrower.lng) : '',
    note: borrower?.note ?? '',
  })
  const [photo, setPhoto] = useState<PickedFile | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [mapText, setMapText] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const fillLocation = async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await Location.requestForegroundPermissionsAsync()
        if (!perm.granted) { toast('Could not get your location. Allow location access and try again.'); return }
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }))
    } catch {
      toast('Could not get your location. Allow location access and try again.')
    }
  }
  const fromMap = (v: string) => {
    setMapText(v)
    const m = v.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/)
    if (m) setF((s) => ({ ...s, lat: m[1], lng: m[2] }))
  }
  const takePhoto = async (source: 'camera' | 'library') => {
    const [p] = await pickPhotos(source)
    if (p) setPhoto(p)
  }

  const save = async () => {
    const khmer = f.name_km.trim()
    if (!khmer) { toast('Enter the name in Khmer'); return }
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
      <View style={{ gap: 4 }}>
        <Label>Profile photo</Label>
        <Row>
          {photo ? <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} />
            : borrower ? <Avatar p={{ full_name: borrower.name_km || borrower.name, display_name: '', photo_path: borrower.photo_path }} size="lg" />
              : <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={28} /></View>}
          <View style={{ gap: 8 }}>
            <Btn sm icon="camera" label="Take photo" onPress={() => takePhoto('camera')} />
            <Btn sm icon="upload" label="Choose photo" onPress={() => takePhoto('library')} />
          </View>
        </Row>
      </View>
      <Field label="Name in Khmer" value={f.name_km} onChange={set('name_km')} />
      <Field label="Name in Latin letters (optional)" value={f.name} onChange={set('name')} autoCapitalize="words" />
      <Field label="ID card no." value={f.id_no} onChange={set('id_no')} />
      <Row style={{ alignItems: 'flex-end' }}>
        <DateField label="Date of birth" value={f.dob} onChange={set('dob')} style={{ flex: 1 }} />
        <Seg label="Gender" options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} value={f.gender} onChange={set('gender')} style={{ flex: 1 }} />
      </Row>
      <Field label="Contact numbers" inputMode="tel" value={f.phone} onChange={set('phone')} />
      <Field label="Telegram" value={f.telegram} onChange={set('telegram')} autoCapitalize="none" />
      <Field label="Facebook" value={f.facebook} onChange={set('facebook')} autoCapitalize="none" />
      <Field label="Address" value={f.address} onChange={set('address')} />
      <Row>
        <Field label="Latitude" inputMode="decimal" value={f.lat} onChange={set('lat')} style={{ flex: 1 }} />
        <Field label="Longitude" inputMode="decimal" value={f.lng} onChange={set('lng')} style={{ flex: 1 }} />
      </Row>
      <Row>
        <Btn icon="pin" label="Use current location" onPress={fillLocation} style={{ flex: 1, minHeight: 46 }} />
        <Btn icon="pin" label="From Google Map" onPress={() => setShowMap(!showMap)} style={{ flex: 1, minHeight: 46 }} />
      </Row>
      {showMap && <Field label="Paste a Google Maps link or coordinates" placeholder="https://maps.google.com/?q=11.5564,104.9282" value={mapText} onChange={fromMap} autoFocus autoCapitalize="none" />}
      <TextArea label="Note" value={f.note} onChange={set('note')} />
    </Sheet>
  )
}
