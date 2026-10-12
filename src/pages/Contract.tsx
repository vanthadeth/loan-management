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
import { allScheduleRows, allValues, cleanDocument, fillScheduleRows, fillScheduleTable, fillTemplate, type ContractInput, type ContractLang } from '../lib/contract'
import { loanCode } from '../lib/format'
import { readPageSetup, type PageSetup } from '../lib/pagesetup'

const BUILT_IN = '0'
const DEFAULT_PAGE_PX = 816 // Google Docs' default (Letter) page width, used until the document's own setup is read

/** The document's page setup, applied to printing: its page size and margins on every page. */
function applyPrintSetup(d: Document, p: PageSetup) {
  d.getElementById('komjei-page')?.remove()
  const st = d.createElement('style')
  st.id = 'komjei-page'
  st.textContent = `@page{size:${p.wPx}px ${p.hPx}px;margin:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px}@media print{body{padding:0!important;max-width:none!important}}`
  d.head.append(st)
}

/** One filled Google Doc, shown in a sandboxed frame at its own page width, scaled to fit the screen. */
function DocFrame({ doc, frameRef, label }: { doc: string; frameRef: RefObject<HTMLIFrameElement | null>; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(1100)
  const [page, setPage] = useState<PageSetup | null>(null)
  const width = page?.wPx ?? DEFAULT_PAGE_PX
  useEffect(() => {
    const fit = () => box.current && setScale(Math.min(1, (box.current.clientWidth - 16) / width))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [doc, width])
  const measure = useCallback(() => {
    const d = frameRef.current?.contentDocument
    if (!d) return
    const p = readPageSetup(d)
    applyPrintSetup(d, p)
    setPage(p)
    setHeight(Math.max(d.documentElement.scrollHeight, 400))
  }, [frameRef])
  return (
    <div ref={box} className="card" style={{ padding: 8, overflow: 'hidden' }} aria-label={label}>
      <div style={{ height: height * scale }}>
        <iframe
          ref={frameRef} title={label} srcDoc={doc} onLoad={measure}
          sandbox="allow-same-origin allow-modals"
          style={{ width: Math.max(width, 1000), height, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
      {page && <p className="small muted" style={{ margin: '6px 4px 0' }}>Page: {page.name}, {Math.round(page.wMm)} × {Math.round(page.hMm)} mm</p>}
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
    const rows = fillScheduleRows(html, allScheduleRows(input!, lang))
    return cleanDocument(fillTemplate(fillScheduleTable(rows, input!, lang, annexPage), allValues(input!, lang)), lang)
  }
  const doc = useMemo(() => (input && tpl.html && chosen ? fill(tpl.html, chosen.lang, !sched) : null), [input, tpl.html, chosen, sched]) // eslint-disable-line react-hooks/exhaustive-deps
  const sdoc = useMemo(() => (input && stpl.html && sched ? fill(stpl.html, sched.lang, false) : null), [input, stpl.html, sched]) // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    const frames = [frame.current, sched ? sframe.current : null].filter((f): f is HTMLIFrameElement => !!f)
    if (!frames.length) return
    setBusy(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      let pdf: InstanceType<typeof jsPDF> | null = null
      for (const f of frames) {
        const d = f.contentDocument
        if (!d) continue
        await d.fonts.ready // the Khmer font must be loaded before the page is drawn
        const page = readPageSetup(d)
        // Margins are put back on every sheet below, so draw the content without top and bottom padding.
        const body = d.body
        const saved = { top: body.style.paddingTop, bottom: body.style.paddingBottom, margin: body.style.margin }
        body.style.paddingTop = body.style.paddingBottom = '0'
        body.style.margin = '0' // so positions measured here are the same ones the picture is drawn at
        try {
          await new Promise((r) => requestAnimationFrame(r)) // let the layout settle before measuring
          // the picture starts at the top of the document, so measure from there (not from the body, whose
          // box can sit lower when the first paragraph's margin collapses through it)
          const origin = d.documentElement.getBoundingClientRect().top
          const total = Math.ceil(body.getBoundingClientRect().bottom - origin)
          // good places to start a new sheet: just below a paragraph, row or heading, and at an annex
          const ends = [...body.querySelectorAll('p, tr, li, h1, h2, h3, h4, h5, h6, table, div')].map((el) => el.getBoundingClientRect().bottom - origin)
          const forced = [...body.querySelectorAll('.komjei-annex')].map((el) => el.getBoundingClientRect().top - origin)
          const scale = total > 7000 ? 1.5 : 2
          const canvas = await html2canvas(body, { scale, useCORS: true, backgroundColor: '#fff', width: page.wPx, windowWidth: page.wPx })
          const room = page.hPx - page.top - page.bottom // content height on one sheet
          const orient = page.wMm > page.hMm ? 'landscape' : 'portrait'
          const size: [number, number] = [Math.min(page.wMm, page.hMm), Math.max(page.wMm, page.hMm)]
          let y = 0
          while (y < total - 1) {
            let end = Math.min(y + room, total)
            const cut = forced.find((t) => t > y + 1 && t < end)
            if (cut !== undefined) end = cut
            else if (end < total) {
              const fits = ends.filter((e) => e > y + room * 0.4 && e <= end)
              if (fits.length) end = Math.max(...fits)
            }
            const sy = Math.round(y * scale)
            const sh = Math.max(1, Math.min(Math.round((end - y) * scale), canvas.height - sy))
            const part = document.createElement('canvas')
            part.width = canvas.width
            part.height = sh
            part.getContext('2d')!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
            if (!pdf) pdf = new jsPDF({ unit: 'mm', format: size, orientation: orient })
            else pdf.addPage(size, orient)
            const mmPerCanvasPx = page.wMm / canvas.width
            pdf.addImage(part.toDataURL('image/jpeg', 0.96), 'JPEG', 0, page.top * (25.4 / 96), page.wMm, sh * mmPerCanvasPx)
            // the next sheet starts a hair lower, so glyph tails of the last line are not drawn twice
            y = end + (end < total ? 3 : 0)
          }
        } finally {
          body.style.paddingTop = saved.top
          body.style.paddingBottom = saved.bottom
          body.style.margin = saved.margin
        }
      }
      pdf?.save(`${loanCode(loanId)}-contract.pdf`)
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
