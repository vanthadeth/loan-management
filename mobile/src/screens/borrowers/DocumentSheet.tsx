import { useState } from 'react'
import { useBorrowerActions } from '@shared/data/borrowers'
import { errMsg } from '@shared/data/loans'
import type { PickedFile } from '../../lib/device'
import { Field, TextArea } from '../../ui/Controls'
import { PickBox, PickedRow } from '../../ui/Pickers'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

export function DocumentSheet({ borrowerId, onClose }: { borrowerId: number; onClose: () => void }) {
  const toast = useToast()
  const actions = useBorrowerActions()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<PickedFile | null>(null)
  const save = async () => {
    if (!title.trim()) { toast('Enter a title first'); return }
    try {
      await actions.addDocument(borrowerId, title.trim(), note.trim(), file)
      toast('Document added')
      onClose()
    } catch (e) {
      toast(errMsg(e))
    }
  }
  return (
    <Sheet title="Add document" onClose={onClose} action={{ onClick: save }}>
      <Field label="Title" placeholder="e.g. Land title, Marriage certificate" value={title} onChange={setTitle} />
      <TextArea label="Details note" placeholder="What is this document, how many pages, who issued it…" value={note} onChange={setNote} />
      {file ? <PickedRow file={file} onRemove={() => setFile(null)} /> : <PickBox hint="File or photo" files onPick={(f) => f[0] && setFile(f[0])} />}
    </Sheet>
  )
}
