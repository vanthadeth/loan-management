import type { PageSetup } from './pagesetup'

const PT_PER_PX = 0.75

/**
 * Turns a filled contract page into a Word document. Word opens HTML saved as .doc, keeping the
 * template's fonts, tables and colours; the page size, orientation and margins are written as a
 * Word section so the document follows the Google Doc's page setup.
 */
export function wordDocument(html: string, page: PageSetup): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // fonts are fetched by the browser only; Word uses the ones installed on the computer
  doc.querySelectorAll('style').forEach((st) => {
    st.textContent = (st.textContent ?? '').replace(/@import\s+url\([^)]*\)\s*;?/g, '')
  })
  doc.getElementById('komjei-page')?.remove()
  const pt = (px: number) => Math.round(px * PT_PER_PX * 10) / 10
  const landscape = page.wPx > page.hPx
  const style = doc.createElement('style')
  style.textContent =
    `@page WordSection1{size:${pt(page.wPx)}pt ${pt(page.hPx)}pt;${landscape ? 'mso-page-orientation:landscape;' : ''}` +
    `margin:${pt(page.top)}pt ${pt(page.right)}pt ${pt(page.bottom)}pt ${pt(page.left)}pt;mso-header-margin:0pt;mso-footer-margin:0pt}` +
    'div.WordSection1{page:WordSection1}' +
    // the margins above replace the padding that Google's export puts on the page
    'body{margin:0;padding:0;max-width:none}'
  doc.head.append(style)
  const section = doc.createElement('div')
  section.className = 'WordSection1'
  section.append(...Array.from(doc.body.childNodes))
  doc.body.append(section)
  doc.documentElement.setAttribute('xmlns:o', 'urn:schemas-microsoft-com:office:office')
  doc.documentElement.setAttribute('xmlns:w', 'urn:schemas-microsoft-com:office:word')
  doc.documentElement.setAttribute('xmlns', 'http://www.w3.org/TR/REC-html40')
  const word = doc.createComment('[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]')
  doc.head.prepend(word)
  if (!doc.querySelector('meta[charset]')) {
    const m = doc.createElement('meta')
    m.setAttribute('charset', 'utf-8')
    doc.head.prepend(m)
  }
  return '<!doctype html>' + doc.documentElement.outerHTML
}

/** Saves text as a file in the browser. */
export function saveBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob(['﻿', content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
