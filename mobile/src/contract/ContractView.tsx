import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { ContractInput, ContractLang } from '@shared/lib/contract'
import type { PageSetup } from '@shared/lib/pagesetup'
import { useColors } from '../lib/theme'
import { T } from '../ui/Text'
import { KIT_HTML } from './kit.generated'

export interface FilledDoc { page: PageSetup; print: string; word: string }

/**
 * One Google Doc template filled with a loan's details and shown at its own page width, scaled to the screen.
 * The filling runs inside the WebView with the web app's contract code (see scripts/contract-kit.ts).
 */
export function ContractView({ html, input, lang, annexPage, onReady, label }: {
  html: string; input: ContractInput; lang: ContractLang; annexPage: boolean; onReady: (d: FilledDoc | null) => void; label: string
}) {
  const c = useColors()
  const ref = useRef<WebView>(null)
  const [height, setHeight] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const job = JSON.stringify({ html, input, lang, annexPage })

  useEffect(() => {
    if (loaded) ref.current?.injectJavaScript(`window.komjeiFill(${job});true;`)
  }, [loaded, job])

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { type: string; message?: string; height?: number } & Partial<FilledDoc>
    if (m.type === 'loaded') setLoaded(true)
    else if (m.type === 'error') { setError(m.message ?? 'The contract could not be made.'); onReady(null) }
    else if (m.type === 'ready' && m.page && m.print && m.word) {
      setError(null)
      setHeight(Math.max(200, Math.ceil(m.height ?? 500)))
      onReady({ page: m.page, print: m.print, word: m.word })
    }
  }

  if (Platform.OS === 'web') return <T muted>The contract preview is available in the phone app.</T>
  return (
    <View accessibilityLabel={label} style={{ backgroundColor: c.surface, borderRadius: 9, overflow: 'hidden', borderWidth: 0.5, borderColor: c.hair }}>
      {error && <T color={c.late} style={{ padding: 12 }}>{error}</T>}
      <WebView
        ref={ref} onLoadEnd={() => setLoaded(true)} originWhitelist={['*']} source={{ html: KIT_HTML, baseUrl: 'https://localhost/' }} onMessage={onMessage}
        style={{ height, backgroundColor: 'transparent' }} scrollEnabled={false} javaScriptEnabled
        startInLoadingState renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />}
      />
    </View>
  )
}
