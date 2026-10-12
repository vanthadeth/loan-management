import { useFileUrl } from '../../data/loans'

/** "View" button for a private file; opens the signed URL in a new tab. */
export function FileView({ path, label = 'View' }: { path: string | null; label?: string }) {
  const url = useFileUrl(path)
  if (!path) return <span className="small muted">No file</span>
  return url
    ? <a className="btn sm ghost" href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{label}</a>
    : <button type="button" className="btn sm ghost" disabled>{label}</button>
}
