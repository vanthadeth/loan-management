import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Dropdown } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { usePageTitle } from '../app/Layout'
import { useAuth } from '../app/auth'
import { dn, useBanks, useTeam } from '../data/core'
import { useContractTemplates, useTemplateHtml } from '../data/contract'
import { errMsg, useLoanFiles, useLoans } from '../data/loans'
import { cleanDocument, contractValues, fillScheduleRows, fillScheduleTable, fillTemplate, scheduleRowValues, type ContractInput, type ContractLang } from '../lib/contract'
import { loanCode } from '../lib/format'

const PAGE_PX = 816 // Google Docs' default page width (8.5 in at 96 dpi); the preview is scaled to fit narrow screens
const PAGE_H = Math.round((PAGE_PX * 297) / 210) // an A4 sheet at that width
const ANNEX_TOP = 60
const BUILT_IN = '0'

/** Pushes each built-in annex down to the top of the next sheet, so it starts on its own page in the PDF too. */
function alignAnnex(d: Document) {
  d.querySelectorAll<HTMLElement>('.komjei-annex').forEach((el) => {
    el.style.marginTop = ''
    const off = (el.getBoundingClientRect().top + d.documentElement.scrollTop) % PAGE_H
    el.style.marginTop = PAGE_H - off + ANNEX_TOP + 'px'
  })
}

