// Runs inside the contract WebView, where there is a real browser DOM. It fills a Google Doc template with the
// web app's own code (src/lib/contract.ts), shows it scaled to the screen, and sends back the page setup, a
// print-ready document for the PDF and the Word version. Built into src/contract/kit.generated.ts.
import { allScheduleRows, allValues, cleanDocument, fillScheduleRows, fillScheduleTable, fillTemplate, type ContractInput, type ContractLang } from '../../src/lib/contract'
import { readPageSetup, type PageSetup } from '../../src/lib/pagesetup'
import { wordDocument } from '../../src/lib/word'

interface Job { html: string; input: ContractInput; lang: ContractLang; annexPage: boolean }
declare global {
  interface Window { ReactNativeWebView?: { postMessage(s: string): void }; komjeiFill: (job: Job) => void }
}

const post = (m: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(m))

function fill(j: Job) {
  const rows = fillScheduleRows(j.html, allScheduleRows(j.input, j.lang))
  return cleanDocument(fillTemplate(fillScheduleTable(rows, j.input, j.lang, j.annexPage), allValues(j.input, j.lang)), j.lang)
}

/** The document's page setup, applied to printing: its page size and margins on every page. */
function applyPrintSetup(d: Document, p: PageSetup) {
  d.getElementById('komjei-page')?.remove()
  const st = d.createElement('style')
  st.id = 'komjei-page'
  st.textContent = `@page{size:${p.wPx}px ${p.hPx}px;margin:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px}@media print{body{padding:0!important;max-width:none!important}}`
  d.head.append(st)
}

window.komjeiFill = (job) => {
  try {
    const doc = fill(job)
    const frame = document.getElementById('doc') as HTMLIFrameElement
    const box = document.getElementById('box') as HTMLDivElement
    frame.onload = async () => {
      const d = frame.contentDocument
      if (!d) return post({ type: 'error', message: 'The contract could not be shown.' })
      const page = readPageSetup(d)
      frame.style.width = page.wPx + 'px'
      try { await d.fonts.ready } catch { /* draw with what is loaded */ }
      const height = Math.max(d.documentElement.scrollHeight, 400)
      const scale = Math.min(1, (window.innerWidth - 16) / page.wPx)
      frame.style.height = height + 'px'
      frame.style.transform = `scale(${scale})`
      box.style.height = height * scale + 'px'
      const word = wordDocument(doc, page)
      applyPrintSetup(d, page)
      post({ type: 'ready', page, height: height * scale + 16, print: '<!doctype html>' + d.documentElement.outerHTML, word })
    }
    frame.srcdoc = doc
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
post({ type: 'loaded' })
