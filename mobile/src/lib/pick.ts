import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'
import type { PickedFile } from './device'
import { toast } from '../ui/Toast'

const guessType = (name: string) =>
  /\.pdf$/i.test(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : /\.(heic|heif)$/i.test(name) ? 'image/heic' : 'image/jpeg'

/** Takes a photo with the camera, or picks one or more from the library. Resolves to [] when cancelled. */
export async function pickPhotos(source: 'camera' | 'library', multiple = false): Promise<PickedFile[]> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: multiple }
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { toast('Allow camera access in Settings to take photos.'); return [] }
  }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (res.canceled) return []
  return res.assets.map((a, i) => {
    const name = a.fileName || `photo-${Date.now()}-${i}.jpg`
    return { uri: a.uri, name, type: a.mimeType || guessType(name) }
  })
}

/** Picks files (photos or PDFs) from the phone's files. */
export async function pickFiles(multiple = false): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple, copyToCacheDirectory: true })
  if (res.canceled) return []
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType || guessType(a.name) }))
}