/** One filled Google Doc, shown in a sandboxed frame scaled to the available width. */
function DocFrame({ doc, frameRef, label }: { doc: string; frameRef: RefObject<HTMLIFrameElement | null>; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(1100)
  useEffect(() => {
    const fit = () => box.current && setScale(Math.min(1, (box.current.clientWidth - 16) / PAGE_PX))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [doc])
  const measure = useCallback(() => {
    const d = frameRef.current?.contentDocument
    if (!d) return
    alignAnnex(d)
    setHeight(Math.max(d.documentElement.scrollHeight, 400))
  }, [frameRef])
  return (
    <div ref={box} className="card" style={{ padding: 8, overflow: 'hidden' }} aria-label={label}>
      <div style={{ height: height * scale }}>
        <iframe
          ref={frameRef} title={label} srcDoc={doc} onLoad={measure}
          sandbox="allow-same-origin allow-modals"
          style={{ width: PAGE_PX, height, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
    </div>
  )
}

export function Contract() {
  const loanId = Number(useParams().id)
  const toast = useToast()
  const { can } = useAuth()
  const { views, loading } = useLoans()
  const files = useLoanFiles(loanId)
  const team = useTeam()
  const banks = useBanks()
  const templates = useContractTemplates()
  const [params, setParams] = useSearchParams()
  const all = templates.data ?? []
  const contracts = all.filter((t) => t.kind === 'contract')
  const schedules = all.filter((t) => t.kind === 'schedule')
  const chosen = contracts.find((t) => String(t.id) === params.get('t')) ?? contracts[0]
  // the schedule annex: a separate template when one exists, otherwise the built-in annex from {{schedule}}
  const sParam = params.get('s')
  const sched = sParam === BUILT_IN ? undefined : schedules.find((t) => String(t.id) === sParam) ?? schedules[0]
  const tpl = useTemplateHtml(chosen?.url)
  const stpl = useTemplateHtml(sched?.url)
  const frame = useRef<HTMLIFrameElement>(null)
  const sframe = useRef<HTMLIFrameElement>(null)
  const [busy, setBusy] = useState(false)
  usePageTitle('Contract')

  const v = views.find((x) => x.loan.id === loanId)
  const input = useMemo<ContractInput | null>(() => {
    if (!v || !v.borrower || !files.data) return null
    const bank = banks.data?.find((b) => b.id === v.loan.bank_account_id)
    return {
      loanId, terms: v.terms, frequency: v.loan.frequency, payMethod: v.loan.pay_method,
      bank: bank ?? null, payRemarks: v.loan.pay_remarks,
      borrower: v.borrower, collaterals: files.data.collaterals.map((c) => c.description),
      supervisor: dn(team.data?.find((p) => p.id === v.loan.supervisor_id)),
    }
  }, [v, files.data, banks.data, team.data, loanId])

  const fill = (html: string, lang: ContractLang, annexPage: boolean) => {
    const rows = fillScheduleRows(html, scheduleRowValues(input!, lang))
    return cleanDocument(fillTemplate(fillScheduleTable(rows, input!, lang, annexPage), contractValues(input!, lang)), lang)
  }
  const doc = useMemo(() => (input && tpl.html && chosen ? fill(tpl.html, chosen.lang, !sched) : null), [input, tpl.html, chosen, sched]) // eslint-disable-line react-hooks/exhaustive-deps
  const sdoc = useMemo(() => (input && stpl.html && sched ? fill(stpl.html, sched.lang, false) : null), [input, stpl.html, sched]) // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    const frames = [frame.current, sched ? sframe.current : null].filter((f): f is HTMLIFrameElement => !!f)
    if (!frames.length) return
    setBusy(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      let first = true
      for (const f of frames) {
        const d = f.contentDocument
        if (!d) continue
        await d.fonts.ready // the Khmer font must be loaded before the page is drawn
        alignAnnex(d) // fonts change the line heights, so place a built-in annex again
        const height = Math.ceil(d.body.scrollHeight)
        // drawn inside its own frame, so the template's styles apply
        const canvas = await html2canvas(d.body, { scale: height > 7000 ? 1.5 : 2, useCORS: true, backgroundColor: '#fff', width: PAGE_PX, windowWidth: PAGE_PX })
        const sheet = Math.floor((canvas.width * 297) / 210)
        for (let y = 0; y < canvas.height; y += sheet) {
          const h = Math.min(sheet, canvas.height - y)
          const part = document.createElement('canvas')
          part.width = canvas.width
          part.height = h
          part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
          if (!first) pdf.addPage()
          first = false
          pdf.addImage(part.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, (h / canvas.width) * 210)
        }
      }
      pdf.save(`${loanCode(loanId)}-contract.pdf`)
    } catch (e) {
      toast(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!v) return <p className="muted">{loading ? 'Loading…' : 'Loan not found.'}</p>
  if (templates.isLoading || tpl.loading || stpl.loading) return <p className="muted">Preparing the contract…</p>
  if (!chosen) {
    return (
      <div className="card">
        <h2>No contract template yet</h2>
        <p className="muted">{can('settings.edit') ? 'Add a contract template from a Google Doc in Settings, then come back here.' : 'Ask an admin to set up the contract template in Settings.'}</p>
        {can('settings.edit') && <Link className="btn primary" style={{ textDecoration: 'none' }} to="/settings"><Icon name="doc" size={17} />Open Settings</Link>}
      </div>
    )
  }
  const err = tpl.error ?? stpl.error
  if (err) {
    return (
      <div className="card">
        <h2>Could not read the template</h2>
        <p className="muted">{err}</p>
        <button className="btn" onClick={() => { void tpl.refetch(); void stpl.refetch() }}><Icon name="refresh" size={17} />Try again</button>
      </div>
    )
  }

  const label = (t: { name: string; lang: string }) => `${t.name} (${t.lang === 'km' ? 'Khmer' : 'English'})`
  return (
    <>
      {contracts.length > 1 && (
        <Dropdown id="ctpl" label="Contract template" options={contracts.map((t) => ({ value: String(t.id), label: label(t) }))}
          value={String(chosen.id)} onChange={(val) => setParams({ t: val, ...(sParam ? { s: sParam } : {}) }, { replace: true })} />
      )}
      {schedules.length > 0 && (
        <Dropdown id="stpl" label="Payment schedule template" options={[...schedules.map((t) => ({ value: String(t.id), label: label(t) })), { value: BUILT_IN, label: 'Built-in annex (from {{schedule}})' }]}
          value={sched ? String(sched.id) : BUILT_IN} onChange={(val) => setParams({ ...(params.get('t') ? { t: params.get('t')! } : {}), s: val }, { replace: true })} />
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy || !doc} onClick={download}><Icon name="download" size={17} />{busy ? 'Making PDF…' : 'Download PDF'}</button>
        <button className="btn" disabled={!doc} onClick={() => frame.current?.contentWindow?.print()}>Print contract</button>
        {sdoc && <button className="btn" onClick={() => sframe.current?.contentWindow?.print()}>Print schedule</button>}
        <Link className="btn" style={{ textDecoration: 'none', color: 'inherit' }} to={`/loans/${loanId}`}>Back to loan</Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Made from "{chosen.name}"{sched ? <> and the schedule template "{sched.name}"</> : null} with this loan's details. Any {'{{placeholder}}'} still showing in the text is not recognised; check its spelling in the template.</p>
      {doc && <DocFrame doc={doc} frameRef={frame} label="Contract" />}
      {sdoc && <DocFrame doc={sdoc} frameRef={sframe} label="Payment schedule" />}
    </>
  )
}
