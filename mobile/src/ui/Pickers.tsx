import { Image, View } from 'react-native'
import type { PickedFile } from '../lib/device'
import { pickFiles, pickPhotos } from '../lib/pick'
import { useColors } from '../lib/theme'
import { Btn, Row } from './core'
import { Label } from './Controls'
import { Icon } from './Icon'
import { T } from './Text'

/** Dashed box with Camera / Photos (/ Files) buttons (".drop"). */
export function PickBox({ hint, onPick, multiple, files, label }: {
  hint: string; onPick: (f: PickedFile[]) => void; multiple?: boolean; files?: boolean; label?: string
}) {
  const c = useColors()
  return (
    <View style={{ gap: 4 }}>
      {label && <Label>{label}</Label>}
      <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, borderRadius: 6, padding: 12, gap: 10, backgroundColor: c.surface2 }}>
        <T v="small" muted>{hint}</T>
        <Row gap={8} wrap>
          <Btn sm icon="camera" label="Camera" onPress={async () => onPick(await pickPhotos('camera'))} />
          <Btn sm icon="upload" label="Photos" onPress={async () => onPick(await pickPhotos('library', multiple))} />
          {files && <Btn sm icon="doc" label="Files" onPress={async () => onPick(await pickFiles(multiple))} />}
        </Row>
      </View>
    </View>
  )
}

/** A picked file with a thumbnail (for images) and a remove button. */
export function PickedRow({ file, onRemove }: { file: PickedFile; onRemove?: () => void }) {
  const c = useColors()
  const image = file.type.startsWith('image/')
  return (
    <Row style={{ paddingVertical: 6 }}>
      {image
        ? <Image source={{ uri: file.uri }} style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: c.surface2 }} />
        : <View style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="doc" color={c.accent} /></View>}
      <T v="small" ell style={{ flex: 1 }}>{file.name}</T>
      {onRemove && <Btn sm label="Remove" onPress={onRemove} />}
    </Row>
  )
}
