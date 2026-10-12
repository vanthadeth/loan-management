import * as WebBrowser from 'expo-web-browser'
import { useFileUrl } from '@shared/data/loans'
import { Btn } from '../../ui/core'
import { T } from '../../ui/Text'

/** "View" button for a private file; opens the signed URL in the in-app browser. */
export function FileView({ path, label = 'View' }: { path: string | null; label?: string }) {
  const url = useFileUrl(path)
  if (!path) return <T v="small" muted>No file</T>
  return <Btn sm kind="ghost" label={label} disabled={!url} onPress={() => { if (url) void WebBrowser.openBrowserAsync(url) }} />
}
