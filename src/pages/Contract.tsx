import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { dn, useBanks, useTeam } from '../data/core'
import { useContractTemplate } from '../data/contract'
import { errMsg, useLoanFiles, useLoans } from '../data/loans'
import { cleanDocument, contractValues, fillTemplate } from '../lib/contract'
import { loanCode } from '../lib/format'

const PAGE_PX = 794 // A4 width at 96 dpi; the preview is scaled down to fit narrow screens

export function Contract() {
  const loanId = Number(useParams().id)
  const toast = useToast()
  const { can } = useAuth()
  const { views, loading } = useLoans()
  const files = useLoanFiles(loanId)
  const team = useTeam()
  const banks = useBanks()
  const tpl = useContractTemplate()
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(1100)
  const [busy, setBusy] = useState(false)
  usePageTitle('Contract')

  const v = views.find((x) => x.loan.id === loanId)
  const doc = useMemo(() => {
    if (!v || !v.borrower || !tpl.template || !files.data) return null
    const bank = banks.data?.find((b) => b.id === v.loan.bank_account_id)
    const values = contractValues({
      loanId, terms: v.terms, frequency: v.loan.frequency, payMethod: v.loan.pay_method,
      bankText: bank ? `${bank.bank} ${bank.account_no}` : '', payRemarks: v.loan.pay_remarks,
      borrower: v.borrower, collaterals: files.data.collaterals.map((c) => c.description),
      supervisor: dn(team.data?.find((p) => p.id === v.loan.supervisor_id)),
    })
    return cleanDocument(fillTemplate(tpl.template.html, values))
  }, [v, tpl.template, files.data, banks.data, team.data, loanId])

  useEffect(() => {
    const fit = () => box.current && setScale(Math.min(1, (box.current.clientWidth - 16) / PAGE_PX))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [doc])

  const measure = () => {
    const d = frame.current?.contentDocument
    if (d) setHeight(Math.max(d.documentElement.scrollHeight, 400))
  }

  const download = async () => {
    const body = frame.current?.contentDocument?.body
    if (!body) return
    setBusy(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const options = {
        margin: [14, 14, 16, 14] as [number, number, number, number], filename: `${loanCode(loanId)}-contract.pdf`,
        image: { type: 'jpeg' as const, quality: 0.96 }, html2canvas: { scale: 2, useCORS: true, windowWidth: PAGE_PX },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }, pagebreak: { mode: ['css', 'legacy'] },
      }
      await html2pdf().set(options).from(body).save()
    } catch (e) {
      toast(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!v) return <p className="muted">{loading ? 'Loading…' : 'Loan not found.'}</p>
  if (!tpl.ready || tpl.loading) return <p className="muted">Preparing the contract…</p>
  if (!tpl.url) {
    return (
      <div className="card">
        <h2>No contract template yet</h2>
        <p className="muted">{can('settings.edit') ? 'Create a template from a Google Doc in Settings, then come back here.' : 'Ask an admin to set up the contract template in Settings.'}</p>
        {can('settings.edit') && <Link className="btn primary" style={{ textDecoration: 'none' }} to="/settings"><Icon name="doc" size={17} />Open Settings</Link>}
      </div>
    )
  }
  if (tpl.error) {
    return (
      <div className="card">
        <h2>Could not read the template</h2>
        <p className="muted">{tpl.error}</p>
        <button className="btn" onClick={() => tpl.refetch()}><Icon name="refresh" size={17} />Try again</button>
      </div>
    )
  }

  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy || !doc} onClick={download}><Icon name="download" size={17} />{busy ? 'Making PDF…' : 'Download PDF'}</button>
        <button className="btn" disabled={!doc} onClick={() => frame.current?.contentWindow?.print()}>Print</button>
        <Link className="btn" style={{ textDecoration: 'none', color: 'inherit' }} to={`/loans/${loanId}`}>Back to loan</Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Made from the Google Doc template with this loan's details. Any {'{{placeholder}}'} still showing in the text is not recognised; check its spelling in the template.</p>
      <div ref={box} className="card" style={{ padding: 8, overflow: 'hidden' }}>
        <div style={{ height: height * scale }}>
          {doc && (
            <iframe
              ref={frame} title="Contract" srcDoc={doc} onLoad={measure}
              sandbox="allow-same-origin allow-modals"
              style={{ width: PAGE_PX, height, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
            />
          )}
        </div>
      </div>
    </>
  )
}
