import { useState } from 'react'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useBorrowerActions } from '../../data/borrowers'
import { errMsg } from '../../data/loans'

export function DocumentSheet({ borrowerId, onClose }: { borrowerId: number; onClose: () => void }) {
  const toast = useToast()
  const actions = useBorrowerActions()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const save = async () => {
    if (!title.trim()) { toast('Enter a title first'); document.getElementById('dt')?.focus(); return }
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
      <div className="form">
        <div className="field full">
          <label htmlFor="dt">Title</label>
          <input id="dt" type="text" placeholder="e.g. Land title, Marriage certificate" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field full">
          <label htmlFor="dn">Details note</label>
          <textarea id="dn" rows={3} placeholder="What is this document, how many pages, who issued it…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="drop full" style={{ gridColumn: '1/-1' }}>
          <span className="ell">{file ? file.name : 'File or photo'}</span>
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            Add file / photo<input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </label>
        </div>
      </div>
    </Sheet>
  )
}
