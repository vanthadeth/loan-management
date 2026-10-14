/** The loading screen. The same markup and styles sit inline in index.html so it shows before any script runs. */
export function Splash({ label = 'Opening your ledger' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-label="Loading">
      <div className="sp-sheet">
        {[0, 1, 2, 3, 4].map((i) => <i className="sp-ln" key={i} />)}
        <i className="sp-ln sum" />
      </div>
      <div className="sp-word">Komjei</div>
      <div className="sp-foot">{label}</div>
    </div>
  )
}
