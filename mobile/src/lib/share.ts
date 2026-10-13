import { File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'

const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-')

/** Saves text as a file in the cache and opens the share sheet (save to Files, send by Telegram, email…). */
export async function shareText(name: string, text: string, mimeType: string, UTI?: string) {
  if (Platform.OS === 'web') return downloadOnWeb(name, text, mimeType)
  const file = new File(Paths.cache, safe(name))
  file.create({ overwrite: true })
  file.write(text)
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: name })
}

/** Makes a PDF from an HTML page and opens the share sheet. Page size in CSS px (96 per inch). */
export async function sharePdf(name: string, html: string, page?: { wPx: number; hPx: number }) {
  if (Platform.OS === 'web') return Print.printAsync({ html })
  // expo-print measures pages in points (72 per inch)
  const size = page ? { width: Math.round(page.wPx * 0.75), height: Math.round(page.hPx * 0.75) } : {}
  const { uri } = await Print.printToFileAsync({ html, ...size })
  const file = new File(uri)
  const named = new File(Paths.cache, safe(name))
  if (named.exists) named.delete()
  await file.move(named)
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name })
}

/** Opens the system print dialog for an HTML page. */
export const printHtml = (html: string) => Print.printAsync({ html })

function downloadOnWeb(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
