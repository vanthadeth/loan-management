// Everything the shared data layer needs from the platform, in one place. This is the browser version;
// the mobile app (mobile/) swaps in its own module with the same exports when it bundles src/.
import { supabase } from './supabase'
import type { Upload } from './types'

/** Small saved preferences (currency, hidden amounts, report range...). Read synchronously. */
export const prefs = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* private mode */ }
  },
}

/** Where people open the app; sent to new users with their login. */
export const appUrl = () => window.location.origin

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

/** Uploads a file to the private 'files' bucket and returns its path. */
export async function uploadFile(folder: string, file: Upload) {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('files').upload(path, file as File, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

/**
 * Shrinks a photo to a square JPEG so uploads stay small and avatars load fast.
 * Falls back to the original file when the browser cannot decode it (e.g. HEIC).
 */
export async function squarePhoto(file: Upload, size = 512): Promise<Upload> {
  try {
    const bmp = await createImageBitmap(file as File)
    const side = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(size, side)
    canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86))
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}
