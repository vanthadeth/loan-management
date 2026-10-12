// The phone's version of src/lib/device.ts (metro.config.js swaps it in for the shared code).
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import * as Crypto from 'expo-crypto'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Image } from 'react-native'
import { supabase } from './supabase'
import type { Upload } from '@shared/lib/types'

/** A picked photo or document on the phone. */
export interface PickedFile extends Upload { uri: string }

/**
 * Saved preferences, read synchronously like localStorage on the web. Everything is loaded once at start-up
 * (loadPrefs, before the first screen draws) and written through to AsyncStorage.
 */
const cache = new Map<string, string>()
const PREFIX = 'komjei:'

export async function loadPrefs() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX))
    for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v !== null) cache.set(k.slice(PREFIX.length), v)
  } catch { /* storage unavailable: defaults */ }
}

export const prefs = {
  get: (key: string): string | null => cache.get(key) ?? null,
  set(key: string, value: string) {
    cache.set(key, value)
    AsyncStorage.setItem(PREFIX + key, value).catch(() => {})
  },
}

/** Link sent to new users with their login information. */
export const appUrl = () => process.env.EXPO_PUBLIC_APP_URL || 'the Komjei app'

export async function copyText(value: string) {
  await Clipboard.setStringAsync(value)
}

const asPicked = (f: Upload) => {
  const uri = (f as PickedFile).uri
  if (!uri) throw new Error('This file cannot be read.')
  return uri
}

/** Uploads a picked file to the private 'files' bucket and returns its path. */
export async function uploadFile(folder: string, file: Upload) {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${Crypto.randomUUID()}.${ext}`
  const body = await new File(asPicked(file)).arrayBuffer()
  const { error } = await supabase.storage.from('files').upload(path, body, { contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error(error.message)
  return path
}

const imageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((ok, fail) => Image.getSize(uri, (width, height) => ok({ width, height }), fail))

/** Crops a photo to a centred square JPEG, at most `size` pixels wide. Falls back to the original. */
export async function squarePhoto(file: Upload, size = 512): Promise<Upload> {
  try {
    const uri = asPicked(file)
    const { width, height } = await imageSize(uri)
    const side = Math.min(width, height)
    const ctx = ImageManipulator.manipulate(uri)
    ctx.crop({ originX: (width - side) / 2, originY: (height - side) / 2, width: side, height: side })
    ctx.resize({ width: Math.min(size, side), height: Math.min(size, side) })
    const img = await ctx.renderAsync()
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 })
    return { uri: out.uri, name: 'photo.jpg', type: 'image/jpeg' } as PickedFile
  } catch {
    return file
  }
}
